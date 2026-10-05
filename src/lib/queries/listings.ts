import { getDb } from '../db';
import type { Listing, ListingFilters, PriceHistoryEntry, DealPreset } from '../types';
import { AREA_ALIASES, expandArea } from '../neighborhoods';

export function getListings(filters: ListingFilters): { listings: Listing[]; total: number } {
  const db = getDb();
  const conditions: string[] = ["l.listing_status = 'for_sale'"];
  const params: unknown[] = [];

  // Category filter — default shows both with price caps
  if (filters.category === 'sale') {
    conditions.push("l.listing_category = 'sale'");
  } else if (filters.category === 'rental') {
    conditions.push("l.listing_category = 'rental'");
  } else if (!filters.noPriceCap) {
    // Default "all": rentals < $4k, sales < $1.3M
    conditions.push(
      "((l.listing_category = 'rental' AND l.price <= 4000) OR (l.listing_category = 'sale' AND l.price <= 1300000))"
    );
  }

  if (filters.borough) {
    conditions.push('l.borough = ?');
    params.push(filters.borough);
  }
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    const names = filters.neighborhoods.flatMap(expandArea);
    conditions.push(`l.neighborhood IN (${names.map(() => '?').join(',')})`);
    params.push(...names);
  }
  if (filters.minPrice !== undefined) {
    conditions.push('l.price >= ?');
    params.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push('l.price <= ?');
    params.push(filters.maxPrice);
  }
  if (filters.minBedrooms !== undefined) {
    conditions.push('l.bedrooms >= ?');
    params.push(filters.minBedrooms);
  }
  if (filters.maxBedrooms !== undefined) {
    conditions.push('l.bedrooms <= ?');
    params.push(filters.maxBedrooms);
  }
  if (filters.minDom !== undefined) {
    conditions.push('l.days_on_market >= ?');
    params.push(filters.minDom);
  }
  if (filters.maxDom !== undefined) {
    conditions.push('l.days_on_market <= ?');
    params.push(filters.maxDom);
  }
  if (filters.priceReduced) {
    conditions.push('l.price_reduction_amount > 0');
  }
  if (filters.listingType) {
    conditions.push('l.listing_type = ?');
    params.push(filters.listingType);
  }
  if (filters.swLat !== undefined && filters.swLng !== undefined && filters.neLat !== undefined && filters.neLng !== undefined) {
    conditions.push('l.lat IS NOT NULL AND l.lat >= ? AND l.lat <= ? AND l.lng >= ? AND l.lng <= ?');
    params.push(filters.swLat, filters.neLat, filters.swLng, filters.neLng);
  }

  const whereClause = conditions.join(' AND ');

  const sortColumnMap: Record<string, string> = {
    price: 'l.price',
    dom: 'l.days_on_market',
    price_reduction_pct: 'l.price_reduction_pct',
    price_reduction_amount: 'l.price_reduction_amount',
    price_per_sqft: 'l.price_per_sqft',
    sqft: 'l.sqft',
  };
  const sortCol = sortColumnMap[filters.sortBy ?? 'price'] ?? 'l.price';
  const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
  const pageSize = filters.pageSize ?? 50;
  const offset = ((filters.page ?? 1) - 1) * pageSize;

  const sql = `
    SELECT l.*,
           nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb
      ON nb.neighborhood = l.neighborhood
      AND nb.borough = l.borough
      AND nb.bedrooms IS NULL
    WHERE ${whereClause}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as count FROM listings l WHERE ${whereClause}
  `;

  const listings = db.prepare(sql).all(...params, pageSize, offset) as Listing[];
  const { count } = db.prepare(countSql).get(...params) as { count: number };

  return { listings, total: count };
}

export function getListingById(id: number): Listing | null {
  const db = getDb();
  return db.prepare(`
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb
      ON nb.neighborhood = l.neighborhood
      AND nb.borough = l.borough
      AND nb.bedrooms IS NULL
    WHERE l.id = ?
  `).get(id) as Listing | null;
}

export function getListingsByIds(ids: number[]): Listing[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb
      ON nb.neighborhood = l.neighborhood
      AND nb.borough = l.borough
      AND nb.bedrooms IS NULL
    WHERE l.id IN (${placeholders})
  `).all(...ids) as Listing[];
}

export function getPriceHistory(listingId: number): PriceHistoryEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM price_history
    WHERE listing_id = ?
    ORDER BY event_date ASC
  `).all(listingId) as PriceHistoryEntry[];
}

