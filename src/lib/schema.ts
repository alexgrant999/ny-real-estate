import { getDb } from './db';

export function runMigrations() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id               TEXT UNIQUE NOT NULL,
      source                    TEXT NOT NULL,
      address                   TEXT NOT NULL,
      unit                      TEXT,
      neighborhood              TEXT NOT NULL,
      borough                   TEXT NOT NULL,
      zip_code                  TEXT NOT NULL,
      lat                       REAL,
      lng                       REAL,
      bedrooms                  INTEGER,
      bathrooms                 REAL,
      sqft                      INTEGER,
      price                     INTEGER NOT NULL,
      price_per_sqft            REAL,
      hoa_fee                   INTEGER,
      tax_annual                INTEGER,
      listing_status            TEXT NOT NULL DEFAULT 'for_sale',
      listing_type              TEXT,
      days_on_market            INTEGER,
      listed_date               TEXT,
      last_price_reduction_date TEXT,
      original_price            INTEGER,
      price_reduction_amount    INTEGER,
      price_reduction_pct       REAL,
      description               TEXT,
      image_url                 TEXT,
      listing_url               TEXT,
      imported_at               TEXT NOT NULL,
      created_at                TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      price       INTEGER NOT NULL,
      event_type  TEXT NOT NULL,
      event_date  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(listing_id, event_date, event_type)
    );

    CREATE TABLE IF NOT EXISTS neighborhood_benchmarks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      neighborhood  TEXT NOT NULL,
      borough       TEXT NOT NULL,
      bedrooms      INTEGER,
      median_price  INTEGER,
      median_ppsf   REAL,
      sample_size   INTEGER,
      period_start  TEXT,
      period_end    TEXT,
      computed_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(neighborhood, borough, bedrooms, period_start, period_end)
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source           TEXT NOT NULL,
      status           TEXT NOT NULL,
      listings_added   INTEGER DEFAULT 0,
      listings_updated INTEGER DEFAULT 0,
      error_message    TEXT,
      started_at       TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_listings_borough     ON listings(borough);
    CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood);
    CREATE INDEX IF NOT EXISTS idx_listings_price       ON listings(price);
    CREATE INDEX IF NOT EXISTS idx_listings_dom         ON listings(days_on_market);
    CREATE INDEX IF NOT EXISTS idx_listings_bedrooms    ON listings(bedrooms);
    CREATE INDEX IF NOT EXISTS idx_listings_status      ON listings(listing_status);
    CREATE INDEX IF NOT EXISTS idx_listings_reduction   ON listings(price_reduction_pct);
    CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id, event_date);

    CREATE TABLE IF NOT EXISTS market_trends (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      area_name TEXT NOT NULL,
      borough   TEXT NOT NULL,
      area_type TEXT NOT NULL,
      metric    TEXT NOT NULL,
      period    TEXT NOT NULL,
      value     REAL,
      UNIQUE(area_name, metric, period)
    );
    CREATE INDEX IF NOT EXISTS idx_market_trends_area   ON market_trends(area_name, metric);
    CREATE INDEX IF NOT EXISTS idx_market_trends_period ON market_trends(period);
  `);

  // Migrations for columns added after initial schema
  const cols = db.prepare('PRAGMA table_info(listings)').all() as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('first_seen_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN first_seen_at TEXT`);
  }
  if (!colNames.includes('listing_category')) {
    db.exec(`ALTER TABLE listings ADD COLUMN listing_category TEXT NOT NULL DEFAULT 'sale'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(listing_category)`);
  }
  // Move-in date. The most useful rental filter after price and bedrooms.
  if (!colNames.includes('available_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN available_at TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_available ON listings(available_at)`);
  }
  // Set when the source stops reporting a listing as active, so rented and sold
  // units can be filtered out instead of accumulating as phantom inventory.
  if (!colNames.includes('off_market_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN off_market_at TEXT`);
  }
  // StreetEasy's own reported price change. Gives a price cut on first sight,
  // where price_history only learns about one across repeated scrapes.
  if (!colNames.includes('price_delta_reported')) {
    db.exec(`ALTER TABLE listings ADD COLUMN price_delta_reported INTEGER`);
  }
}
