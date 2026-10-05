/**
 * Prepares data/apartments.db to be shipped inside a Vercel deployment.
 *
 * SQLite cannot open a WAL-mode database on a read-only filesystem, because it needs
 * to create the -shm and -wal sidecar files. Vercel's /var/task is read-only, so the
 * copy that ships has to be folded into a single file and switched to journal_mode
 * DELETE. Running the app locally flips it back to WAL on the next open, which is why
 * this runs before every deploy rather than once.
 *
 * Usage: npm run deploy   (or npx tsx scripts/predeploy-db.ts)
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}. Run \`npm run seed\` or an import first.`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('wal_checkpoint(TRUNCATE)');
const [{ journal_mode: mode }] = db.pragma('journal_mode = delete') as { journal_mode: string }[];
const { count } = db.prepare('SELECT COUNT(*) as count FROM listings').get() as { count: number };
db.close();

if (mode !== 'delete') {
  console.error(`Expected journal_mode delete, got "${mode}". Deployment would 500 on a read-only filesystem.`);
  process.exit(1);
}

const sidecars = [`${DB_PATH}-wal`, `${DB_PATH}-shm`].filter(f => fs.existsSync(f));
const sizeMb = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);
console.log(`Database ready to ship: ${count} listings, ${sizeMb} MB, journal_mode=${mode}`);
if (sidecars.length) console.log(`Warning: sidecar files still present: ${sidecars.join(', ')}`);
