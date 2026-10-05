/**
 * Main import orchestrator.
 *
 * Usage:
 *   npx tsx scripts/import.ts               # runs redfin
 *   npx tsx scripts/import.ts redfin        # Redfin scrape (sales + rentals, no key needed)
 *   npx tsx scripts/import.ts zillow        # Zillow via RapidAPI (needs RAPIDAPI_KEY)
 *   npx tsx scripts/import.ts demo          # seed demo data
 *   npx tsx scripts/import.ts redfin --log-id 12   # finalise an import_logs row created elsewhere
 *
 * Optional env vars (set in .env.local):
 *   RAPIDAPI_KEY  – only for the zillow source. Get at https://rapidapi.com/apimaker/api/zillow-com1
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { applySchema } from '../src/lib/schema';

// Load .env.local for scripts
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() && rest.length) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
applySchema(db);

const VALID_SOURCES = ['redfin', 'zillow', 'demo'];

function createLog(source: string): number {
  return (db.prepare(
    `INSERT INTO import_logs (source, status) VALUES (?, 'running')`
  ).run(source).lastInsertRowid) as number;
}

function completeLog(id: number, status: 'success' | 'error', error?: string) {
  db.prepare(
    `UPDATE import_logs SET status = ?, error_message = ?, completed_at = datetime('now') WHERE id = ?`
  ).run(status, error ?? null, id);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const logIdIdx = rawArgs.indexOf('--log-id');
  const externalLogId = logIdIdx !== -1 ? parseInt(rawArgs[logIdIdx + 1]) : null;
  const sources = rawArgs.filter((a, i) => !a.startsWith('--') && rawArgs[i - 1] !== '--log-id');
  const toRun = sources.length === 0 ? ['redfin'] : sources;

  for (const source of toRun) {
    console.log(`\n→ Starting import: ${source}`);
    const logId = (externalLogId && toRun.length === 1) ? externalLogId : createLog(source);

    try {
      if (source === 'redfin') {
        // The scraper finalises its own log row (success or error) when given --log-id,
        // so only a crash that escapes it is recorded here.
        execSync(`npx tsx scripts/scrape-redfin.ts --log-id ${logId}`, { stdio: 'inherit' });
        console.log(`✓ ${source} finished`);
        continue;
      } else if (source === 'zillow') {
        const { importZillow } = await import('./importers/zillow');
        await importZillow(db, logId);
      } else if (source === 'demo') {
        execSync(`npx tsx scripts/seed-demo.ts --log-id ${logId}`, { stdio: 'inherit' });
        db.prepare(
          `UPDATE import_logs SET status = 'success', completed_at = datetime('now') WHERE id = ?`
        ).run(logId);
        continue;
      } else {
        throw new Error(`Unknown source: "${source}". Valid options: ${VALID_SOURCES.join(', ')}`);
      }
      completeLog(logId, 'success');
      console.log(`✓ ${source} succeeded`);
    } catch (e) {
      const msg = (e as Error).message;
      completeLog(logId, 'error', msg);
      console.error(`✗ ${source} failed: ${msg}`);
    }
  }

  db.close();
}

main().catch(console.error);
