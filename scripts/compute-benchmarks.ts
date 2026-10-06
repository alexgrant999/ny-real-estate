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
import type { Sql } from 'postgres';
import { getSql, closeSql } from '../src/lib/db';
import { applySchema } from '../src/lib/schema';
import { loadEnv } from './env';

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

export async function computeBenchmarks(sql: Sql): Promise<number> {
  const rows = await sql<SaleRow[]>`
    SELECT neighborhood, region, price, price_per_sqft
    FROM listings
    WHERE listing_status = 'for_sale'
      AND listing_category = 'sale'
      AND price_per_sqft IS NOT NULL
      AND (listing_type IS NULL OR listing_type != 'Land')
  `;

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

  return sql.begin(async tx => {
    // TransactionSql loses the tagged-template call signature in postgres.js's types.
    const q = tx as unknown as Sql;
    let written = 0;
    for (const g of groups.values()) {
      if (g.ppsf.length < MIN_SAMPLE) continue;
      await q`
        DELETE FROM neighborhood_benchmarks
        WHERE neighborhood = ${g.neighborhood} AND region = ${g.region} AND bedrooms IS NULL
      `;
      await q`
        INSERT INTO neighborhood_benchmarks
          (neighborhood, region, bedrooms, median_price, median_ppsf, sample_size, period_start, period_end, computed_at)
        VALUES (
          ${g.neighborhood}, ${g.region}, NULL,
          ${Math.round(median(g.prices))}, ${Math.round(median(g.ppsf) * 100) / 100}, ${g.ppsf.length},
          ${start}, ${end}, now()::text
        )
      `;
      written++;
    }
    return written;
  });
}

if (process.argv[1]?.endsWith('compute-benchmarks.ts')) {
  (async () => {
    loadEnv();
    const sql = getSql();
    try {
      await applySchema(sql);
      const written = await computeBenchmarks(sql);
      const [{ total }] = await sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM neighborhood_benchmarks WHERE bedrooms IS NULL
      `;
      console.log(`Benchmarks written for ${written} town(s); ${total} town benchmark row(s) in total.`);
    } finally {
      await closeSql();
    }
  })().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
