/**
 * Computes per-town benchmarks from the current sale inventory.
 *
 * For every (neighborhood, region) with at least three active, non-land sale listings
 * that carry a price per square foot, writes one neighborhood_benchmarks row
 * (bedrooms NULL) holding the median $/sqft, median asking price and sample size for
 * the current calendar month. The listings page joins this row to flag listings priced
 * below their town's median, and the "below median $/sqft" deal preset reads it directly.
 *
 * Land is excluded because a $/sqft on acreage says nothing about the houses around it.
 *
 * Called at the end of every import; run standalone to recompute:
 *   npx tsx scripts/compute-benchmarks.ts
 */
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { applySchema } from '../src/lib/schema';

const MIN_SAMPLE = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** First and last day of the current month, YYYY-MM-DD. */
function currentMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

interface SaleRow {
  neighborhood: string;
  region: string;
  price: number;
  price_per_sqft: number;
}

export function computeBenchmarks(db: BetterSqlite3.Database): number {
  const rows = db.prepare(`
    SELECT neighborhood, region, price, price_per_sqft
    FROM listings
    WHERE listing_status = 'for_sale'
      AND listing_category = 'sale'
      AND price_per_sqft IS NOT NULL
      AND (listing_type IS NULL OR listing_type != 'Land')
  `).all() as SaleRow[];

  const groups = new Map<string, { neighborhood: string; region: string; prices: number[]; ppsf: number[] }>();
  for (const r of rows) {
    const key = `${r.region}\u0000${r.neighborhood}`;
    let g = groups.get(key);
    if (!g) {
      g = { neighborhood: r.neighborhood, region: r.region, prices: [], ppsf: [] };
      groups.set(key, g);
    }
    g.prices.push(r.price);
    g.ppsf.push(r.price_per_sqft);
  }

  const { start, end } = currentMonthBounds();
  const remove = db.prepare(`
    DELETE FROM neighborhood_benchmarks
    WHERE neighborhood = ? AND region = ? AND bedrooms IS NULL
  `);
  const insert = db.prepare(`
    INSERT INTO neighborhood_benchmarks
      (neighborhood, region, bedrooms, median_price, median_ppsf, sample_size, period_start, period_end, computed_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let written = 0;
  db.transaction(() => {
    for (const g of groups.values()) {
      if (g.ppsf.length < MIN_SAMPLE) continue;
      remove.run(g.neighborhood, g.region);
      insert.run(
        g.neighborhood,
        g.region,
        Math.round(median(g.prices)),
        Math.round(median(g.ppsf) * 100) / 100,
        g.ppsf.length,
        start,
        end,
      );
      written++;
    }
  })();

  return written;
}

if (require.main === module) {
  const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);

  const written = computeBenchmarks(db);
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM neighborhood_benchmarks WHERE bedrooms IS NULL'
  ).get() as { total: number };
  console.log(`Benchmarks written for ${written} town(s); ${total} town benchmark row(s) in total.`);
  db.close();
}
