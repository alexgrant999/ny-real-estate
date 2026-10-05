/**
 * Geocodes listings that are missing lat/lng using the US Census Geocoder.
 * Free, no API key, no strict rate limit.
 *
 * Queries "<address>, <town>, NY <zip>". Rural Catskills addresses (Route 212, county
 * roads, hamlets without a street grid) do not always resolve; those rows stay NULL and
 * are simply left off the map.
 *
 * Usage:
 *   npx tsx scripts/geocode.ts              # geocode all missing
 *   npx tsx scripts/geocode.ts --limit 100  # geocode up to 100
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { applySchema } from '../src/lib/schema';

const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
applySchema(db);

const args = process.argv.slice(2);
const limit = parseInt(args[args.indexOf('--limit') + 1] || '2000');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const CENSUS_BASE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

async function geocode(address: string, town: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${address}, ${town}, NY ${zip}`.trim();
  const url = `${CENSUS_BASE}?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as {
      result?: { addressMatches?: { coordinates: { x: number; y: number } }[] };
    };
    const match = data.result?.addressMatches?.[0];
    if (!match) return null;
    return { lat: match.coordinates.y, lng: match.coordinates.x };
  } catch {
    return null;
  }
}

const update = db.prepare('UPDATE listings SET lat = @lat, lng = @lng WHERE id = @id');

interface Row {
  id: number;
  address: string;
  unit: string | null;
  region: string;
  neighborhood: string;
  zip_code: string;
}

async function main() {
  const rows = db.prepare(`
    SELECT id, address, unit, region, neighborhood, zip_code FROM listings
    WHERE lat IS NULL
    ORDER BY id
    LIMIT ?
  `).all(limit) as Row[];

  console.log(`Geocoding ${rows.length} listings...\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${row.address}, ${row.neighborhood} ${row.zip_code} (${row.region})... `);

    const result = await geocode(row.address, row.neighborhood, row.zip_code);
    if (result) {
      update.run({ lat: result.lat, lng: result.lng, id: row.id });
      process.stdout.write(`${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`);
      success++;
    } else {
      process.stdout.write('not found');
      failed++;
    }

    console.log('');
    await sleep(200); // Small delay between Census API calls
  }

  console.log(`\n✓ Geocoded ${success} listings, ${failed} not found`);
  db.close();
}

main().catch(e => { console.error(e); db.close(); });
