/**
 * Imports active Redfin sale listings for the Catskills towns into SQLite (rentals opt-in).
 *
 * Redfin serves its search results as JSON to ordinary browsers, keyed by zip code
 * region. No API key is needed. Every town in src/lib/areas.ts carries the Redfin
 * region id for its zip.
 *
 * Usage:
 *   npx tsx scripts/scrape-redfin.ts                          # all active towns, sales only
 *   npx tsx scripts/scrape-redfin.ts --towns woodstock,hunter # specific towns (slugs)
 *   npx tsx scripts/scrape-redfin.ts --region tannersville    # one region only
 *   npx tsx scripts/scrape-redfin.ts --all-towns              # every town, including inactive ones
 *   npx tsx scripts/scrape-redfin.ts --rentals | --rental-only # include rentals / rentals only
 *   npx tsx scripts/scrape-redfin.ts --no-details             # skip per-listing price history / tax fetch
 *   npx tsx scripts/scrape-redfin.ts --details-limit 40       # cap detail fetches per run (default 120)
 *   npx tsx scripts/scrape-redfin.ts --debug                  # dump raw payloads to data/
 *
 * Per run:
 *   1. one search request per town per category (~1.5s apart)
 *   2. upsert listings, record price changes between runs as price_history events
 *   3. for new sale listings, fetch the detail page JSON for the MLS price history and taxes
 *   4. mark listings that disappeared from a scraped town as off_market
 *   5. roll price history up into the reduction columns, recompute town benchmarks,
 *      and take this month's market snapshot
 *
 * Behind an HTTP proxy (HTTPS_PROXY set), run with NODE_USE_ENV_PROXY=1 so Node's fetch
 * honours it; by default Node connects directly and ignores the proxy variables.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { applySchema } from '../src/lib/schema';
import { TOWNS, regionFor, townNameFor, type Town, type Region } from '../src/lib/areas';
import { SCRAPER_USER_AGENT } from '../src/lib/config';
import type { ListingType } from '../src/lib/types';
import { rollupPriceHistory } from './rollup-price-history';
import { computeBenchmarks } from './compute-benchmarks';
import { snapshotMarket } from './snapshot-market';

// ─── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const withRentals = flag('--rentals');
const rentalOnly = flag('--rental-only');
const noDetails = flag('--no-details');
const debugMode = flag('--debug');
const detailsLimit = parseInt(opt('--details-limit') ?? '120');
const externalLogId = opt('--log-id') ? parseInt(opt('--log-id')!) : null;
const townsFilter = opt('--towns')?.split(',').map(s => s.trim()).filter(Boolean) ?? null;
const regionFilter = opt('--region')?.toLowerCase() ?? null;
const allTowns = flag('--all-towns');

function getTowns(): Town[] {
  if (townsFilter) {
    const picked = townsFilter.map(slug => TOWNS.find(t => t.slug === slug)).filter((t): t is Town => !!t);
    const unknown = townsFilter.filter(slug => !TOWNS.some(t => t.slug === slug));
    if (unknown.length) console.warn(`Unknown town slug(s) ignored: ${unknown.join(', ')}`);
    return picked;
  }
  let towns = allTowns ? TOWNS : TOWNS.filter(t => t.active);
  if (regionFilter) towns = towns.filter(t => t.region.toLowerCase() === regionFilter);
  return towns;
}

// ─── DB ───────────────────────────────────────────────────────────
const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
applySchema(db);

const upsert = db.prepare(`
  INSERT INTO listings (
    external_id, source, address, unit, neighborhood, region, zip_code, lat, lng,
    bedrooms, bathrooms, sqft, lot_sqft, year_built, price, price_per_sqft, hoa_fee, tax_annual,
    listing_status, listing_type, listing_category, days_on_market, listed_date,
    description, image_url, listing_url, available_at, off_market_at,
    first_seen_at, imported_at
  ) VALUES (
    @external_id, 'redfin', @address, @unit, @neighborhood, @region, @zip_code, @lat, @lng,
    @bedrooms, @bathrooms, @sqft, @lot_sqft, @year_built, @price, @price_per_sqft, @hoa_fee, NULL,
    'for_sale', @listing_type, @listing_category, @days_on_market, @listed_date,
    @description, @image_url, @listing_url, @available_at, NULL,
    @first_seen_at, @imported_at
  )
  ON CONFLICT(external_id) DO UPDATE SET
    address         = excluded.address,
    unit            = COALESCE(excluded.unit, listings.unit),
    neighborhood    = CASE WHEN excluded.neighborhood != 'Unknown' THEN excluded.neighborhood ELSE listings.neighborhood END,
    region          = excluded.region,
    zip_code        = CASE WHEN excluded.zip_code != '' THEN excluded.zip_code ELSE listings.zip_code END,
    lat             = COALESCE(excluded.lat, listings.lat),
    lng             = COALESCE(excluded.lng, listings.lng),
    bedrooms        = COALESCE(excluded.bedrooms, listings.bedrooms),
    bathrooms       = COALESCE(excluded.bathrooms, listings.bathrooms),
    sqft            = COALESCE(excluded.sqft, listings.sqft),
    lot_sqft        = COALESCE(excluded.lot_sqft, listings.lot_sqft),
    year_built      = COALESCE(excluded.year_built, listings.year_built),
    price           = excluded.price,
    price_per_sqft  = excluded.price_per_sqft,
    hoa_fee         = COALESCE(excluded.hoa_fee, listings.hoa_fee),
    listing_status  = 'for_sale',
    off_market_at   = NULL,
    listing_type    = COALESCE(excluded.listing_type, listings.listing_type),
    days_on_market  = excluded.days_on_market,
    listed_date     = COALESCE(excluded.listed_date, listings.listed_date),
    description     = COALESCE(excluded.description, listings.description),
    image_url       = COALESCE(excluded.image_url, listings.image_url),
    listing_url     = excluded.listing_url,
    available_at    = COALESCE(excluded.available_at, listings.available_at),
    imported_at     = excluded.imported_at
`);

const getExisting = db.prepare(
  'SELECT id, price, first_seen_at FROM listings WHERE external_id = ?'
);
const insertHistory = db.prepare(`
  INSERT OR IGNORE INTO price_history (listing_id, price, event_type, event_date)
  VALUES (@listing_id, @price, @event_type, @event_date)
`);
const countHistory = db.prepare('SELECT COUNT(*) as n FROM price_history WHERE listing_id = ?');
const markDetails = db.prepare('UPDATE listings SET tax_annual = COALESCE(@tax, tax_annual), details_fetched_at = @at WHERE id = @id');
const dropListedEvents = db.prepare("DELETE FROM price_history WHERE listing_id = ? AND event_type = 'listed'");
// Active Redfin sale listings whose detail payload has never been fetched: new ones first,
// then anything a previous run skipped because of --details-limit.
const detailCandidates = db.prepare(`
  SELECT id, external_id, price, listed_date FROM listings
  WHERE source = 'redfin' AND listing_category = 'sale' AND listing_status = 'for_sale'
    AND details_fetched_at IS NULL
  ORDER BY first_seen_at DESC, id DESC
`);

// ─── HTTP ─────────────────────────────────────────────────────────
const BASE = 'https://www.redfin.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const REQUEST_GAP_MS = 1500;

async function redfinJson(url: string): Promise<unknown> {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': SCRAPER_USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `${BASE}/`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      const wait = attempt * 20_000;
      console.log(`${lastError}, waiting ${wait / 1000}s (retry ${attempt}/3)...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    // Redfin prefixes JSON responses with "{}&&" as an anti-hijacking guard.
    const body = text.startsWith('{}&&') ? text.slice(4) : text;
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Non-JSON response (${text.slice(0, 80).replace(/\s+/g, ' ')}…)`);
    }
  }
  throw new Error(`Gave up after 3 attempts: ${lastError}`);
}

// ─── Parsing ──────────────────────────────────────────────────────
type Dict = Record<string, unknown>;
const val = <T>(x: unknown): T | null => {
  if (x && typeof x === 'object' && 'value' in (x as Dict)) return ((x as Dict).value as T) ?? null;
  return (x as T) ?? null;
};
const num = (x: unknown): number | null => {
  const v = val<unknown>(x);
  const n = Number(v);
  return v === null || v === '' || Number.isNaN(n) ? null : n;
};
const str = (x: unknown): string | null => {
  const v = val<unknown>(x);
  // Wrapper objects sometimes arrive without a value key; never stringify those.
  if (v === null || v === undefined || typeof v === 'object') return null;
  return String(v);
};

// Redfin's uiPropertyType codes, confirmed against the CSV export's labels.
function saleType(uiType: number | null, propertyType: number | null): ListingType {
  if (propertyType === 3) return 'Condo';
  if (propertyType === 13) return 'Townhouse';
  switch (uiType) {
    case 1: return 'House';
    case 2: return 'Condo';
    case 3: return 'Townhouse';
    case 4: return 'Multi-family';
    case 5: return 'Land';
    case 7: return 'Manufactured';
    case 8: return 'Co-op';
    default: return 'Other';
  }
}

function rentalType(propertyType: number | null, hasUnit: boolean): ListingType {
  if (hasUnit) return 'Apartment';
  if (propertyType === 6) return 'House';
  if (propertyType === 3) return 'Condo';
  if (propertyType === 13) return 'Townhouse';
  return 'Apartment';
}

interface Scraped {
  external_id: string;
  address: string;
  unit: string | null;
  city: string | null;
  zip: string;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  price: number;
  hoa_fee: number | null;
  listing_type: ListingType;
  listing_category: 'sale' | 'rental';
  dom: number | null;
  description: string | null;
  image_url: string | null;
  listing_url: string;
  available_at: string | null;
  // for the details fetch
  propertyId: string | null;
  listingId: string | null;
}

function photoUrl(dataSourceId: unknown, mlsId: unknown): string | null {
  const ds = num(dataSourceId);
  const id = str(mlsId);
  if (!ds || !id || !/^\d+$/.test(id)) return null;
  return `https://ssl.cdn-redfin.com/photo/${ds}/mbphotov3/${id.slice(-3)}/genMid.${id}_0.jpg`;
}

function parseSaleHome(h: Dict): Scraped | null {
  const propertyId = str(h.propertyId);
  const price = num(h.price);
  let address = str(h.streetLine);
  if (!propertyId || !price || !address) return null;
  // streetLine usually already carries the unit; keep it out of the unit column.
  let unit = str(h.unitNumber);
  if (unit && /,\s*[A-Z]{2}\b/.test(unit)) unit = null; // city/state blobs Redfin sometimes puts here
  if (unit) {
    const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    address = address.replace(new RegExp(`\\s*#?${esc}$`, 'i'), '').trim() || address;
    unit = unit.replace(/^(Apt|Unit|Ste|#)\s*/i, '') || null;
  }
  const latLong = val<{ latitude?: number; longitude?: number }>(h.latLong);
  const urlPath = str(h.url) ?? '';
  return {
    external_id: `rf-${propertyId}`,
    address,
    unit,
    city: str(h.city),
    zip: str(h.zip) ?? str(h.postalCode) ?? '',
    lat: latLong?.latitude ?? null,
    lng: latLong?.longitude ?? null,
    bedrooms: num(h.beds),
    bathrooms: num(h.baths),
    sqft: num(h.sqFt),
    lot_sqft: num(h.lotSize),
    year_built: num(h.yearBuilt),
    price,
    hoa_fee: num(h.hoa),
    listing_type: saleType(num(h.uiPropertyType), num(h.propertyType)),
    listing_category: 'sale',
    dom: num(h.dom),
    description: str(h.listingRemarks),
    image_url: photoUrl(h.dataSourceId, h.mlsId),
    listing_url: urlPath.startsWith('http') ? urlPath : `${BASE}${urlPath}`,
    available_at: null,
    propertyId,
    listingId: str(h.listingId),
  };
}

