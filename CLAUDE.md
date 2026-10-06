# Catskills Homes

Deal finder for homes and land in the Woodstock and Tannersville areas of the Catskills (Ulster and Greene counties, NY). Imports active listings from Redfin, tracks price history across imports, surfaces deals via preset queries, compares listings side by side, maps them, and charts market trends from its own monthly snapshots. Personal tool — no auth, no multi-user.

Forked from the NYC apartment finder (`alexgrant999/real-estate`). Same stack and page structure; geography, data source and property model are different: houses and acreage, not apartments.

## Claude Brain

At the start of every session, load project context from the central intelligence layer:

```bash
cd /Users/alexgrant/development/claude-brain && npm run context ny-real-estate
```

Treat the output as additional context for the session (the brain client lives in `src/lib/brain.ts`; it is not used by the app itself).

## Tech Stack

- **Framework**: Next.js 14.2 (App Router) + TypeScript strict
- **Styling**: Tailwind CSS v3.4 — utilities only, no component libraries
- **Database**: Postgres (Neon) via the `postgres` npm package, `DATABASE_URL` in `.env.local`
- **Charts**: Recharts 3 · **Map**: Leaflet 1.9 (client-only)
- **No ORM** — direct SQL with prepared statements
- **Scripts**: `tsx` for running TypeScript scripts outside Next.js
- **Import alias**: `@/*` → `src/*`

## Geography model

`src/lib/areas.ts` is the single source of truth.

- **Region** (`listings.region`): `'Woodstock'` (Ulster side, Route 28 corridor, Ashokan hamlets) or `'Tannersville'` (Greene mountaintop down to Palenville). Labels via `REGION_LABELS` ("Woodstock area" / "Tannersville area"). This replaces the NYC app's `borough`.
- **Town** (`listings.neighborhood`): the post-office name, e.g. "Bearsville". The column keeps its old name; the UI says "Town".
- **`TOWNS`**: one entry per zip code with `slug`, `name`, `zip`, `region`, `redfinRegionId`, `lat`, `lng`, `active`. `active` controls what the default import scrapes. `redfinRegionId` is Redfin's id for the zip (region_type 2), resolved from their location autocomplete; stable.
- Helpers: `regionFor(zip, city)`, `townNameFor(zip, city)`, `townBySlug`, `townByZip`, `TOWNS_BY_REGION`.

`src/lib/config.ts` holds the non-geographic knobs: `APP_NAME`, default price caps for the "All" view (`DEFAULT_SALE_CAP`, `DEFAULT_RENT_CAP`), `MAP_CENTER`/`MAP_ZOOM`, and the scraper User-Agent.

## Project Structure

