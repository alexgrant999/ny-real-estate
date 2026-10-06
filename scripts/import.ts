/**
 * Main import orchestrator.
 *
 * Usage:
 *   npx tsx scripts/import.ts               # runs redfin
 *   npx tsx scripts/import.ts redfin        # Redfin scrape (sales only by default, no key needed)
 *   npx tsx scripts/import.ts zillow        # Zillow via RapidAPI (needs RAPIDAPI_KEY)
 *   npx tsx scripts/import.ts demo          # seed demo data
 *   npx tsx scripts/import.ts redfin --log-id 12   # finalise an import_logs row created elsewhere
 *
 * Env vars (set in .env.local):
 *   DATABASE_URL  - the Postgres (Neon) database every script writes to.
 *   RAPIDAPI_KEY  - only for the zillow source. Get at https://rapidapi.com/apimaker/api/zillow-com1
 */
import { execSync } from 'child_process';
import { getSql, closeSql } from '../src/lib/db';
import { applySchema } from '../src/lib/schema';
import { loadEnv } from './env';

// Load .env.local for scripts
loadEnv();
const sql = getSql();

const VALID_SOURCES = ['redfin', 'zillow', 'demo'];

async function createLog(source: string): Promise<number> {
  const [{ id }] = await sql<{ id: number }[]>`
    INSERT INTO import_logs (source, status) VALUES (${source}, 'running') RETURNING id
  `;
  return id;
}

async function completeLog(id: number, status: 'success' | 'error', error?: string) {
  await sql`
    UPDATE import_logs SET status = ${status}, error_message = ${error ?? null}, completed_at = now()::text WHERE id = ${id}
  `;
}

async function main() {
  await applySchema(sql);

  const rawArgs = process.argv.slice(2);
  const logIdIdx = rawArgs.indexOf('--log-id');
  const externalLogId = logIdIdx !== -1 ? parseInt(rawArgs[logIdIdx + 1]) : null;
  const sources = rawArgs.filter((a, i) => !a.startsWith('--') && rawArgs[i - 1] !== '--log-id');
  const toRun = sources.length === 0 ? ['redfin'] : sources;

  for (const source of toRun) {
    console.log(`\n→ Starting import: ${source}`);
    const logId = (externalLogId && toRun.length === 1) ? externalLogId : await createLog(source);

    try {
      if (source === 'redfin') {
        // The scraper finalises its own log row (success or error) when given --log-id,
        // so only a crash that escapes it is recorded here.
        execSync(`npx tsx scripts/scrape-redfin.ts --log-id ${logId}`, { stdio: 'inherit' });
        console.log(`✓ ${source} finished`);
        continue;
      } else if (source === 'zillow') {
        const { importZillow } = await import('./importers/zillow');
        await importZillow(sql, logId);
      } else if (source === 'demo') {
        execSync(`npx tsx scripts/seed-demo.ts --log-id ${logId}`, { stdio: 'inherit' });
        await sql`UPDATE import_logs SET status = 'success', completed_at = now()::text WHERE id = ${logId}`;
        continue;
      } else {
        throw new Error(`Unknown source: "${source}". Valid options: ${VALID_SOURCES.join(', ')}`);
      }
      await completeLog(logId, 'success');
      console.log(`✓ ${source} succeeded`);
    } catch (e) {
      const msg = (e as Error).message;
      await completeLog(logId, 'error', msg);
      console.error(`✗ ${source} failed: ${msg}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => closeSql());
