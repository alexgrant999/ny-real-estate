/**
 * Zillow importer via RapidAPI (zillow-com1).
 * API: https://rapidapi.com/apimaker/api/zillow-com1
 *
 * Strategy (minimises requests):
 *  Phase 1 – propertyExtendedSearch by zip code (1 req per zip, ~40 listings each)
 *  Phase 2 – propertyDetails only for listings with no price history yet (new listings)
 *
 * Free tier: 500 req/month. With 15 zip codes = 15 search reqs + up to 485 detail reqs.
 * Run weekly and you'll stay well within limits.
 */
import Database from 'better-sqlite3';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const BASE_URL = 'https://zillow-com1.p.rapidapi.com';
const HEADERS = () => ({
  'X-RapidAPI-Key': RAPIDAPI_KEY!,
  'X-RapidAPI-Host': 'zillow-com1.p.rapidapi.com',
});

// Zip codes → neighborhood + borough mapping
// Focus on the most active areas for buyers
const ZIP_NEIGHBORHOODS: Record<string, { neighborhood: string; borough: 'Manhattan' | 'Brooklyn' }> = {
  // Manhattan
  '10001': { neighborhood: 'Chelsea', borough: 'Manhattan' },
  '10003': { neighborhood: 'East Village', borough: 'Manhattan' },
  '10011': { neighborhood: 'Chelsea', borough: 'Manhattan' },
  '10012': { neighborhood: 'SoHo', borough: 'Manhattan' },
  '10013': { neighborhood: 'Tribeca', borough: 'Manhattan' },
  '10014': { neighborhood: 'Greenwich Village', borough: 'Manhattan' },
  '10019': { neighborhood: 'Midtown West', borough: 'Manhattan' },
  '10023': { neighborhood: 'Upper West Side', borough: 'Manhattan' },
  '10024': { neighborhood: 'Upper West Side', borough: 'Manhattan' },
  '10025': { neighborhood: 'Upper West Side', borough: 'Manhattan' },
  '10028': { neighborhood: 'Upper East Side', borough: 'Manhattan' },
  '10065': { neighborhood: 'Upper East Side', borough: 'Manhattan' },
  // Brooklyn
  '11201': { neighborhood: 'Brooklyn Heights / DUMBO', borough: 'Brooklyn' },
  '11211': { neighborhood: 'Williamsburg', borough: 'Brooklyn' },
  '11215': { neighborhood: 'Park Slope', borough: 'Brooklyn' },
  '11217': { neighborhood: 'Boerum Hill', borough: 'Brooklyn' },
  '11222': { neighborhood: 'Greenpoint', borough: 'Brooklyn' },
  '11231': { neighborhood: 'Carroll Gardens', borough: 'Brooklyn' },
  '11238': { neighborhood: 'Prospect Heights', borough: 'Brooklyn' },
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function apiFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = `${BASE_URL}/${endpoint}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: HEADERS() });

  if (res.status === 429) throw new Error('Rate limit hit – try again later');
  if (res.status === 403) throw new Error('Invalid API key or not subscribed to zillow-com1');
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);

  return res.json();
}

// Parse "$50,000" → 50000  or  null
function parsePriceString(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.-]/g, ''));
  return isNaN(n) || n === 0 ? null : n;
}

function normaliseHomeType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const map: Record<string, string> = {
    CONDO: 'Condo', APARTMENT: 'Condo', MULTI_FAMILY: 'Multi-family',
    TOWNHOUSE: 'Townhouse', COOP: 'Co-op', SINGLE_FAMILY: 'Single-family',
  };
  return map[raw.toUpperCase()] ?? raw;
}

// ─── Phase 1: search ──────────────────────────────────────────────────────────

async function searchZip(
  zipCode: string,
  meta: { neighborhood: string; borough: 'Manhattan' | 'Brooklyn' }
): Promise<{ zpid: string; meta: typeof meta; searchData: Record<string, unknown> }[]> {
  const data = await apiFetch('propertyExtendedSearch', {
    location: zipCode,
    status_type: 'ForSale',
    home_type: 'Condos,Apartments,Townhomes',
  }) as Record<string, unknown>;

  const props = (data?.props ?? data?.results ?? []) as Record<string, unknown>[];
  return props
    .filter(p => p.zpid)
    .map(p => ({ zpid: String(p.zpid), meta, searchData: p }));
}

// ─── Phase 2: details ─────────────────────────────────────────────────────────

async function fetchDetails(zpid: string): Promise<Record<string, unknown>> {
  const data = await apiFetch('propertyDetails', { zpid }) as Record<string, unknown>;
  // API returns {data: {home: {...}}} or flat object depending on version
  return (data?.data as Record<string, unknown>)?.home as Record<string, unknown> ?? data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function importZillow(db: Database.Database, logId: number) {
  if (!RAPIDAPI_KEY?.trim()) {
    throw new Error(
      'RAPIDAPI_KEY is not set.\n' +
      '  1. Sign up at https://rapidapi.com\n' +
      '  2. Subscribe to zillow-com1 (free tier)\n' +
      '  3. Add RAPIDAPI_KEY=your_key to .env.local\n' +
      '  4. Re-run the import'
    );
  }

  const insertListing = db.prepare(`
    INSERT INTO listings (
      external_id, source, address, unit, neighborhood, borough, zip_code, lat, lng,
      bedrooms, bathrooms, sqft, price, price_per_sqft, hoa_fee, tax_annual,
      listing_status, listing_type, days_on_market, listed_date,
      last_price_reduction_date, original_price, price_reduction_amount, price_reduction_pct,
      description, image_url, listing_url, imported_at
    ) VALUES (
      @external_id, @source, @address, @unit, @neighborhood, @borough, @zip_code, @lat, @lng,
      @bedrooms, @bathrooms, @sqft, @price, @price_per_sqft, @hoa_fee, @tax_annual,
      @listing_status, @listing_type, @days_on_market, @listed_date,
      @last_price_reduction_date, @original_price, @price_reduction_amount, @price_reduction_pct,
      @description, @image_url, @listing_url, @imported_at
    )
    ON CONFLICT(external_id) DO UPDATE SET
      price           = excluded.price,
      price_per_sqft  = excluded.price_per_sqft,
      days_on_market  = excluded.days_on_market,
      listing_status  = excluded.listing_status,
      last_price_reduction_date = excluded.last_price_reduction_date,
      price_reduction_amount    = excluded.price_reduction_amount,
      price_reduction_pct       = excluded.price_reduction_pct,
      image_url       = excluded.image_url,
      imported_at     = excluded.imported_at
  `);

  const insertHistory = db.prepare(`
    INSERT OR IGNORE INTO price_history (listing_id, price, event_type, event_date)
    VALUES (@listing_id, @price, @event_type, @event_date)
  `);

  const updateLog = db.prepare(`
    UPDATE import_logs SET listings_added = ?, listings_updated = ? WHERE id = ?
  `);

  let added = 0, updated = 0, reqCount = 0;

  // ── Phase 1: search all zips ───────────────────────────────────────────────
  console.log('\n── Phase 1: searching zip codes ─────────────────────────────');
  const allResults: { zpid: string; meta: { neighborhood: string; borough: 'Manhattan' | 'Brooklyn' }; searchData: Record<string, unknown> }[] = [];

  for (const [zip, meta] of Object.entries(ZIP_NEIGHBORHOODS)) {
    process.stdout.write(`  ${zip} (${meta.neighborhood})... `);
    try {
      const results = await searchZip(zip, meta);
      reqCount++;
      allResults.push(...results);
      console.log(`${results.length} listings`);
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
    }
    await sleep(600);
  }

  console.log(`\n  Found ${allResults.length} listings across ${Object.keys(ZIP_NEIGHBORHOODS).length} zip codes`);

  // ── Upsert from search data ────────────────────────────────────────────────
  console.log('\n── Upserting from search data ───────────────────────────────');
  const newZpids: string[] = [];

  for (const { zpid, meta, searchData: s } of allResults) {
    const externalId = `zillow-${zpid}`;
    const existing = db.prepare('SELECT id FROM listings WHERE external_id = ?').get(externalId) as { id: number } | undefined;

    const price = Number(s.price ?? s.unformattedPrice ?? 0);
    const reductionRaw = parsePriceString(s.priceReduction as string);
    const originalPrice = reductionRaw && price ? price + reductionRaw : price;
    const reductionPct = reductionRaw && originalPrice > 0
      ? Math.round((reductionRaw / originalPrice) * 1000) / 10
      : null;
    const sqft = Number(s.livingArea ?? s.lotAreaValue ?? 0) || null;
    const pricePerSqft = sqft && price ? Math.round(price / sqft) : null;

    const row = {
      external_id: externalId,
      source: 'zillow',
      address: String(s.address ?? s.streetAddress ?? ''),
      unit: (s.unit as string | null) ?? null,
      neighborhood: meta.neighborhood,
      borough: meta.borough,
      zip_code: String(s.zipcode ?? s.zip ?? (s.address as string)?.match(/\d{5}/)?.[0] ?? ''),
      lat: Number(s.latitude ?? s.lat ?? 0) || null,
      lng: Number(s.longitude ?? s.lon ?? 0) || null,
      bedrooms: Number(s.bedrooms ?? s.beds ?? 0) || null,
      bathrooms: Number(s.bathrooms ?? s.baths ?? 0) || null,
      sqft,
      price,
      price_per_sqft: pricePerSqft,
      hoa_fee: null as number | null,
      tax_annual: null as number | null,
      listing_status: 'for_sale',
      listing_type: normaliseHomeType(s.propertyType as string ?? s.homeType as string),
      days_on_market: Number(s.daysOnMarket ?? s.daysOnZillow ?? 0) || null,
      listed_date: (s.dateSold ?? s.datePosted ?? null) as string | null,
      last_price_reduction_date: null as string | null,
      original_price: originalPrice !== price ? originalPrice : null,
      price_reduction_amount: reductionRaw,
      price_reduction_pct: reductionPct,
      description: null as string | null,
      image_url: (s.imgSrc ?? s.image ?? null) as string | null,
      listing_url: `https://www.zillow.com/homes/${zpid}_zpid/`,
      imported_at: new Date().toISOString(),
    };

    insertListing.run(row);

    if (existing) {
      updated++;
    } else {
      added++;
      newZpids.push(zpid); // need to fetch details for new listings
    }
  }

  console.log(`  ${added} new, ${updated} updated`);

  // ── Phase 2: fetch details for new listings (price history + HOA) ──────────
  if (newZpids.length > 0) {
    console.log(`\n── Phase 2: fetching details for ${newZpids.length} new listings ─`);
    let detailsDone = 0;

    for (const zpid of newZpids) {
      process.stdout.write(`  zpid ${zpid}... `);
      try {
        const p = await fetchDetails(zpid);
        reqCount++;

        const listingRow = db.prepare('SELECT id, price FROM listings WHERE external_id = ?')
          .get(`zillow-${zpid}`) as { id: number; price: number } | undefined;
        if (!listingRow) { console.log('not found, skipping'); continue; }

        // Update detail fields
        db.prepare(`
          UPDATE listings SET
            unit         = COALESCE(@unit, unit),
            hoa_fee      = @hoa_fee,
            tax_annual   = @tax_annual,
            description  = @description,
            listed_date  = COALESCE(@listed_date, listed_date),
            last_price_reduction_date = @last_price_reduction_date
          WHERE id = @id
        `).run({
          id: listingRow.id,
          unit: (p.unit as string | null) ?? null,
          hoa_fee: Number(p.hoaFee ?? 0) || null,
          tax_annual: Number(p.annualTaxAmount ?? 0) || null,
          description: (p.description as string | null) ?? null,
          listed_date: (p.datePosted as string | null) ?? null,
          last_price_reduction_date: (
            (p.priceHistory as { event: string; date: string }[] | null)
              ?.find(h => h.event === 'Price cut')?.date ?? null
          ),
        });

        // Insert price history events
        const history = (p.priceHistory as { price: number; event: string; date: string }[] | null) ?? [];
        for (const event of history) {
          const eventType =
            event.event === 'Listed for sale' ? 'listed' :
            event.event === 'Price cut'       ? 'reduced' :
            event.event === 'Price increase'  ? 'increased' : 'relisted';
          insertHistory.run({
            listing_id: listingRow.id,
            price: event.price,
            event_type: eventType,
            event_date: event.date,
          });
        }

        // If no history from API, insert a synthetic "listed" event
        if (history.length === 0) {
          const listedDate = db.prepare('SELECT listed_date FROM listings WHERE id = ?')
            .get(listingRow.id) as { listed_date: string | null };
          if (listedDate?.listed_date) {
            insertHistory.run({
              listing_id: listingRow.id,
              price: listingRow.price,
              event_type: 'listed',
              event_date: listedDate.listed_date,
            });
          }
        }

        detailsDone++;
        console.log(`done (${history.length} history events)`);
      } catch (e) {
        console.log(`FAILED: ${(e as Error).message}`);
      }
      await sleep(400);
    }

    console.log(`  Fetched details for ${detailsDone}/${newZpids.length} new listings`);
  }

  updateLog.run(added, updated, logId);
  console.log(`\n✓ Zillow import complete — ${added} added, ${updated} updated, ${reqCount} API requests used`);
}

// ─── Quick test: verify key + connectivity ────────────────────────────────────

export async function testZillowKey(): Promise<{ ok: boolean; message: string }> {
  if (!RAPIDAPI_KEY?.trim()) {
    return { ok: false, message: 'RAPIDAPI_KEY is not set in .env.local' };
  }
  try {
    const data = await apiFetch('propertyExtendedSearch', {
      location: '10013',
      status_type: 'ForSale',
      home_type: 'Condos',
    }) as Record<string, unknown>;
    const count = ((data?.props ?? data?.results ?? []) as unknown[]).length;
    return { ok: true, message: `Connected — got ${count} listings for Tribeca (10013)` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
