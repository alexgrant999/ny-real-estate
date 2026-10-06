import { getSql } from '../db';
import type { Listing, ListingFilters, PriceHistoryEntry, DealPreset } from '../types';
import { DEFAULT_SALE_CAP, DEFAULT_RENT_CAP } from '../config';
import { acresToSqft } from '../utils';

const BENCHMARK_JOIN = `
  LEFT JOIN neighborhood_benchmarks nb
    ON nb.neighborhood = l.neighborhood
    AND nb.region = l.region
    AND nb.bedrooms IS NULL
`;

// SQLite's date('now', '-N days'): a UTC 'YYYY-MM-DD' string, compared as text.
const daysAgo = (n: number) => `to_char((now() AT TIME ZONE 'UTC') - interval '${n} days', 'YYYY-MM-DD')`;

export async function getListings(filters: ListingFilters): Promise<{ listings: Listing[]; total: number }> {
  const sql = getSql();
  const conditions: string[] = ["l.listing_status = 'for_sale'"];
  const params: (string | number)[] = [];
  // Appends a value and returns its $n placeholder. Numbers are cast to float8 so a
  // fractional or NaN query param filters instead of failing an INTEGER cast, as in SQLite.
  const p = (value: string | number, cast = '') => {
    params.push(value);
    return `$${params.length}${cast}`;
  };
  const num = (value: number) => p(value, '::float8');

  // Category filter: default shows both with price caps
  if (filters.category === 'sale') {
    conditions.push("l.listing_category = 'sale'");
  } else if (filters.category === 'rental') {
    conditions.push("l.listing_category = 'rental'");
  } else if (!filters.noPriceCap) {
    conditions.push(
      `((l.listing_category = 'rental' AND l.price <= ${num(DEFAULT_RENT_CAP)}) OR (l.listing_category = 'sale' AND l.price <= ${num(DEFAULT_SALE_CAP)}))`
    );
  }

  if (filters.region) {
    conditions.push(`l.region = ${p(filters.region)}`);
  }
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    conditions.push(`l.neighborhood IN (${filters.neighborhoods.map(n => p(n)).join(',')})`);
  }
  if (filters.minPrice !== undefined) {
    conditions.push(`l.price >= ${num(filters.minPrice)}`);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(`l.price <= ${num(filters.maxPrice)}`);
  }
  if (filters.minBedrooms !== undefined) {
    conditions.push(`l.bedrooms >= ${num(filters.minBedrooms)}`);
  }
  if (filters.maxBedrooms !== undefined) {
    conditions.push(`l.bedrooms <= ${num(filters.maxBedrooms)}`);
  }
  if (filters.minDom !== undefined) {
    conditions.push(`l.days_on_market >= ${num(filters.minDom)}`);
  }
  if (filters.maxDom !== undefined) {
    conditions.push(`l.days_on_market <= ${num(filters.maxDom)}`);
  }
  if (filters.minAcres !== undefined && filters.minAcres > 0) {
    conditions.push(`l.lot_sqft >= ${num(acresToSqft(filters.minAcres))}`);
  }
  if (filters.priceReduced) {
    conditions.push('l.price_reduction_amount > 0');
  }
  if (filters.listingType) {
    conditions.push(`l.listing_type = ${p(filters.listingType)}`);
  }
  if (filters.swLat !== undefined && filters.swLng !== undefined && filters.neLat !== undefined && filters.neLng !== undefined) {
    conditions.push(
      `l.lat IS NOT NULL AND l.lat >= ${num(filters.swLat)} AND l.lat <= ${num(filters.neLat)} AND l.lng >= ${num(filters.swLng)} AND l.lng <= ${num(filters.neLng)}`
    );
  }

  const whereClause = conditions.join(' AND ');

  const sortColumnMap: Record<string, string> = {
    price: 'l.price',
    dom: 'l.days_on_market',
    price_reduction_pct: 'l.price_reduction_pct',
    price_reduction_amount: 'l.price_reduction_amount',
    price_per_sqft: 'l.price_per_sqft',
    sqft: 'l.sqft',
    lot_sqft: 'l.lot_sqft',
  };
  const sortCol = sortColumnMap[filters.sortBy ?? 'price'] ?? 'l.price';
  const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';

  const listSql = `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    ${BENCHMARK_JOIN}
    WHERE ${whereClause}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST, l.id ASC
  `;

  const countSql = `SELECT COUNT(*)::int as count FROM listings l WHERE ${whereClause}`;

  const [listings, [{ count }]] = await Promise.all([
    sql.unsafe<Listing[]>(listSql, params),
    sql.unsafe<{ count: number }[]>(countSql, params),
  ]);

  return { listings, total: count };
}

export async function getListingById(id: number): Promise<Listing | null> {
  if (!Number.isInteger(id)) return null;
  const [row] = await getSql().unsafe<Listing[]>(`
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    ${BENCHMARK_JOIN}
    WHERE l.id = $1
  `, [id]);
  return row ?? null;
}

export async function getListingsByIds(ids: number[]): Promise<Listing[]> {
  const validIds = ids.filter(id => Number.isInteger(id));
  if (validIds.length === 0) return [];
  const placeholders = validIds.map((_, i) => `$${i + 1}`).join(',');
  return getSql().unsafe<Listing[]>(`
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l
    ${BENCHMARK_JOIN}
    WHERE l.id IN (${placeholders})
  `, validIds);
}

