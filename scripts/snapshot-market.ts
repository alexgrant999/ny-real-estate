/**
 * Takes a monthly snapshot of the active inventory into market_trends.
 *
 * One row per (area, metric, period). Areas are every town present in the listings
 * (area_type 'town'), each region ('region') and the whole dataset ('all', area_name
 * 'Catskills'). Metrics, all over listing_status = 'for_sale':
 *
 *   medianAskingPrice   median sale price, land excluded
 *   medianPricePerSqft  median $/sqft of sale listings that have one
 *   medianRent          median monthly rent
 *   totalInventory      number of sale listings
 *   rentalInventory     number of rentals
 *   daysOnMarket        median days on market, sales
 *   priceCutShare       fraction of sale listings with a recorded price cut (0 to 1)
 *   medianLotAcres      median lot size of sale listings with a lot, in acres
 *
 * A metric is skipped when its sample is empty; counts of zero are written. Rows for the
 * same period are replaced, so re-running within a month updates rather than duplicates.
 *
 * Called at the end of every import; run standalone for the current month:
 *   npx tsx scripts/snapshot-market.ts
 *   npx tsx scripts/snapshot-market.ts --period 2026-09
 */
import type { Sql } from 'postgres';
import { getSql, closeSql } from '../src/lib/db';
import { applySchema } from '../src/lib/schema';
import { loadEnv } from './env';
import { REGIONS, REGION_LABELS } from '../src/lib/areas';
import { sqftToAcres } from '../src/lib/utils';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

interface ActiveRow {
  neighborhood: string;
  region: string;
  listing_category: 'sale' | 'rental';
  listing_type: string | null;
  price: number;
  price_per_sqft: number | null;
  days_on_market: number | null;
  price_reduction_amount: number | null;
  lot_sqft: number | null;
}

interface Area {
  area_name: string;
  region: string;
  area_type: 'town' | 'region' | 'all';
  rows: ActiveRow[];
}

function metricsFor(rows: ActiveRow[]): Record<string, number> {
  const sales = rows.filter(r => r.listing_category === 'sale');
  const rentals = rows.filter(r => r.listing_category === 'rental');
  const out: Record<string, number> = {};

  const askingPrices = sales.filter(r => r.listing_type !== 'Land').map(r => r.price);
  if (askingPrices.length) out.medianAskingPrice = Math.round(median(askingPrices));

  const ppsf = sales.map(r => r.price_per_sqft).filter((v): v is number => v !== null);
  if (ppsf.length) out.medianPricePerSqft = Math.round(median(ppsf) * 100) / 100;

  const rents = rentals.map(r => r.price);
  if (rents.length) out.medianRent = Math.round(median(rents));

  out.totalInventory = sales.length;
  out.rentalInventory = rentals.length;

  const dom = sales.map(r => r.days_on_market).filter((v): v is number => v !== null);
  if (dom.length) out.daysOnMarket = median(dom);

  if (sales.length) {
    const cut = sales.filter(r => (r.price_reduction_amount ?? 0) > 0).length;
    out.priceCutShare = Math.round((cut / sales.length) * 1000) / 1000;
  }

  const lots = sales.filter(r => (r.lot_sqft ?? 0) > 0).map(r => sqftToAcres(r.lot_sqft!));
  if (lots.length) out.medianLotAcres = Math.round(median(lots) * 100) / 100;

  return out;
}

export interface TrendRow {
  area_name: string;
  region: string;
  area_type: string;
  metric: string;
  period: string;
  value: number;
}

/**
 * Upserts market_trends rows in batches. One INSERT cannot touch the same
 * (area_name, metric, period) twice, so duplicates are collapsed first, last one wins,
 * which is what row-by-row INSERT OR REPLACE did.
 */
export async function upsertTrends(sql: Sql, rows: TrendRow[]): Promise<void> {
  const unique = [...new Map(rows.map(r => [`${r.area_name}\u0000${r.metric}\u0000${r.period}`, r])).values()];
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    await sql`
      INSERT INTO market_trends ${sql(chunk, 'area_name', 'region', 'area_type', 'metric', 'period', 'value')}
      ON CONFLICT (area_name, metric, period) DO UPDATE SET
        region = excluded.region,
        area_type = excluded.area_type,
        value = excluded.value
    `;
  }
}

export async function snapshotMarket(sql: Sql, period: string = currentPeriod()): Promise<number> {
  const rows = await sql<ActiveRow[]>`
    SELECT neighborhood, region, listing_category, listing_type, price, price_per_sqft,
           days_on_market, price_reduction_amount, lot_sqft
    FROM listings
    WHERE listing_status = 'for_sale'
  `;

  const areas: Area[] = [];

  const towns = new Map<string, Area>();
  for (const r of rows) {
    const key = `${r.region}\u0000${r.neighborhood}`;
    let a = towns.get(key);
    if (!a) {
      a = { area_name: r.neighborhood, region: r.region, area_type: 'town', rows: [] };
      towns.set(key, a);
    }
    a.rows.push(r);
  }
  areas.push(...[...towns.values()].sort((a, b) => a.area_name.localeCompare(b.area_name)));

  // market_trends is unique on (area_name, metric, period) and the regions share their names
  // with the towns of Woodstock and Tannersville, so region series are stored under the
  // region label ("Woodstock area") to keep both.
  for (const region of REGIONS) {
    const inRegion = rows.filter(r => r.region === region);
    if (inRegion.length) areas.push({ area_name: REGION_LABELS[region], region, area_type: 'region', rows: inRegion });
  }

  if (rows.length) areas.push({ area_name: 'Catskills', region: 'All', area_type: 'all', rows: [...rows] });

  const out: TrendRow[] = [];
  for (const area of areas) {
    for (const [metric, value] of Object.entries(metricsFor(area.rows))) {
      out.push({ area_name: area.area_name, region: area.region, area_type: area.area_type, metric, period, value });
    }
  }

  await sql.begin(async tx => {
    // TransactionSql loses the tagged-template call signature in postgres.js's types.
    await upsertTrends(tx as unknown as Sql, out);
  });

  return out.length;
}

if (process.argv[1]?.endsWith('snapshot-market.ts')) {
  const args = process.argv.slice(2);
  const periodArg = args.includes('--period') ? args[args.indexOf('--period') + 1] : undefined;
  if (periodArg && !/^\d{4}-\d{2}$/.test(periodArg)) {
    console.error(`--period must be YYYY-MM, got "${periodArg}"`);
    process.exit(1);
  }

  (async () => {
    loadEnv();
    const sql = getSql();
    try {
      await applySchema(sql);
      const period = periodArg ?? currentPeriod();
      const written = await snapshotMarket(sql, period);
      const [{ areas }] = await sql<{ areas: number }[]>`
        SELECT COUNT(DISTINCT area_name)::int AS areas FROM market_trends WHERE period = ${period}
      `;
      console.log(`Market snapshot for ${period}: ${written} row(s) across ${areas} area(s).`);
    } finally {
      await closeSql();
    }
  })().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
