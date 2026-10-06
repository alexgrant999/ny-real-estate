/**
 * Rolls price_history events up into the listings columns the UI actually reads.
 *
 * The importers record every price change into price_history but leave
 * original_price, price_reduction_amount, price_reduction_pct and
 * last_price_reduction_date NULL. Every reduction filter and three of the six deal
 * presets read those columns, so without this pass they match nothing no matter how
 * many cuts have been recorded.
 *
 * Two sources, in priority order:
 *   1. Our own price_history. Authoritative, and carries real dates.
 *   2. price_delta_reported, the source's own figure. Used only when we have no
 *      recorded reduction of our own, and deliberately leaves
 *      last_price_reduction_date NULL because the date of that cut is unknown.
 *
 * Run standalone to backfill: npx tsx scripts/rollup-price-history.ts
 */
import type { Sql } from 'postgres';
import { getSql, closeSql } from '../src/lib/db';
import { applySchema } from '../src/lib/schema';
import { loadEnv } from './env';

export async function rollupPriceHistory(sql: Sql): Promise<{ fromHistory: number; fromReported: number }> {
  // The first price we ever saw for a listing is its original asking price.
  const fromHistory = (await sql`
    UPDATE listings AS l
    SET original_price = h.first_price,
        price_reduction_amount = h.first_price - l.price,
        price_reduction_pct = ROUND((h.first_price - l.price) * 100.0 / h.first_price, 2),
        last_price_reduction_date = h.last_cut
    FROM (
      SELECT ph.listing_id,
             (SELECT price FROM price_history
               WHERE listing_id = ph.listing_id
               ORDER BY event_date ASC, id ASC LIMIT 1) AS first_price,
             MAX(CASE WHEN ph.event_type = 'reduced' THEN ph.event_date END) AS last_cut
      FROM price_history ph
      GROUP BY ph.listing_id
    ) AS h
    WHERE h.listing_id = l.id
      AND h.first_price > l.price
  `).count;

  // Fall back to the source's reported delta only where we learned nothing ourselves.
  const fromReported = (await sql`
    UPDATE listings
    SET original_price = price - price_delta_reported,
        price_reduction_amount = -price_delta_reported,
        price_reduction_pct = ROUND(-price_delta_reported * 100.0 / (price - price_delta_reported), 2)
    WHERE price_delta_reported IS NOT NULL
      AND price_delta_reported < 0
      AND price_reduction_amount IS NULL
  `).count;

  // A listing that went back up is no longer a reduction.
  await sql`
    UPDATE listings
    SET price_reduction_amount = NULL, price_reduction_pct = NULL, last_price_reduction_date = NULL
    WHERE price_reduction_amount IS NOT NULL AND price_reduction_amount <= 0
  `;

  return { fromHistory, fromReported };
}

if (process.argv[1]?.endsWith('rollup-price-history.ts')) {
  (async () => {
    loadEnv();
    const sql = getSql();
    try {
      // Standalone backfills can run against a database that predates these columns.
      await applySchema(sql);
      const { fromHistory, fromReported } = await rollupPriceHistory(sql);
      const [{ reduced }] = await sql<{ reduced: number }[]>`
        SELECT COUNT(*)::int AS reduced FROM listings WHERE price_reduction_amount > 0
      `;
      console.log(`Rolled up ${fromHistory} from price history, ${fromReported} from reported deltas.`);
      console.log(`${reduced} listings now show a price reduction.`);
    } finally {
      await closeSql();
    }
  })().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