```
src/
  app/
    page.tsx                    # Redirects to /listings
    layout.tsx                  # Root layout with Navbar
    listings/page.tsx           # Browse + filter (server component)
    map/page.tsx                # Leaflet map (client, dynamic import)
    deals/page.tsx              # Deal presets (server)
    compare/page.tsx            # Side-by-side up to 4 listings (server)
    market/page.tsx             # Market trends from monthly snapshots (client)
    listing/[id]/page.tsx       # Detail view (server)
    import/page.tsx             # Import UI with town toggles + live log (client)
    api/
      listings/route.ts         # GET — filtered listings + stats + towns
      listings/[id]/route.ts    # GET — single listing
      deals/route.ts            # GET — deal presets + counts
      market-trends/route.ts    # GET — areas, trend data, count
      price-history/[id]/route.ts
      import/route.ts           # GET logs, POST spawns scrape-redfin.ts (or seed-demo.ts)
      import/log/route.ts       # GET — tail of a running import's log file
      import/test/route.ts      # GET — checks Redfin answers from this machine
  components/
    ui/Badge.tsx
    nav/Navbar.tsx
    listings/ListingsTable.tsx  # Client — sort, paginate, compare checkboxes
    listings/ListingsFilters.tsx # Client — URL-driven filters (region, town, beds, price, DOM, type, min acres)
    map/MapView.tsx             # Client — markers, draw-a-box, town labels
    charts/PriceHistoryChart.tsx
  lib/
    areas.ts                    # Regions, towns, Redfin ids (see above)
    config.ts                   # App name, price caps, map centre, UA
    db.ts                       # Singleton postgres.js client (getSql/closeSql, UTC, prepare off)
    schema.ts                   # SCHEMA_SQL + applySchema(db) + runMigrations()
    types.ts                    # Listing, ListingFilters, ListingType, DealPreset, ...
    utils.ts                    # formatPrice, lotLabel (acres), domColor, redfinSearchUrl, zillowSearchUrl
    queries/listings.ts         # getListings, getListingById, getDealListings, getDistinctTowns, ...
    queries/market.ts           # getMarketAreas, getMarketTrend, getMarketTrendCount
    brain.ts / brain-types.ts   # Claude Brain client (unused by the app)
  instrumentation.ts            # Runs runMigrations() on Next.js startup (local only)

scripts/
  scrape-redfin.ts              # Primary importer (sales by default, --rentals opts in; price history, taxes, off-market)
  import.ts                     # Orchestrator: redfin (default) | zillow | demo
  seed-demo.ts                  # ~300 fake Catskills listings + benchmarks + 12 months of trends
  compute-benchmarks.ts         # Median $/sqft and price per town → neighborhood_benchmarks
  snapshot-market.ts            # Monthly metrics per town/region/all → market_trends
  rollup-price-history.ts       # price_history → original_price / reduction columns
  geocode.ts                    # Census geocoder for rows missing lat/lng
  importers/zillow.ts           # Optional RapidAPI source (needs RAPIDAPI_KEY)

data/
  migrate-sqlite-to-pg.ts       # One-off copy of the old SQLite file into Postgres
  import-<id>.log               # Per-run import logs read by the Import page
```

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/listings` | Server | Browse with filters, stats banner, sortable table |
| `/map` | Client | Markers for everything with coordinates, draw-a-box filter, town labels |
| `/listing/[id]` | Server | Detail — price, lot, year built, taxes, price history, Redfin/Zillow links |
| `/deals` | Server | 6 presets (reduced 7d/30d, DOM 60+/90+, below town median $/sqft, 5%+ cuts) |
| `/compare` | Server | Up to 4 listings side by side (`?ids=1,2,3`) |
| `/market` | Client | 8 metrics × area (town / region / all) × time range |
| `/import` | Client | Pick towns, run the Redfin import, watch the log, test connectivity |

All API routes use `export const dynamic = 'force-dynamic'`.

## Database Schema

Postgres on Neon. DDL lives in `SCHEMA_SQL` (`src/lib/schema.ts`); every script calls `applySchema(sql)` on startup so nothing depends on the app having started. All date columns are TEXT holding ISO-ish strings; `import_logs` timestamps are always written with `now()::text` on a UTC session.

### `listings`
`external_id` (unique: `rf-<propertyId>`, `rf-rent-<rentalId>`, `demo-…`, `zillow-…`), `source` (redfin/zillow/demo), `address`, `unit`, `neighborhood` (town), `region`, `zip_code`, `lat/lng`, `bedrooms`, `bathrooms`, `sqft`, `lot_sqft`, `year_built`, `price`, `price_per_sqft` (sales, non-land), `hoa_fee`, `tax_annual`, `listing_status` (for_sale/pending/off_market), `listing_type` (House/Land/Multi-family/Condo/Townhouse/Manufactured/Apartment/Co-op/Other), `listing_category` (sale/rental), `days_on_market`, `listed_date`, `original_price`, `price_reduction_amount`, `price_reduction_pct`, `last_price_reduction_date`, `description`, `image_url`, `listing_url`, `available_at`, `off_market_at`, `price_delta_reported`, `first_seen_at`, `imported_at`.

### `price_history`
`listing_id` (FK, cascade), `price`, `event_type` (listed/reduced/increased/relisted), `event_date`. Unique on `(listing_id, event_date, event_type)`, which also dedupes the double-reported MLS events Redfin returns.

### `neighborhood_benchmarks`
Median `price_per_sqft` and price per `(neighborhood, region)` with `bedrooms IS NULL`, computed by `compute-benchmarks.ts` from current non-land sale listings (min sample 3). Drives "below median $/sqft".

### `market_trends`
`area_name`, `region`, `area_type` (town/region/all), `metric`, `period` (YYYY-MM), `value`. Metrics: medianAskingPrice, medianPricePerSqft, medianRent, totalInventory, rentalInventory, daysOnMarket, priceCutShare (0–1), medianLotAcres. Written by `snapshot-market.ts` at the end of every import; one row per metric per month, replaced on re-run.

### `import_logs`
`source`, `status` (running/success/error), `listings_added`, `listings_updated`, `error_message`, `started_at`, `completed_at`.

## Redfin importer (`scripts/scrape-redfin.ts`)

- Search: `GET https://www.redfin.com/stingray/api/gis?…&region_id=<zip id>&region_type=2` for sales, `…/stingray/api/v1/search/rentals?…` for rentals. Responses may be prefixed with `{}&&`. A browser User-Agent is required.
- Sale fields come wrapped as `{ value, level }`; `uiPropertyType` maps to our `ListingType` (1 House, 2 Condo, 3 Townhouse, 4 Multi-family, 5 Land, 7 Manufactured, 8 Co-op). `dom` is Redfin's own days-on-market; `listed_date` is derived from it. Photo URL pattern: `https://ssl.cdn-redfin.com/photo/<dataSourceId>/mbphotov3/<last 3 of mlsId>/genMid.<mlsId>_0.jpg` (some 404; the table hides broken images).
- Details: for new sale listings, `…/stingray/api/home/details/belowTheFold?propertyId&listingId&accessLevel=1` gives `propertyHistoryInfo.events` (Listed / Price Changed, often reported twice by two MLS feeds) and `publicRecordsInfo.taxInfo.taxesDue`. Only the current listing cycle (from the latest "Listed" event) is recorded. Capped per run by `--details-limit` (default 120).
- Price changes between runs are recorded as `reduced`/`increased` events dated today.
- Off-market: active Redfin rows in a successfully scraped zip that did not appear this run get `listing_status = 'off_market'`. Nothing is deleted.
- Then `rollupPriceHistory`, `computeBenchmarks`, `snapshotMarket`.
- 1.5s between requests; 403/429/5xx back off 20s/40s/60s then give up on that town.