function parseRentalHome(h: Dict): Scraped | null {
  const home = (h.homeData ?? {}) as Dict;
  const ext = (h.rentalExtension ?? {}) as Dict;
  const addr = (home.addressInfo ?? {}) as Dict;
  const propertyId = str(home.propertyId);
  const rentalId = str(ext.rentalId) ?? propertyId;
  const price = num((ext.rentPriceRange as Dict | undefined)?.min);
  let address = str(addr.formattedStreetLine) ?? '';
  if (!rentalId || !price || !address) return null;

  // "5 Rock City Rd Apt 3A" → address "5 Rock City Rd", unit "3A"
  let unit = str(addr.unitNumber);
  const m = address.match(/^(.*?)\s+(?:Apt|Unit|Ste|#)\s*([\w-]+)$/i);
  if (m) { address = m[1]; unit = unit ? unit.replace(/^(Apt|Unit|Ste|#)\s*/i, '') : m[2]; }

  const centroid = ((addr.centroid as Dict | undefined)?.centroid ?? {}) as Dict;
  const urlPath = str(home.url) ?? '';
  const bedMin = num((ext.bedRange as Dict | undefined)?.min);
  return {
    external_id: `rf-rent-${rentalId}`,
    address,
    unit,
    city: str(addr.city),
    zip: str(addr.zip) ?? '',
    lat: num(centroid.latitude),
    lng: num(centroid.longitude),
    bedrooms: bedMin,
    bathrooms: num((ext.bathRange as Dict | undefined)?.min),
    sqft: num((ext.sqftRange as Dict | undefined)?.min),
    lot_sqft: null,
    year_built: null,
    price,
    hoa_fee: null,
    listing_type: rentalType(num(home.propertyType), !!unit),
    listing_category: 'rental',
    dom: null,
    description: null,
    image_url: null,
    listing_url: urlPath.startsWith('http') ? urlPath : `${BASE}${urlPath}`,
    available_at: null,
    propertyId,
    listingId: null,
  };
}

// ─── Search ───────────────────────────────────────────────────────
const SEARCH_PARAMS = 'al=1&num_homes=350&ord=redfin-recommended-asc&sf=1,2,3,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8';

async function searchTown(town: Town, category: 'sale' | 'rental'): Promise<Scraped[]> {
  const out: Scraped[] = [];
  for (let page = 1; page <= 4; page++) {
    const url = category === 'sale'
      ? `${BASE}/stingray/api/gis?${SEARCH_PARAMS}&page_number=${page}&region_id=${town.redfinRegionId}&region_type=2`
      : `${BASE}/stingray/api/v1/search/rentals?${SEARCH_PARAMS}&isRentals=true&includeKeyFacts=true&page_number=${page}&region_id=${town.redfinRegionId}&region_type=2`;
    const data = await redfinJson(url) as Dict;
    if (debugMode) {
      fs.writeFileSync(path.join(process.cwd(), 'data', `debug-redfin-${town.slug}-${category}-p${page}.json`), JSON.stringify(data, null, 2));
    }
    const homes = (category === 'sale'
      ? ((data.payload as Dict | undefined)?.homes ?? [])
      : (data.homes ?? (data.payload as Dict | undefined)?.homes ?? [])) as Dict[];
    for (const h of homes) {
      const parsed = category === 'sale' ? parseSaleHome(h) : parseRentalHome(h);
      if (parsed) out.push(parsed);
    }
    if (homes.length < 350) break;
    await sleep(REQUEST_GAP_MS);
  }
  return out;
}

// ─── Details: MLS price history + taxes ───────────────────────────
interface HistoryEvent { eventDescription?: string; price?: number; eventDate?: number }

async function fetchDetails(propertyId: string, listingId: string | null): Promise<{ events: HistoryEvent[]; tax: number | null }> {
  const params = new URLSearchParams({ propertyId, accessLevel: '1' });
  if (listingId) params.set('listingId', listingId);
  const data = await redfinJson(`${BASE}/stingray/api/home/details/belowTheFold?${params}`) as Dict;
  const payload = (data.payload ?? {}) as Dict;
  const events = ((payload.propertyHistoryInfo as Dict | undefined)?.events ?? []) as HistoryEvent[];
  const taxInfo = ((payload.publicRecordsInfo as Dict | undefined)?.taxInfo ?? {}) as Dict;
  const tax = num(taxInfo.taxesDue);
  return { events, tax: tax ? Math.round(tax) : null };
}

/** Keep the current listing cycle: everything from the most recent "Listed" event onward. */
function currentCycle(events: HistoryEvent[]): { type: 'listed' | 'reduced' | 'increased' | 'relisted'; price: number; date: string }[] {
  const dated = events
    .filter(e => e.eventDate && e.price)
    .sort((a, b) => (a.eventDate! - b.eventDate!));
  const lastListed = dated.map(e => e.eventDescription ?? '').lastIndexOf('Listed');
  const cycle = lastListed >= 0 ? dated.slice(lastListed) : dated.filter(e => /Price Changed|Listed|Relisted/i.test(e.eventDescription ?? ''));
  const out: { type: 'listed' | 'reduced' | 'increased' | 'relisted'; price: number; date: string }[] = [];
  let prev: number | null = null;
  for (const e of cycle) {
    const desc = e.eventDescription ?? '';
    const date = new Date(e.eventDate!).toISOString().slice(0, 10);
    let type: 'listed' | 'reduced' | 'increased' | 'relisted' | null = null;
    if (/^Listed/i.test(desc)) type = 'listed';
    else if (/Relisted/i.test(desc)) type = 'relisted';
    else if (/Price Changed/i.test(desc) && prev !== null && e.price !== prev) type = e.price! < prev ? 'reduced' : 'increased';
    if (type) {
      out.push({ type, price: e.price!, date });
      prev = e.price!;
    }
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  const logId = externalLogId ?? Number(db.prepare(
    `INSERT INTO import_logs (source, status) VALUES ('redfin', 'running')`
  ).run().lastInsertRowid);

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const towns = getTowns();
  if (towns.length === 0) throw new Error('No towns selected');

  const categories: ('sale' | 'rental')[] = [];
  if (!rentalOnly) categories.push('sale');
  if (rentalOnly || withRentals) categories.push('rental');

  console.log(`Importing ${towns.length} town(s): ${towns.map(t => t.slug).join(', ')}`);
  console.log(`Categories: ${categories.join(', ')}\n`);

  let added = 0, updated = 0, priceChanges = 0;
  const newSales: { id: number; propertyId: string; listingId: string | null; price: number; listedDate: string | null }[] = [];
  // Per category: which zips were scraped successfully and every external id seen.
  const seen: Record<string, Set<string>> = { sale: new Set(), rental: new Set() };
  const scrapedZips: Record<string, Set<string>> = { sale: new Set(), rental: new Set() };

  for (const category of categories) {
    console.log(`── ${category === 'sale' ? 'For sale' : 'Rentals'} ──`);
    for (const town of towns) {
      process.stdout.write(`  ${town.name} (${town.zip})... `);
      let listings: Scraped[];
      try {
        listings = await searchTown(town, category);
      } catch (e) {
        console.log(`FAILED: ${(e as Error).message}`);
        await sleep(REQUEST_GAP_MS);
        continue;
      }
      console.log(`${listings.length} listings`);
      scrapedZips[category].add(town.zip);

      const apply = db.transaction(() => {
        for (const l of listings) {
          seen[category].add(l.external_id);
          const existing = getExisting.get(l.external_id) as { id: number; price: number; first_seen_at: string | null } | undefined;
          const firstSeenAt = existing?.first_seen_at ?? today;
          const dom = l.dom ?? Math.round((Date.now() - new Date(firstSeenAt).getTime()) / 86_400_000);
          const listedDate = l.dom !== null
            ? new Date(Date.now() - l.dom * 86_400_000).toISOString().slice(0, 10)
            : firstSeenAt;
          const region: Region = regionFor(l.zip, l.city) ?? town.region;

          upsert.run({
            external_id: l.external_id,
            address: l.address,
            unit: l.unit,
            neighborhood: townNameFor(l.zip, l.city),
            region,
            zip_code: l.zip || town.zip,
            lat: l.lat,
            lng: l.lng,
            bedrooms: l.bedrooms,
            bathrooms: l.bathrooms,
            sqft: l.sqft,
            lot_sqft: l.lot_sqft,
            year_built: l.year_built,
            price: l.price,
            price_per_sqft: category === 'sale' && l.sqft && l.listing_type !== 'Land' ? Math.round(l.price / l.sqft) : null,
            hoa_fee: l.hoa_fee,
            listing_type: l.listing_type,
            listing_category: category,
            days_on_market: dom,
            listed_date: listedDate,
            description: l.description,
            image_url: l.image_url,
            listing_url: l.listing_url,
            available_at: l.available_at,
            first_seen_at: firstSeenAt,
            imported_at: now,
          });

          const row = getExisting.get(l.external_id) as { id: number; price: number; first_seen_at: string | null };
          if (!existing) {
            added++;
            if (category === 'sale' && l.propertyId) {
              newSales.push({ id: row.id, propertyId: l.propertyId, listingId: l.listingId, price: l.price, listedDate });
            } else {
              insertHistory.run({ listing_id: row.id, price: l.price, event_type: 'listed', event_date: listedDate });
            }
          } else {
            updated++;
            if (l.price !== existing.price) {
              const eventType = l.price < existing.price ? 'reduced' : 'increased';
              insertHistory.run({ listing_id: row.id, price: l.price, event_type: eventType, event_date: today });
              priceChanges++;
            }
          }
        }
      });
      apply();
      await sleep(REQUEST_GAP_MS);
    }
  }

  // ── Details: MLS price history + taxes ─────────────────────────
  // Every new sale listing gets a "listed" event right away so the chart has a start;
  // the detail fetch then replaces it with the MLS history when it gets to that listing.
  for (const n of newSales) {
    insertHistory.run({ listing_id: n.id, price: n.price, event_type: 'listed', event_date: n.listedDate ?? today });
  }
  const listingIds = new Map(newSales.map(n => [n.id, n.listingId]));
  const candidates = noDetails ? [] : (detailCandidates.all() as { id: number; external_id: string; price: number; listed_date: string | null }[]);
  const batch = candidates.slice(0, detailsLimit);
  if (batch.length) {
    console.log(`\n── Price history + taxes for ${batch.length} of ${candidates.length} listings without details ──`);
    for (const c of batch) {
      const propertyId = c.external_id.replace(/^rf-/, '');
      process.stdout.write(`  ${propertyId}... `);
      try {
        const { events, tax } = await fetchDetails(propertyId, listingIds.get(c.id) ?? null);
        const cycle = currentCycle(events);
        db.transaction(() => {
          if (cycle.some(ev => ev.type === 'listed')) dropListedEvents.run(c.id);
          for (const ev of cycle) insertHistory.run({ listing_id: c.id, price: ev.price, event_type: ev.type, event_date: ev.date });
          const { n: have } = countHistory.get(c.id) as { n: number };
          if (have === 0) insertHistory.run({ listing_id: c.id, price: c.price, event_type: 'listed', event_date: c.listed_date ?? today });
          markDetails.run({ tax, at: now, id: c.id });
        })();
        console.log(`${cycle.length} events${tax ? `, tax $${tax.toLocaleString()}` : ''}`);
      } catch (e) {
        console.log(`FAILED: ${(e as Error).message}`);
      }
      await sleep(REQUEST_GAP_MS);
    }
    if (candidates.length > batch.length) {
      console.log(`  ${candidates.length - batch.length} listings still without details; the next run continues from there (raise --details-limit to do more per run).`);
    }
  }

  // ── Off-market: active rows in scraped zips that no longer appear ─
  let offMarket = 0;
  for (const category of categories) {
    const zips = [...scrapedZips[category]];
    if (zips.length === 0) continue;
    const rows = db.prepare(`
      SELECT id, external_id FROM listings
      WHERE source = 'redfin' AND listing_category = ? AND listing_status = 'for_sale'
        AND zip_code IN (${zips.map(() => '?').join(',')})
    `).all(category, ...zips) as { id: number; external_id: string }[];
    const gone = rows.filter(r => !seen[category].has(r.external_id));
    const mark = db.prepare(`UPDATE listings SET listing_status = 'off_market', off_market_at = ? WHERE id = ?`);
    db.transaction(() => { for (const g of gone) mark.run(today, g.id); })();
    offMarket += gone.length;
  }

  // ── Derived data ───────────────────────────────────────────────
  const { fromHistory, fromReported } = rollupPriceHistory(db);
  const benchmarks = computeBenchmarks(db);
  const snapshotRows = snapshotMarket(db);

  db.prepare(
    `UPDATE import_logs SET status = 'success', listings_added = ?, listings_updated = ?, completed_at = datetime('now') WHERE id = ?`
  ).run(added, updated, logId);

  console.log(`\nPrice changes this run: ${priceChanges} · rolled up ${fromHistory} from history, ${fromReported} from reported deltas`);
  console.log(`Off market: ${offMarket} · benchmarks: ${benchmarks} towns · market snapshot: ${snapshotRows} rows`);
  console.log(`✓ Import complete — ${added} new, ${updated} updated`);
  db.close();
}

main().catch(e => {
  console.error('Fatal:', (e as Error).message);
  try {
    if (externalLogId) {
      db.prepare(`UPDATE import_logs SET status = 'error', error_message = ?, completed_at = datetime('now') WHERE id = ?`)
        .run((e as Error).message, externalLogId);
    }
  } finally {
    db.close();
  }
  process.exit(1);
});
