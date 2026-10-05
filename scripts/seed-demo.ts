/**
 * Seeds data/apartments.db with fake Catskills listings so the app can be explored
 * without touching Redfin.
 *
 * For every active town in src/lib/areas.ts: 6–12 sale listings (houses, land,
 * multi-family, condos and townhouses, manufactured homes) and 2–5 rentals, with
 * Catskills street names, lots in acres, years built, taxes, and price cuts backed by
 * price_history rows. Then town benchmarks, this month's market snapshot, and eleven
 * synthesised months behind it so the Market page has lines to draw.
 *
 * The generator is seeded, so re-running replaces the same external_ids instead of
 * piling up new rows. Days on market are relative to today, so dates move with it.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts
 *   npx tsx scripts/seed-demo.ts --seed 7        # a different set of listings
 *   npx tsx scripts/seed-demo.ts --log-id 12     # finalise an existing import_logs row
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { applySchema } from '../src/lib/schema';
import { TOWNS, REGIONS, type Town, type Region } from '../src/lib/areas';
import { acresToSqft } from '../src/lib/utils';
import type { ListingType } from '../src/lib/types';
import { computeBenchmarks } from './compute-benchmarks';
import { snapshotMarket, currentPeriod } from './snapshot-market';

// ─── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const seed = parseInt(opt('--seed') ?? '20260101');
const externalLogId = opt('--log-id') ? parseInt(opt('--log-id')!) : null;

// ─── DB ───────────────────────────────────────────────────────────
const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
applySchema(db);

// ─── Random (seeded) ──────────────────────────────────────────────
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const randFloat = (min: number, max: number) => min + rand() * (max - min);
const chance = (p: number) => rand() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
function weighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r < 0) return value;
  }
  return entries[entries.length - 1][0];
}

// ─── Dates ────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const isoDaysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY_MS).toISOString().slice(0, 10);

// ─── Catskills flavour ────────────────────────────────────────────
const STREETS = [
  'Tinker St', 'Mink Hollow Rd', 'Glasco Tpke', 'Route 212', 'Ohayo Mountain Rd', 'Wittenberg Rd',
  'Platte Clove Rd', 'Spruceton Rd', 'Route 23A', 'Elka Park Rd', 'Bloomer Rd', 'Main St',
  'Clum Hill Rd', 'Schoharie Rd', 'Mountain Ave', 'Cold Brook Rd', 'Yerry Hill Rd', 'Zena Rd',
  'Chestnut Hill Rd', 'Deming St', 'Hill St', 'Lower Byrdcliffe Rd', 'West Saugerties Rd',
  'Plochmann Ln', 'Rock City Rd', 'Maverick Rd',
];

// Relative price level per town. Woodstock, Bearsville and the ski towns carry a premium;
// the Route 28 and mountaintop hamlets trade lower.
const TOWN_FACTOR: Record<string, number> = {
  'woodstock': 1.35, 'bearsville': 1.3, 'tannersville': 1.15, 'hunter': 1.2, 'windham': 1.25,
  'haines-falls': 1.05, 'elka-park': 1.1, 'phoenicia': 1.0, 'mount-tremper': 0.95, 'lake-hill': 0.95,
  'willow': 0.95, 'glenford': 0.9, 'west-hurley': 0.9, 'boiceville': 0.85, 'shokan': 0.85,
  'west-shokan': 0.85, 'palenville': 0.85, 'lanesville': 0.8, 'jewett': 0.8, 'hensonville': 0.8,
  'maplecrest': 0.8,
};
const factorFor = (town: Town) => TOWN_FACTOR[town.slug] ?? 0.85;

const HOUSE_STYLES = ['farmhouse', 'cape', 'ranch', 'contemporary', 'colonial', 'cabin', 'A-frame', 'chalet', 'cottage', 'post-and-beam'];
const LAND_KINDS = ['wooded', 'mostly wooded', 'open and wooded', 'sloped, wooded', 'level, partly cleared'];
const LAND_NOTES = ['Board of Health approval in hand', 'Survey on file', 'Perc test done', 'Driveway roughed in', 'Seasonal stream along the back line', 'Mountain views once cleared'];
const OTHER_KINDS = ['seasonal camp', 'converted barn', 'mixed-use building', 'former church', 'artist studio with living space', 'hunting cabin'];
const APT_UNITS = ['1', '2', '3', 'A', 'B', 'Upstairs', 'Lower'];

// ─── Listing model ────────────────────────────────────────────────
interface HistoryEvent { price: number; event_type: 'listed' | 'reduced'; event_date: string }

interface DemoListing {
  external_id: string;
  address: string;
  unit: string | null;
  neighborhood: string;
  region: Region;
  zip_code: string;
  lat: number;
  lng: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  price: number;
  price_per_sqft: number | null;
  hoa_fee: number | null;
  tax_annual: number | null;
  listing_type: ListingType;
  listing_category: 'sale' | 'rental';
  days_on_market: number;
  listed_date: string;
  last_price_reduction_date: string | null;
  original_price: number | null;
  price_reduction_amount: number | null;
  price_reduction_pct: number | null;
  description: string;
  available_at: string | null;
  first_seen_at: string;
  history: HistoryEvent[];
}

const bathsLabel = (b: number) => (Number.isInteger(b) ? `${b}` : b.toFixed(1));
const acresLabel = (a: number) => (a < 10 ? a.toFixed(2).replace(/\.?0+$/, '') : `${Math.round(a)}`);

/** Base fields shared by every listing: where it is and how long it has been listed. */
function base(town: Town, category: 'sale' | 'rental', n: number) {
  const dom = Math.floor(220 * Math.pow(rand(), 1.5));
  const listedDate = isoDaysFromNow(-dom);
  return {
    external_id: `demo-${category === 'sale' ? 'sale' : 'rent'}-${town.slug}-${n}`,
    address: `${randInt(5, 999)} ${pick(STREETS)}`,
    neighborhood: town.name,
    region: town.region,
    zip_code: town.zip,
    lat: Math.round((town.lat + randFloat(-0.02, 0.02)) * 1e5) / 1e5,
    lng: Math.round((town.lng + randFloat(-0.02, 0.02)) * 1e5) / 1e5,
    days_on_market: dom,
    listed_date: listedDate,
    first_seen_at: listedDate,
  };
}