export function getDistinctNeighborhoods(category?: string): { neighborhood: string; borough: string }[] {
  const db = getDb();
  const rows = (category && category !== 'all'
    ? db.prepare(`
        SELECT DISTINCT neighborhood, borough FROM listings
        WHERE listing_status = 'for_sale' AND listing_category = ?
        ORDER BY borough, neighborhood
      `).all(category)
    : db.prepare(`
        SELECT DISTINCT neighborhood, borough FROM listings
        WHERE listing_status = 'for_sale'
        ORDER BY borough, neighborhood
      `).all()) as { neighborhood: string; borough: string }[];

  // Offer the parent area as an option whenever only its sub-neighborhoods are in the data
  const present = new Set(rows.map(r => r.neighborhood));
  const parents: { neighborhood: string; borough: string }[] = [];
  for (const [parent, children] of Object.entries(AREA_ALIASES)) {
    if (present.has(parent)) continue;
    const child = rows.find(r => children.includes(r.neighborhood));
    if (child) parents.push({ neighborhood: parent, borough: child.borough });
  }

  return [...rows, ...parents].sort(
    (a, b) => a.borough.localeCompare(b.borough) || a.neighborhood.localeCompare(b.neighborhood)
  );
}

export function getListingStats() {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_listings,
      SUM(CASE WHEN listing_category = 'sale' THEN 1 ELSE 0 END) as sale_count,
      SUM(CASE WHEN listing_category = 'rental' THEN 1 ELSE 0 END) as rental_count,
      SUM(CASE WHEN price_reduction_amount > 0 THEN 1 ELSE 0 END) as price_reduced_count,
      SUM(CASE WHEN days_on_market >= 60 THEN 1 ELSE 0 END) as stale_count,
      AVG(price) as avg_price,
      MIN(price) as min_price,
      MAX(price) as max_price
    FROM listings
    WHERE listing_status = 'for_sale'
  `).get() as {
    total_listings: number;
    sale_count: number;
    rental_count: number;
    price_reduced_count: number;
    stale_count: number;
    avg_price: number;
    min_price: number;
    max_price: number;
  };
  return stats;
}

const DEAL_QUERIES: Record<DealPreset, string> = {
  price_reduced_7d: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb ON nb.neighborhood = l.neighborhood AND nb.borough = l.borough AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale'
      AND l.last_price_reduction_date >= date('now', '-7 days')
    ORDER BY l.price_reduction_pct DESC NULLS LAST
  `,
  price_reduced_30d: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb ON nb.neighborhood = l.neighborhood AND nb.borough = l.borough AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale'
      AND l.last_price_reduction_date >= date('now', '-30 days')
    ORDER BY l.price_reduction_pct DESC NULLS LAST
  `,
  dom_over_60: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb ON nb.neighborhood = l.neighborhood AND nb.borough = l.borough AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale' AND l.days_on_market >= 60
    ORDER BY l.days_on_market DESC NULLS LAST
  `,
  dom_over_90: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb ON nb.neighborhood = l.neighborhood AND nb.borough = l.borough AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale' AND l.days_on_market >= 90
    ORDER BY l.days_on_market DESC NULLS LAST
  `,
  ppsf_below_median: `
    SELECT l.*,
           nb.median_ppsf as neighborhood_median_ppsf,
           ROUND(((nb.median_ppsf - l.price_per_sqft) / nb.median_ppsf * 100), 1) as ppsf_discount_pct
    FROM listings l
    JOIN neighborhood_benchmarks nb
      ON nb.neighborhood = l.neighborhood
      AND nb.borough = l.borough
      AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale'
      AND l.price_per_sqft IS NOT NULL
      AND l.price_per_sqft < nb.median_ppsf
    ORDER BY ppsf_discount_pct DESC NULLS LAST
  `,
  big_reductions: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    LEFT JOIN neighborhood_benchmarks nb ON nb.neighborhood = l.neighborhood AND nb.borough = l.borough AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale' AND l.price_reduction_pct >= 5
    ORDER BY l.price_reduction_pct DESC NULLS LAST
  `,
};

export function getDealListings(preset: DealPreset): Listing[] {
  const db = getDb();
  const sql = DEAL_QUERIES[preset];
  if (!sql) return [];
  return db.prepare(sql).all() as Listing[];
}

export function getDealCounts(): Record<DealPreset, number> {
  const db = getDb();
  const counts: Record<string, number> = {};
  for (const [preset, sql] of Object.entries(DEAL_QUERIES)) {
    const countSql = `SELECT COUNT(*) as count FROM (${sql})`;
    const row = db.prepare(countSql).get() as { count: number };
    counts[preset] = row.count;
  }
  return counts as Record<DealPreset, number>;
}
