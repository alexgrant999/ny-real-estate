/**
 * Seed script: generates ~200 realistic demo listings for Manhattan & Brooklyn.
 * Run with: npx tsx scripts/seed-demo.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT UNIQUE NOT NULL, source TEXT NOT NULL,
    address TEXT NOT NULL, unit TEXT, neighborhood TEXT NOT NULL, borough TEXT NOT NULL,
    zip_code TEXT NOT NULL, lat REAL, lng REAL, bedrooms INTEGER, bathrooms REAL,
    sqft INTEGER, price INTEGER NOT NULL, price_per_sqft REAL, hoa_fee INTEGER,
    tax_annual INTEGER, listing_status TEXT NOT NULL DEFAULT 'for_sale', listing_type TEXT,
    listing_category TEXT NOT NULL DEFAULT 'sale',
    days_on_market INTEGER, listed_date TEXT, last_price_reduction_date TEXT,
    original_price INTEGER, price_reduction_amount INTEGER, price_reduction_pct REAL,
    description TEXT, image_url TEXT, listing_url TEXT,
    imported_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    price INTEGER NOT NULL, event_type TEXT NOT NULL, event_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(listing_id, event_date, event_type)
  );
  CREATE TABLE IF NOT EXISTS neighborhood_benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, neighborhood TEXT NOT NULL, borough TEXT NOT NULL,
    bedrooms INTEGER, median_price INTEGER, median_ppsf REAL, sample_size INTEGER,
    period_start TEXT, period_end TEXT, computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(neighborhood, borough, bedrooms, period_start, period_end)
  );
  CREATE TABLE IF NOT EXISTS import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, status TEXT NOT NULL,
    listings_added INTEGER DEFAULT 0, listings_updated INTEGER DEFAULT 0,
    error_message TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_listings_borough ON listings(borough);
  CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood);
  CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
  CREATE INDEX IF NOT EXISTS idx_listings_dom ON listings(days_on_market);
  CREATE INDEX IF NOT EXISTS idx_listings_reduction ON listings(price_reduction_pct);
`);

const MANHATTAN_NEIGHBORHOODS = [
  { name: 'Upper West Side', zip: '10024', lat: 40.787, lng: -73.975, ppsf: 1800 },
  { name: 'Upper East Side', zip: '10065', lat: 40.774, lng: -73.956, ppsf: 2100 },
  { name: 'Midtown', zip: '10019', lat: 40.762, lng: -73.987, ppsf: 2400 },
  { name: 'Chelsea', zip: '10011', lat: 40.748, lng: -74.000, ppsf: 2200 },
  { name: 'Greenwich Village', zip: '10014', lat: 40.731, lng: -74.002, ppsf: 2500 },
  { name: 'SoHo', zip: '10012', lat: 40.723, lng: -74.001, ppsf: 2700 },
  { name: 'Tribeca', zip: '10013', lat: 40.716, lng: -74.008, ppsf: 3000 },
  { name: 'Financial District', zip: '10004', lat: 40.708, lng: -74.009, ppsf: 1900 },
  { name: "Hell's Kitchen", zip: '10036', lat: 40.763, lng: -73.993, ppsf: 1700 },
  { name: 'Harlem', zip: '10027', lat: 40.811, lng: -73.946, ppsf: 1200 },
];

const BROOKLYN_NEIGHBORHOODS = [
  { name: 'Williamsburg', zip: '11211', lat: 40.714, lng: -73.961, ppsf: 1400 },
  { name: 'DUMBO', zip: '11201', lat: 40.703, lng: -73.989, ppsf: 1800 },
  { name: 'Brooklyn Heights', zip: '11201', lat: 40.696, lng: -73.993, ppsf: 1600 },
  { name: 'Park Slope', zip: '11215', lat: 40.672, lng: -73.980, ppsf: 1300 },
  { name: 'Carroll Gardens', zip: '11231', lat: 40.679, lng: -73.999, ppsf: 1200 },
  { name: 'Greenpoint', zip: '11222', lat: 40.731, lng: -73.955, ppsf: 1100 },
  { name: 'Cobble Hill', zip: '11231', lat: 40.686, lng: -73.996, ppsf: 1250 },
  { name: 'Fort Greene', zip: '11217', lat: 40.689, lng: -73.975, ppsf: 1150 },
  { name: 'Crown Heights', zip: '11213', lat: 40.669, lng: -73.942, ppsf: 900 },
  { name: 'Prospect Heights', zip: '11238', lat: 40.677, lng: -73.965, ppsf: 1050 },
];

const LISTING_TYPES = ['Condo', 'Co-op', 'Condo', 'Condo', 'Townhouse'];
const STREETS = ['Broadway', 'West End Ave', 'Riverside Dr', 'Park Ave', 'Madison Ave',
  'Lexington Ave', 'Amsterdam Ave', 'Columbus Ave', 'Central Park W', 'Fifth Ave',
  'Atlantic Ave', 'Flatbush Ave', 'Bedford Ave', 'Kent Ave', 'Berry St'];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min: number, max: number) { return Math.random() * (max - min) + min; }
function randEl<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const insertListing = db.prepare(`
  INSERT OR REPLACE INTO listings (
    external_id, source, address, unit, neighborhood, borough, zip_code, lat, lng,
    bedrooms, bathrooms, sqft, price, price_per_sqft, hoa_fee, tax_annual,
    listing_status, listing_type, listing_category, days_on_market, listed_date,
    last_price_reduction_date, original_price, price_reduction_amount, price_reduction_pct,
    description, image_url, listing_url, imported_at
  ) VALUES (
    @external_id, @source, @address, @unit, @neighborhood, @borough, @zip_code, @lat, @lng,
    @bedrooms, @bathrooms, @sqft, @price, @price_per_sqft, @hoa_fee, @tax_annual,
    @listing_status, @listing_type, @listing_category, @days_on_market, @listed_date,
    @last_price_reduction_date, @original_price, @price_reduction_amount, @price_reduction_pct,
    @description, @image_url, @listing_url, @imported_at
  )
`);

const insertPriceHistory = db.prepare(`
  INSERT OR IGNORE INTO price_history (listing_id, price, event_type, event_date)
  VALUES (@listing_id, @price, @event_type, @event_date)
`);

const insertBenchmark = db.prepare(`
  INSERT OR REPLACE INTO neighborhood_benchmarks
    (neighborhood, borough, bedrooms, median_price, median_ppsf, sample_size, period_start, period_end)
  VALUES (@neighborhood, @borough, @bedrooms, @median_price, @median_ppsf, @sample_size, @period_start, @period_end)
`);

let totalAdded = 0;

function seedNeighborhood(
  hood: { name: string; zip: string; lat: number; lng: number; ppsf: number },
  borough: 'Manhattan' | 'Brooklyn',
  count: number,
  category: 'sale' | 'rental' = 'sale'
) {
  for (let i = 0; i < count; i++) {
    const beds = category === 'rental' ? rand(0, 3) : rand(0, 4);
    const baths = beds === 0 ? 1 : randFloat(1, beds + 0.5);
    const sqft = rand(beds === 0 ? 300 : 400, beds * 300 + 800);

    let originalPrice: number;
    if (category === 'rental') {
      // Rental prices: $1,500–$5,500/mo depending on beds and neighborhood
      const baseRent = beds === 0 ? 2200 : 2500 + beds * 600;
      const factor = hood.ppsf / 1800; // normalize by neighborhood desirability
      originalPrice = Math.round(baseRent * factor * randFloat(0.8, 1.2) / 50) * 50;
    } else {
      const ppsf = hood.ppsf * randFloat(0.75, 1.35);
      originalPrice = Math.round(sqft * ppsf / 50000) * 50000;
    }

    const dom = rand(0, 180);
    const listedDate = daysAgo(dom);

    // ~35% of listings have had a price reduction
    const hasReduction = Math.random() < 0.35;
    const reductionPct = hasReduction ? randFloat(1, 15) : 0;
    const reductionAmount = category === 'rental'
      ? (hasReduction ? Math.round(originalPrice * reductionPct / 100 / 25) * 25 : 0)
      : (hasReduction ? Math.round(originalPrice * reductionPct / 100 / 5000) * 5000 : 0);
    const currentPrice = originalPrice - reductionAmount;
    const reductionDate = hasReduction ? daysAgo(rand(1, Math.max(dom, 1))) : null;

    const listingType = category === 'rental' ? randEl(['Apartment', 'Condo', 'Co-op']) : randEl(LISTING_TYPES);
    const streetNum = rand(1, 500);
    const street = randEl(STREETS);
    const unit = Math.random() > 0.3 ? `${rand(1, 50)}${String.fromCharCode(65 + rand(0, 3))}` : null;

    const externalId = `demo-${category === 'rental' ? 'rent-' : ''}${borough.toLowerCase()}-${totalAdded + i + 1}`;

    const inserted = insertListing.run({
      external_id: externalId,
      source: 'demo',
      address: `${streetNum} ${street}`,
      unit,
      neighborhood: hood.name,
      borough,
      zip_code: hood.zip,
      lat: hood.lat + randFloat(-0.005, 0.005),
      lng: hood.lng + randFloat(-0.005, 0.005),
      bedrooms: beds,
      bathrooms: Math.round(baths * 2) / 2,
      sqft,
      price: currentPrice,
      price_per_sqft: category === 'sale' ? Math.round(currentPrice / sqft) : null,
      hoa_fee: category === 'sale' && listingType !== 'Townhouse' ? rand(300, 2000) : null,
      tax_annual: category === 'sale' ? rand(3000, 30000) : null,
      listing_status: 'for_sale',
      listing_type: listingType,
      listing_category: category,
      days_on_market: dom,
      listed_date: listedDate,
      last_price_reduction_date: reductionDate,
      original_price: originalPrice,
      price_reduction_amount: reductionAmount > 0 ? reductionAmount : null,
      price_reduction_pct: reductionAmount > 0 ? Math.round(reductionPct * 10) / 10 : null,
      description: category === 'rental'
        ? `${beds === 0 ? 'Studio' : `${beds}BR`} ${listingType.toLowerCase()} for rent in ${hood.name}. ${sqft} sqft.`
        : `Beautiful ${beds === 0 ? 'studio' : `${beds}BR`} ${listingType.toLowerCase()} in ${hood.name}. ${sqft} sqft of light-filled space.`,
      image_url: null,
      listing_url: null,
      imported_at: new Date().toISOString(),
    });

    const listingId = inserted.lastInsertRowid as number;

    // Insert price history
    insertPriceHistory.run({ listing_id: listingId, price: originalPrice, event_type: 'listed', event_date: listedDate });

    if (hasReduction && reductionDate) {
      // Sometimes there are multiple reductions
      if (Math.random() < 0.3 && dom > 30) {
        const firstReductionDays = rand(Math.floor(dom / 2), dom - 1);
        const firstReductionDate = daysAgo(firstReductionDays);
        const midPrice = Math.round(originalPrice * randFloat(0.97, 0.99) / 5000) * 5000;
        insertPriceHistory.run({ listing_id: listingId, price: midPrice, event_type: 'reduced', event_date: firstReductionDate });
      }
      insertPriceHistory.run({ listing_id: listingId, price: currentPrice, event_type: 'reduced', event_date: reductionDate });
    }
  }
  totalAdded += count;
}

// Seed for-sale listings
console.log('Seeding Manhattan for-sale...');
for (const hood of MANHATTAN_NEIGHBORHOODS) {
  seedNeighborhood(hood, 'Manhattan', rand(8, 15), 'sale');
}

console.log('Seeding Brooklyn for-sale...');
for (const hood of BROOKLYN_NEIGHBORHOODS) {
  seedNeighborhood(hood, 'Brooklyn', rand(8, 15), 'sale');
}

// Seed rental listings
console.log('Seeding Manhattan rentals...');
for (const hood of MANHATTAN_NEIGHBORHOODS) {
  seedNeighborhood(hood, 'Manhattan', rand(8, 15), 'rental');
}

console.log('Seeding Brooklyn rentals...');
for (const hood of BROOKLYN_NEIGHBORHOODS) {
  seedNeighborhood(hood, 'Brooklyn', rand(8, 15), 'rental');
}

// Seed neighborhood benchmarks
console.log('Seeding neighborhood benchmarks...');
const period_start = '2024-01-01';
const period_end = '2024-12-31';

for (const hood of MANHATTAN_NEIGHBORHOODS) {
  insertBenchmark.run({
    neighborhood: hood.name, borough: 'Manhattan', bedrooms: null,
    median_price: Math.round(hood.ppsf * 800 / 50000) * 50000,
    median_ppsf: hood.ppsf, sample_size: rand(50, 300),
    period_start, period_end,
  });
}
for (const hood of BROOKLYN_NEIGHBORHOODS) {
  insertBenchmark.run({
    neighborhood: hood.name, borough: 'Brooklyn', bedrooms: null,
    median_price: Math.round(hood.ppsf * 750 / 25000) * 25000,
    median_ppsf: hood.ppsf, sample_size: rand(30, 200),
    period_start, period_end,
  });
}

// Log the import
db.prepare(`
  INSERT INTO import_logs (source, status, listings_added, listings_updated, completed_at)
  VALUES ('demo', 'success', ?, 0, datetime('now'))
`).run(totalAdded);

console.log(`✓ Seeded ${totalAdded} demo listings across Manhattan and Brooklyn`);
db.close();