function saleListing(town: Town, n: number): DemoListing {
  const f = factorFor(town);
  const type = weighted<ListingType>([
    ['House', 60], ['Land', 15], ['Multi-family', 8], ['Condo', 3], ['Townhouse', 3], ['Manufactured', 6], ['Other', 5],
  ]);
  const b = base(town, 'sale', n);
  const street = b.address.replace(/^\d+ /, '');

  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let sqft: number | null = null;
  let acres: number | null = null;
  let yearBuilt: number | null = null;
  let hoa: number | null = null;
  let price: number;
  let description: string;

  switch (type) {
    case 'Land': {
      acres = round2(0.5 + 79.5 * Math.pow(rand(), 2));
      price = clamp(roundTo((20_000 + acres * randFloat(4_000, 9_000)) * f, 5_000), 30_000, 450_000);
      description = `${acresLabel(acres)} acres of ${pick(LAND_KINDS)} land on ${street} in ${town.name}. ${pick(LAND_NOTES)}.`;
      break;
    }
    case 'Multi-family': {
      const units = randInt(2, 4);
      sqft = randInt(900 * units, 1_500 * units);
      bedrooms = units * randInt(1, 3);
      bathrooms = units * (chance(0.3) ? 1.5 : 1);
      acres = round2(randFloat(0.2, 3));
      yearBuilt = randInt(1880, 1995);
      price = roundTo(sqft * randFloat(120, 300) * f, 5_000);
      description = `${units}-unit multi-family on ${street} in ${town.name}, ${bedrooms} bedrooms in all on ${acresLabel(acres)} acres. Built ${yearBuilt}; ${pick(['fully rented', 'one unit vacant', 'owner-occupied with rental income', 'separate utilities'])}.`;
      break;
    }
    case 'Condo': {
      sqft = randInt(650, 1_800);
      bedrooms = randInt(1, 3);
      bathrooms = randInt(2, 5) / 2;
      yearBuilt = randInt(1970, 2022);
      hoa = roundTo(randFloat(250, 650), 5);
      price = roundTo(sqft * randFloat(180, 400) * f, 5_000);
      description = `${bedrooms}-bedroom, ${bathsLabel(bathrooms)}-bath condo on ${street} in ${town.name}, ${sqft.toLocaleString()} sqft. Built ${yearBuilt}; HOA $${hoa}/mo covers ${pick(['plowing and grounds', 'pool and tennis', 'exterior and roof', 'water and septic'])}.`;
      break;
    }
    case 'Townhouse': {
      sqft = randInt(900, 2_200);
      bedrooms = randInt(2, 3);
      bathrooms = randInt(3, 6) / 2;
      acres = round2(randFloat(0.05, 0.3));
      yearBuilt = randInt(1980, 2022);
      hoa = chance(0.6) ? roundTo(randFloat(100, 350), 5) : null;
      price = roundTo(sqft * randFloat(170, 380) * f, 5_000);
      description = `${bedrooms}-bedroom townhouse on ${street} in ${town.name}, ${sqft.toLocaleString()} sqft over ${pick(['two', 'three'])} levels. Built ${yearBuilt}${hoa ? `; HOA $${hoa}/mo` : ''}.`;
      break;
    }
    case 'Manufactured': {
      sqft = randInt(800, 1_800);
      bedrooms = randInt(2, 3);
      bathrooms = randInt(2, 4) / 2;
      acres = round2(randFloat(0.5, 5));
      yearBuilt = randInt(1975, 2022);
      price = Math.max(60_000, roundTo(sqft * randFloat(80, 180) * f, 5_000));
      description = `${bedrooms}-bedroom manufactured home on ${acresLabel(acres)} acres along ${street} in ${town.name}. ${yearBuilt} ${pick(['double-wide', 'single-wide', 'modular'])} on a permanent foundation.`;
      break;
    }
    case 'Other': {
      const kind = pick(OTHER_KINDS);
      sqft = randInt(400, 3_000);
      bedrooms = randInt(0, 3);
      bathrooms = randInt(1, 4) / 2;
      acres = round2(randFloat(0.3, 20));
      yearBuilt = randInt(1900, 2020);
      price = roundTo(sqft * randFloat(120, 400) * f, 5_000);
      description = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} on ${acresLabel(acres)} acres on ${street} in ${town.name}, ${sqft.toLocaleString()} sqft. Built ${yearBuilt}; ${pick(['sold as-is', 'needs a well', 'off-grid solar', 'town water'])}.`;
      break;
    }
    default: {
      sqft = randInt(700, 4_500);
      bedrooms = clamp(Math.round(sqft / 900) + randInt(-1, 1), 1, 5);
      bathrooms = clamp(randInt(2, 8) / 2, 1, Math.min(4, bedrooms));
      acres = round2(0.2 + 39.8 * Math.pow(rand(), 3));
      yearBuilt = randInt(1850, 2024);
      price = roundTo(sqft * randFloat(150, 550) * f, 5_000);
      description = `${bedrooms}-bedroom, ${bathsLabel(bathrooms)}-bath ${pick(HOUSE_STYLES)} on ${acresLabel(acres)} acres along ${street} in ${town.name}, ${sqft.toLocaleString()} sqft. Built ${yearBuilt}; ${pick(['wood stove', 'screened porch', 'detached barn', 'mountain views', 'stream frontage', 'new roof', 'full basement', 'heated studio'])}.`;
    }
  }

  const taxRate = type === 'Land' ? randFloat(0.008, 0.015) : randFloat(0.015, 0.028);
  return {
    ...b,
    unit: null,
    bedrooms,
    bathrooms,
    sqft,
    lot_sqft: acres === null ? null : acresToSqft(acres),
    year_built: yearBuilt,
    price,
    price_per_sqft: sqft && type !== 'Land' ? Math.round(price / sqft) : null,
    hoa_fee: hoa,
    tax_annual: roundTo(price * taxRate, 100),
    listing_type: type,
    listing_category: 'sale',
    last_price_reduction_date: null,
    original_price: null,
    price_reduction_amount: null,
    price_reduction_pct: null,
    description,
    available_at: null,
    history: [],
  };
}

function rentalListing(town: Town, n: number): DemoListing {
  const f = factorFor(town);
  const type = weighted<ListingType>([['House', 45], ['Apartment', 40], ['Condo', 5], ['Townhouse', 5], ['Other', 5]]);
  const b = base(town, 'rental', n);
  const street = b.address.replace(/^\d+ /, '');

  const isApartment = type === 'Apartment';
  const bedrooms = isApartment ? randInt(0, 2) : randInt(1, 4);
  const bathrooms = isApartment ? (chance(0.8) ? 1 : 1.5) : clamp(randInt(2, 6) / 2, 1, bedrooms);
  const sqft = isApartment ? randInt(400, 1_200) : randInt(600 + 250 * bedrooms, 1_000 + 400 * bedrooms);
  const acres = type === 'House' ? round2(randFloat(0.2, 5)) : null;
  const yearBuilt = type === 'House' && chance(0.7) ? randInt(1900, 2020) : null;
  const price = clamp(roundTo((1_400 + (bedrooms + 1) * randFloat(350, 800)) * (0.8 + 0.2 * f), 25), 1_400, 4_800);
  const unit = isApartment ? pick(APT_UNITS) : null;

  const what = type === 'Apartment'
    ? `${bedrooms === 0 ? 'Studio' : `${bedrooms}-bedroom`} apartment${unit ? ` (unit ${unit})` : ''}`
    : type === 'House'
      ? `${bedrooms}-bedroom ${pick(HOUSE_STYLES)} rental on ${acresLabel(acres!)} acres`
      : type === 'Other'
        ? `${bedrooms}-bedroom ${pick(['cabin', 'carriage house', 'cottage', 'apartment over the garage'])} rental`
        : `${bedrooms}-bedroom ${type.toLowerCase()} rental`;
  const description = `${what} on ${street} in ${town.name}, ${sqft.toLocaleString()} sqft. ${pick(['Year-round lease', 'Twelve-month lease', 'Pets considered', 'Heat included', 'Furnished available', 'Plowing included'])}.`;

  return {
    ...b,
    unit,
    bedrooms,
    bathrooms,
    sqft,
    lot_sqft: acres === null ? null : acresToSqft(acres),
    year_built: yearBuilt,
    price,
    price_per_sqft: null,
    hoa_fee: null,
    tax_annual: null,
    listing_type: type,
    listing_category: 'rental',
    last_price_reduction_date: null,
    original_price: null,
    price_reduction_amount: null,
    price_reduction_pct: null,
    description,
    available_at: chance(0.5) ? isoDaysFromNow(randInt(0, 90)) : null,
    history: [],
  };
}

/** About a third of listings get one or two price cuts, with matching price_history rows. */
function applyPriceHistory(l: DemoListing) {
  const step = l.listing_category === 'sale' ? 5_000 : 25;
  const dom = l.days_on_market;

  if (dom < 2 || !chance(0.35)) {
    l.history = [{ price: l.price, event_type: 'listed', event_date: l.listed_date }];
    return;
  }

  const amount = Math.max(step, roundTo(l.price * randFloat(0.01, 0.15), step));
  const original = l.price + amount;
  const lastCutDay = randInt(1, dom);
  l.original_price = original;
  l.price_reduction_amount = amount;
  l.price_reduction_pct = Math.round((amount / original) * 10_000) / 100;
  l.last_price_reduction_date = isoDaysFromNow(lastCutDay - dom);
  l.history = [{ price: original, event_type: 'listed', event_date: l.listed_date }];

  const firstCut = roundTo(amount * randFloat(0.3, 0.7), step);
  if (dom >= 10 && lastCutDay >= 2 && firstCut > 0 && firstCut < amount && chance(0.3)) {
    const firstCutDay = randInt(1, lastCutDay - 1);
    l.history.push({ price: original - firstCut, event_type: 'reduced', event_date: isoDaysFromNow(firstCutDay - dom) });
  }
  l.history.push({ price: l.price, event_type: 'reduced', event_date: l.last_price_reduction_date });
}

// ─── Trend backfill ───────────────────────────────────────────────
const INVENTORY_METRICS = new Set(['totalInventory', 'rentalInventory']);

function shapeValue(metric: string, v: number): number {
  if (INVENTORY_METRICS.has(metric)) return Math.max(0, Math.round(v));
  if (metric === 'priceCutShare') return clamp(Math.round(v * 1000) / 1000, 0, 1);
  if (metric === 'medianLotAcres' || metric === 'medianPricePerSqft') return round2(v);
  if (metric === 'daysOnMarket') return Math.round(v * 10) / 10;
  return Math.round(v);
}

function monthsBefore(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
}

/** Random-walk this month's snapshot back eleven months so every area has a 12-point series. */
function backfillTrends(period: string): number {
  const rows = db.prepare(`
    SELECT area_name, region, area_type, metric, value FROM market_trends WHERE period = ?
  `).all(period) as { area_name: string; region: string; area_type: string; metric: string; value: number }[];
  const insert = db.prepare(`
    INSERT OR REPLACE INTO market_trends (area_name, region, area_type, metric, period, value)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let written = 0;
  db.transaction(() => {
    for (const r of rows) {
      const swing = INVENTORY_METRICS.has(r.metric) ? 0.15 : 0.04;
      let v = r.value;
      for (let back = 1; back <= 11; back++) {
        v = shapeValue(r.metric, v * (1 + randFloat(-swing, swing)));
        insert.run(r.area_name, r.region, r.area_type, r.metric, monthsBefore(period, back), v);
        written++;
      }
    }
  })();
  return written;
}

// ─── Main ─────────────────────────────────────────────────────────
const upsert = db.prepare(`
  INSERT OR REPLACE INTO listings (
    external_id, source, address, unit, neighborhood, region, zip_code, lat, lng,
    bedrooms, bathrooms, sqft, lot_sqft, year_built, price, price_per_sqft, hoa_fee, tax_annual,
    listing_status, listing_type, listing_category, days_on_market, listed_date,
    last_price_reduction_date, original_price, price_reduction_amount, price_reduction_pct,
    description, image_url, listing_url, available_at, off_market_at, price_delta_reported,
    first_seen_at, imported_at
  ) VALUES (
    @external_id, 'demo', @address, @unit, @neighborhood, @region, @zip_code, @lat, @lng,
    @bedrooms, @bathrooms, @sqft, @lot_sqft, @year_built, @price, @price_per_sqft, @hoa_fee, @tax_annual,
    'for_sale', @listing_type, @listing_category, @days_on_market, @listed_date,
    @last_price_reduction_date, @original_price, @price_reduction_amount, @price_reduction_pct,
    @description, NULL, NULL, @available_at, NULL, NULL,
    @first_seen_at, @imported_at
  )
`);
const getId = db.prepare('SELECT id FROM listings WHERE external_id = ?');
const insertHistory = db.prepare(`
  INSERT OR IGNORE INTO price_history (listing_id, price, event_type, event_date)
  VALUES (?, ?, ?, ?)
`);

function main() {
  const towns = TOWNS.filter(t => t.active);
  const now = new Date().toISOString();
  const listings: DemoListing[] = [];

  for (const town of towns) {
    const sales = randInt(6, 12);
    const rentals = randInt(2, 5);
    for (let n = 1; n <= sales; n++) listings.push(saleListing(town, n));
    for (let n = 1; n <= rentals; n++) listings.push(rentalListing(town, n));
  }
  for (const l of listings) applyPriceHistory(l);

  let historyRows = 0;
  db.transaction(() => {
    for (const l of listings) {
      upsert.run({
        external_id: l.external_id,
        address: l.address,
        unit: l.unit,
        neighborhood: l.neighborhood,
        region: l.region,
        zip_code: l.zip_code,
        lat: l.lat,
        lng: l.lng,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: l.sqft,
        lot_sqft: l.lot_sqft,
        year_built: l.year_built,
        price: l.price,
        price_per_sqft: l.price_per_sqft,
        hoa_fee: l.hoa_fee,
        tax_annual: l.tax_annual,
        listing_type: l.listing_type,
        listing_category: l.listing_category,
        days_on_market: l.days_on_market,
        listed_date: l.listed_date,
        last_price_reduction_date: l.last_price_reduction_date,
        original_price: l.original_price,
        price_reduction_amount: l.price_reduction_amount,
        price_reduction_pct: l.price_reduction_pct,
        description: l.description,
        available_at: l.available_at,
        first_seen_at: l.first_seen_at,
        imported_at: now,
      });
      const { id } = getId.get(l.external_id) as { id: number };
      for (const h of l.history) {
        historyRows += insertHistory.run(id, h.price, h.event_type, h.event_date).changes;
      }
    }
  })();

  const benchmarks = computeBenchmarks(db);
  const period = currentPeriod();
  const snapshotRows = snapshotMarket(db, period);
  const backfilledRows = backfillTrends(period);

  const saleCount = listings.filter(l => l.listing_category === 'sale').length;
  const rentalCount = listings.length - saleCount;
  const reducedCount = listings.filter(l => (l.price_reduction_amount ?? 0) > 0).length;

  if (externalLogId) {
    db.prepare(`
      UPDATE import_logs SET status = 'success', listings_added = ?, listings_updated = 0, completed_at = datetime('now')
      WHERE id = ?
    `).run(listings.length, externalLogId);
  } else {
    db.prepare(`
      INSERT INTO import_logs (source, status, listings_added, listings_updated, completed_at)
      VALUES ('demo', 'success', ?, 0, datetime('now'))
    `).run(listings.length);
  }

  console.log(`Seeded ${listings.length} demo listings across ${towns.length} towns (${TODAY})`);
  for (const region of REGIONS) {
    const inRegion = listings.filter(l => l.region === region);
    const s = inRegion.filter(l => l.listing_category === 'sale').length;
    console.log(`  ${region.padEnd(13)} ${s} for sale, ${inRegion.length - s} rentals`);
  }
  console.log(`  ${saleCount} sales · ${rentalCount} rentals · ${reducedCount} with a price cut · ${historyRows} price_history rows`);
  const byType = new Map<string, number>();
  for (const l of listings) if (l.listing_category === 'sale') byType.set(l.listing_type, (byType.get(l.listing_type) ?? 0) + 1);
  console.log(`  Sale types: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  console.log(`Benchmarks: ${benchmarks} towns · market snapshot ${period}: ${snapshotRows} rows · backfilled ${backfilledRows} rows for the previous 11 months`);
  console.log('✓ Demo seed complete');
}

try {
  main();
} catch (e) {
  console.error('Fatal:', (e as Error).message);
  if (externalLogId) {
    db.prepare(`UPDATE import_logs SET status = 'error', error_message = ?, completed_at = datetime('now') WHERE id = ?`)
      .run((e as Error).message, externalLogId);
  }
  db.close();
  process.exit(1);
}
db.close();
