import { getSql } from './db';
import type { Sql } from 'postgres';

/**
 * Full DDL, one statement per entry. A connection with prepared statements off cannot run
 * a multi-statement string in one call, so applySchema runs them one at a time. Shared by
 * the Next.js instrumentation hook and by every script, so a script can run against an
 * empty database without starting the app first.
 *
 * Every date or timestamp column is TEXT holding an ISO-style string, as it was in SQLite.
 */
const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS listings (
    id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_id               TEXT UNIQUE NOT NULL,
    source                    TEXT NOT NULL,
    address                   TEXT NOT NULL,
    unit                      TEXT,
    neighborhood              TEXT NOT NULL,
    region                    TEXT NOT NULL,
    zip_code                  TEXT NOT NULL,
    lat                       DOUBLE PRECISION,
    lng                       DOUBLE PRECISION,
    bedrooms                  INTEGER,
    bathrooms                 DOUBLE PRECISION,
    sqft                      INTEGER,
    lot_sqft                  INTEGER,
    year_built                INTEGER,
    price                     INTEGER NOT NULL,
    price_per_sqft            DOUBLE PRECISION,
    hoa_fee                   INTEGER,
    tax_annual                INTEGER,
    listing_status            TEXT NOT NULL DEFAULT 'for_sale',
    listing_type              TEXT,
    listing_category          TEXT NOT NULL DEFAULT 'sale',
    days_on_market            INTEGER,
    listed_date               TEXT,
    last_price_reduction_date TEXT,
    original_price            INTEGER,
    price_reduction_amount    INTEGER,
    price_reduction_pct       DOUBLE PRECISION,
    description               TEXT,
    image_url                 TEXT,
    listing_url               TEXT,
    available_at              TEXT,
    off_market_at             TEXT,
    price_delta_reported      INTEGER,
    first_seen_at             TEXT,
    details_fetched_at        TEXT,
    imported_at               TEXT NOT NULL,
    created_at                TEXT NOT NULL DEFAULT now()::text
  )`,

  `CREATE TABLE IF NOT EXISTS price_history (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    price       INTEGER NOT NULL,
    event_type  TEXT NOT NULL,
    event_date  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT now()::text,
    UNIQUE(listing_id, event_date, event_type)
  )`,

  `CREATE TABLE IF NOT EXISTS neighborhood_benchmarks (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    neighborhood  TEXT NOT NULL,
    region        TEXT NOT NULL,
    bedrooms      INTEGER,
    median_price  INTEGER,
    median_ppsf   DOUBLE PRECISION,
    sample_size   INTEGER,
    period_start  TEXT,
    period_end    TEXT,
    computed_at   TEXT NOT NULL DEFAULT now()::text,
    UNIQUE(neighborhood, region, bedrooms, period_start, period_end)
  )`,

  `CREATE TABLE IF NOT EXISTS import_logs (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source           TEXT NOT NULL,
    status           TEXT NOT NULL,
    listings_added   INTEGER DEFAULT 0,
    listings_updated INTEGER DEFAULT 0,
    error_message    TEXT,
    started_at       TEXT NOT NULL DEFAULT now()::text,
    completed_at     TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS market_trends (
    id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_name TEXT NOT NULL,
    region    TEXT NOT NULL,
    area_type TEXT NOT NULL,
    metric    TEXT NOT NULL,
    period    TEXT NOT NULL,
    value     DOUBLE PRECISION,
    UNIQUE(area_name, metric, period)
  )`,

  'CREATE INDEX IF NOT EXISTS idx_listings_region       ON listings(region)',
  'CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood)',
  'CREATE INDEX IF NOT EXISTS idx_listings_price        ON listings(price)',
  'CREATE INDEX IF NOT EXISTS idx_listings_dom          ON listings(days_on_market)',
  'CREATE INDEX IF NOT EXISTS idx_listings_bedrooms     ON listings(bedrooms)',
  'CREATE INDEX IF NOT EXISTS idx_listings_status       ON listings(listing_status)',
  'CREATE INDEX IF NOT EXISTS idx_listings_category     ON listings(listing_category)',
  'CREATE INDEX IF NOT EXISTS idx_listings_reduction    ON listings(price_reduction_pct)',
  'CREATE INDEX IF NOT EXISTS idx_listings_available    ON listings(available_at)',
  'CREATE INDEX IF NOT EXISTS idx_listings_lot          ON listings(lot_sqft)',
  'CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id, event_date)',
  'CREATE INDEX IF NOT EXISTS idx_market_trends_area    ON market_trends(area_name, metric)',
  'CREATE INDEX IF NOT EXISTS idx_market_trends_period  ON market_trends(period)',
];

export const SCHEMA_SQL: string = SCHEMA_STATEMENTS.map(s => `${s};`).join('\n\n');

/** Create tables and indexes on a given connection. Idempotent. */
export async function applySchema(sql: Sql): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await sql.unsafe(statement);
  }
}

export async function runMigrations(): Promise<void> {
  await applySchema(getSql());
}
