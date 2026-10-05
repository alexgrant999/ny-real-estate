/**
 * Geocodes listings that are missing lat/lng using the US Census Geocoder.
 * Free, no API key, no strict rate limit.
 *
 * Usage:
 *   npx tsx scripts/geocode.ts              # geocode all missing
 *   npx tsx scripts/geocode.ts --limit 100  # geocode up to 100
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const args = process.argv.slice(2);
const limit = parseInt(args[args.indexOf('--limit') + 1] || '2000');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const CENSUS_BASE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

async function geocode(address: string, borough: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${address}, ${borough}, New York, NY`;
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
const updateNeighborhood = db.prepare('UPDATE listings SET neighborhood = @neighborhood WHERE id = @id');

// Reverse geocode neighborhood using Nominatim (as backup, with rate limiting)
async function reverseNeighborhood(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`;
    const res = await fetch(url, { headers: { 'User-Agent': 'NYCApartmentFinder/1.0' } });
    if (!res.ok) return null;
    const data = await res.json() as { address?: { neighbourhood?: string; suburb?: string; quarter?: string } };
    return data.address?.neighbourhood || data.address?.suburb || data.address?.quarter || null;
  } catch {
    return null;
  }
}

async function main() {
  const rows = db.prepare(`
    SELECT id, address, unit, borough, neighborhood, lat, lng FROM listings
    WHERE lat IS NULL
    ORDER BY id
    LIMIT ?
  `).all(limit) as { id: number; address: string; unit: string | null; borough: string; neighborhood: string; lat: number | null; lng: number | null }[];

  console.log(`Geocoding ${rows.length} listings...\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${row.address}, ${row.borough}... `);

    const result = await geocode(row.address, row.borough);
    if (result) {
      update.run({ lat: result.lat, lng: result.lng, id: row.id });
      process.stdout.write(`${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`);
      success++;

      // If neighborhood is unknown, try reverse geocoding
      if (row.neighborhood === 'Unknown') {
        const hood = await reverseNeighborhood(result.lat, result.lng);
        if (hood) {
          updateNeighborhood.run({ neighborhood: hood, id: row.id });
          process.stdout.write(` → ${hood}`);
        }
        await sleep(1100); // Nominatim rate limit
      }
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
