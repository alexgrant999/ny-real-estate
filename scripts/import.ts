/**
 * Main import orchestrator.
 *
 * Usage:
 *   npx tsx scripts/import.ts               # runs streeteasy
 *   npx tsx scripts/import.ts streeteasy    # StreetEasy only
 *   npx tsx scripts/import.ts demo          # seed demo data
 *
 * Required env vars (set in .env.local):
 *   RAPIDAPI_KEY  – Get at https://rapidapi.com/oneapi.project/api/st-easy-api
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
  const toRun = sources.length === 0 ? ['streeteasy'] : sources;

  for (const source of toRun) {
    console.log(`\n→ Starting import: ${source}`);
    const logId = (externalLogId && toRun.length === 1) ? externalLogId : createLog(source);

    try {
      if (source === 'streeteasy') {
        const { importStreetEasy } = await import('./importers/streeteasy');
        await importStreetEasy(db, logId);
      } else if (source === 'demo') {
        const { execSync } = await import('child_process');
        execSync('npx tsx scripts/seed-demo.ts', { stdio: 'inherit' });
        db.prepare(
          `UPDATE import_logs SET status = 'success', completed_at = datetime('now') WHERE id = ?`
        ).run(logId);
        continue;
      } else {
        throw new Error(`Unknown source: "${source}". Valid options: streeteasy, demo`);
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
