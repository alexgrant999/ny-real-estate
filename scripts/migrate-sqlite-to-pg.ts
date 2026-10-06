/**
 * One-off: copies the local SQLite database (data/apartments.db) into Postgres.
 *
 * Empties the five tables in Postgres first (TRUNCATE ... RESTART IDENTITY CASCADE), then
 * copies listings, price_history, neighborhood_benchmarks, import_logs and market_trends
 * in that order, keeping every row's id (OVERRIDING SYSTEM VALUE) so price_history still
 * points at the right listing. Each identity sequence is then moved past the highest id.
 * Everything runs in one transaction, so a failure leaves Postgres as it was.
 *
 * Only columns present on both sides are copied. Values headed for INTEGER columns are
 * rounded, because SQLite stored fractions there without complaint and int4 refuses them.
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-pg.ts
 *   npx tsx scripts/migrate-sqlite-to-pg.ts --from path/to/other.db
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Sql } from 'postgres';
import { getSql, closeSql } from '../src/lib/db';
import { applySchema } from '../src/lib/schema';
import { loadEnv } from './env';

const TABLES = ['listings', 'price_history', 'neighborhood_benchmarks', 'import_logs', 'market_trends'] as const;
const ROWS_PER_INSERT = 500;

type Value = string | number | null;
type Row = Record<string, Value>;

const args = process.argv.slice(2);
const fromArg = args.includes('--from') ? args[args.indexOf('--from') + 1] : undefined;
const SQLITE_PATH = path.resolve(fromArg ?? path.join(process.cwd(), 'data', 'apartments.db'));

function normalise(v: unknown): Value {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'bigint') return Number(v);
  return String(v);
}

async function pgColumns(q: Sql, table: string): Promise<Map<string, string>> {
  const cols = await q<{ column_name: string; data_type: string }[]>`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table}
  `;
  return new Map(cols.map(c => [c.column_name, c.data_type]));
}

async function copyTable(q: Sql, lite: Database.Database, table: string, keep?: (r: Row) => boolean): Promise<{ copied: number; skipped: number }> {
  const pgCols = await pgColumns(q, table);
  const source = (lite.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[])
    .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalise(v)])) as Row);
  if (source.length === 0) return { copied: 0, skipped: 0 };

  const liteCols = Object.keys(source[0]);
  const cols = liteCols.filter(c => pgCols.has(c));
  const dropped = liteCols.filter(c => !pgCols.has(c));
  if (dropped.length) console.warn(`  ${table}: no Postgres column for ${dropped.join(', ')}, not copied`);
  const intCols = new Set(cols.filter(c => ['integer', 'bigint', 'smallint'].includes(pgCols.get(c)!)));

  const rows = keep ? source.filter(keep) : source;
  const columnList = cols.map(c => `"${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const params: Value[] = [];
    const tuples = chunk.map(r => `(${cols.map(c => {
      const v = r[c];
      params.push(intCols.has(c) && typeof v === 'number' ? Math.round(v) : v);
      return `$${params.length}`;
    }).join(', ')})`);
    await q.unsafe(
      `INSERT INTO ${table} (${columnList}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(', ')}`,
      params,
    );
  }

  await q.unsafe(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`,
  );
  return { copied: rows.length, skipped: source.length - rows.length };
}

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) throw new Error(`No SQLite database at ${SQLITE_PATH}`);
  loadEnv();
  const sql = getSql();
  const lite = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });

  try {
    await applySchema(sql);
    console.log(`Copying ${SQLITE_PATH} into Postgres...`);

    const counts = await sql.begin(async tx => {
      // TransactionSql loses the tagged-template call signature in postgres.js's types.
      const q = tx as unknown as Sql;
      await q.unsafe(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

      const out: { table: string; copied: number; skipped: number }[] = [];
      const listingIds = new Set(
        (lite.prepare('SELECT id FROM listings').all() as { id: number }[]).map(r => r.id),
      );
      for (const table of TABLES) {
        // History rows whose listing is gone (possible if foreign keys were ever off) would
        // fail the Postgres foreign key, so they are left behind and counted.
        const keep = table === 'price_history'
          ? (r: Row) => typeof r.listing_id === 'number' && listingIds.has(r.listing_id)
          : undefined;
        out.push({ table, ...(await copyTable(q, lite, table, keep)) });
      }
      return out;
    });

    const pgCounts = await Promise.all(TABLES.map(async table => {
      const [{ n }] = await sql.unsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM ${table}`);
      return n;
    }));

    console.log('');
    counts.forEach((c, i) => {
      const skipped = c.skipped ? ` (${c.skipped} orphaned rows skipped)` : '';
      console.log(`  ${c.table.padEnd(24)} ${String(c.copied).padStart(6)} copied, ${String(pgCounts[i]).padStart(6)} in Postgres${skipped}`);
    });
    console.log('✓ Migration complete');
  } finally {
    lite.close();
    await closeSql();
  }
}

main().catch(e => {
  console.error('Fatal:', (e as Error).message);
  process.exitCode = 1;
});