## Component Patterns

- **URL-driven filters**: all filter state lives in query params via `useSearchParams()` + `router.push()`. No store, no context.
- **Server Components for data**: listings, deals, compare, detail pages call query functions directly. Only interactive UI is `'use client'`.
- **Client-side refresh**: `ListingsTable` re-fetches `/api/listings` when searchParams change. Market and import pages use `useEffect` + `fetch`.
- **Compare flow**: checkboxes in `ListingsTable` → max 4 → `/compare?ids=…`.
- **External links**: every row/detail has a Redfin link (direct `listing_url` when the source is Redfin, else a search) and a Zillow search link.

## Development

```bash
npm run dev          # start dev server (migrations run on startup)
npm run seed         # demo data, no network
npm run scrape       # live Redfin import for active towns
npm run typecheck    # tsc --noEmit
npm run lint
npm run build
```

- Lot sizes are stored in sqft and shown in acres (`lotLabel`).
- Days on market for Redfin rows is Redfin's figure; for demo/zillow rows it is derived from `first_seen_at`.
- The Import page spawns the scraper as a detached process and tails `data/import-<id>.log`.

## What I Don't Want

- No ORM — keep raw SQL
- Don't move filter state into Zustand or React context — URL params are the source of truth
- Don't add an auth layer — this is a personal tool
- No component libraries (shadcn, MUI, etc.) — hand-rolled Tailwind components only
- Don't hammer Redfin: keep the request gap, never parallelise town fetches
