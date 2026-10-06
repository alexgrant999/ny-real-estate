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
import { getSql, closeSql } from '../src/lib/db';
import { applySchema } from '../src/lib/schema';
import { loadEnv } from './env';

loadEnv();
const sql = getSql();

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

interface Row {
  id: number;
  address: string;
  unit: string | null;
  region: string;
  neighborhood: string;
  zip_code: string;
}

async function main() {
  await applySchema(sql);
  const rows = await sql<Row[]>`
    SELECT id, address, unit, region, neighborhood, zip_code FROM listings
    WHERE lat IS NULL
    ORDER BY id
    LIMIT ${limit}
  `;

  console.log(`Geocoding ${rows.length} listings...\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${row.address}, ${row.neighborhood} ${row.zip_code} (${row.region})... `);

    const result = await geocode(row.address, row.neighborhood, row.zip_code);
    if (result) {
      await sql`UPDATE listings SET lat = ${result.lat}, lng = ${result.lng} WHERE id = ${row.id}`;
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
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => closeSql());