export async function getPriceHistory(listingId: number): Promise<PriceHistoryEntry[]> {
  if (!Number.isInteger(listingId)) return [];
  const sql = getSql();
  return sql<PriceHistoryEntry[]>`
    SELECT * FROM price_history
    WHERE listing_id = ${listingId}
    ORDER BY event_date ASC
  `;
}

/** Towns present in the data, for the filter dropdown. */
export async function getDistinctTowns(category?: string): Promise<{ neighborhood: string; region: string }[]> {
  const sql = getSql();
  if (category && category !== 'all') {
    return sql<{ neighborhood: string; region: string }[]>`
      SELECT DISTINCT neighborhood, region FROM listings
      WHERE listing_status = 'for_sale' AND listing_category = ${category}
      ORDER BY region, neighborhood
    `;
  }
  return sql<{ neighborhood: string; region: string }[]>`
    SELECT DISTINCT neighborhood, region FROM listings
    WHERE listing_status = 'for_sale'
    ORDER BY region, neighborhood
  `;
}

export interface ListingStats {
  total_listings: number;
  sale_count: number;
  rental_count: number;
  price_reduced_count: number;
  stale_count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

export async function getListingStats(): Promise<ListingStats> {
  const sql = getSql();
  // SUM over integers is bigint and AVG is numeric, which postgres.js returns as strings.
  const [row] = await sql<ListingStats[]>`
    SELECT
      COUNT(*)::int as total_listings,
      SUM(CASE WHEN listing_category = 'sale' THEN 1 ELSE 0 END)::int as sale_count,
      SUM(CASE WHEN listing_category = 'rental' THEN 1 ELSE 0 END)::int as rental_count,
      SUM(CASE WHEN price_reduction_amount > 0 THEN 1 ELSE 0 END)::int as price_reduced_count,
      SUM(CASE WHEN days_on_market >= 60 THEN 1 ELSE 0 END)::int as stale_count,
      AVG(price)::float8 as avg_price,
      MIN(price) as min_price,
      MAX(price) as max_price
    FROM listings
    WHERE listing_status = 'for_sale'
  `;
  return row;
}

const DEAL_QUERIES: Record<DealPreset, string> = {
  price_reduced_7d: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l ${BENCHMARK_JOIN}
    WHERE l.listing_status = 'for_sale'
      AND l.last_price_reduction_date >= ${daysAgo(7)}
    ORDER BY l.price_reduction_pct DESC NULLS LAST
  `,
  price_reduced_30d: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l ${BENCHMARK_JOIN}
    WHERE l.listing_status = 'for_sale'
      AND l.last_price_reduction_date >= ${daysAgo(30)}
    ORDER BY l.price_reduction_pct DESC NULLS LAST
  `,
  dom_over_60: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l ${BENCHMARK_JOIN}
    WHERE l.listing_status = 'for_sale' AND l.days_on_market >= 60
    ORDER BY l.days_on_market DESC NULLS LAST
  `,
  dom_over_90: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l ${BENCHMARK_JOIN}
    WHERE l.listing_status = 'for_sale' AND l.days_on_market >= 90
    ORDER BY l.days_on_market DESC NULLS LAST
  `,
  // ROUND(x, 1) only exists for numeric, and numeric comes back as a string, hence ::float8.
  ppsf_below_median: `
    SELECT l.*,
           nb.median_ppsf as neighborhood_median_ppsf,
           ROUND(((nb.median_ppsf - l.price_per_sqft) / nb.median_ppsf * 100)::numeric, 1)::float8 as ppsf_discount_pct
    FROM listings l
    JOIN neighborhood_benchmarks nb
      ON nb.neighborhood = l.neighborhood
      AND nb.region = l.region
      AND nb.bedrooms IS NULL
    WHERE l.listing_status = 'for_sale'
      AND l.listing_category = 'sale'
      AND l.price_per_sqft IS NOT NULL
      AND l.price_per_sqft < nb.median_ppsf
    ORDER BY ppsf_discount_pct DESC NULLS LAST
  `,
  big_reductions: `
    SELECT l.*, nb.median_ppsf as neighborhood_median_ppsf
    FROM listings l ${BENCHMARK_JOIN}
    WHERE l.listing_status = 'for_sale' AND l.price_reduction_pct >= 5
    ORDER BY l.price_reduction_pct DESC NULLS LAST
  `,
};

export async function getDealListings(preset: DealPreset): Promise<Listing[]> {
  const query = DEAL_QUERIES[preset];
  if (!query) return [];
  return getSql().unsafe<Listing[]>(query);
}

export async function getDealCounts(): Promise<Record<DealPreset, number>> {
  const sql = getSql();
  const entries = await Promise.all(
    Object.entries(DEAL_QUERIES).map(async ([preset, query]) => {
      const [row] = await sql.unsafe<{ count: number }[]>(`SELECT COUNT(*)::int as count FROM (${query}) d`);
      return [preset, row.count] as const;
    })
  );
  return Object.fromEntries(entries) as Record<DealPreset, number>;
}
