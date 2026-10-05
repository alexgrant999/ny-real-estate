# NYC Real Estate

NYC apartment deal finder. Imports listings from StreetEasy (and optionally Zillow) via RapidAPI, tracks price history, surfaces deals via preset queries, compares listings side-by-side, and visualises market trends with Recharts. Personal tool — no auth, no multi-user.

## Claude Brain

At the start of every session, load project context from the central intelligence layer:

```bash
cd /Users/alexgrant/development/claude-brain && npm run context real-estate
```

This outputs all stored instructions, how-to guides, prompt profiles, and preferences for this project. Treat the output as additional context for the session.

## Tech Stack

- **Framework**: Next.js 14.2.35 (App Router) + TypeScript strict
- **Styling**: Tailwind CSS v3.4 — utilities only, no component libraries
- **Database**: SQLite via `better-sqlite3` 12.8 (local file: `data/apartments.db`)
- **Charts**: Recharts 3.8
- **No ORM** — direct SQL with prepared statements
- **Scripts**: `tsx` for running TypeScript scripts outside Next.js
- **Claude Brain client**: `postgres` 3.4 for connecting to central brain DB
- **Import alias**: `@/*` → `src/*`

## Project Structure

```
src/
  app/
    page.tsx                    # Redirects to /listings
    layout.tsx                  # Root layout with Navbar
    globals.css                 # Tailwind base styles
    listings/page.tsx           # Browse + filter (server component)
    deals/page.tsx              # Deal presets (server component)
    compare/page.tsx            # Side-by-side up to 4 listings (server)
    market/page.tsx             # Market trends dashboard (client)
    listing/[id]/page.tsx       # Detail view (server)
    import/page.tsx             # Import UI (client)
    api/
      listings/route.ts         # GET — filtered listings + stats + neighborhoods
      listings/[id]/route.ts    # GET — single listing by ID
      deals/route.ts            # GET — deal presets + counts
      market-trends/route.ts    # GET — areas, trend data, count
      price-history/[id]/route.ts # GET — price history for a listing
      import/route.ts           # GET logs, POST spawns import script
      import/test/route.ts      # GET — test StreetEasy API key
  components/
    ui/Badge.tsx                # Reusable badge (color variants)
    nav/Navbar.tsx              # Sticky top nav (client — usePathname)
    listings/ListingsTable.tsx  # Client — sort, paginate, compare checkboxes
    listings/ListingsFilters.tsx # Client — URL-driven filter controls
    charts/PriceHistoryChart.tsx # Client — Recharts line chart for price events
  lib/
    db.ts                       # Singleton SQLite connection (WAL mode, FK on)
    schema.ts                   # Table creation + runMigrations()
    types.ts                    # Listing, PriceHistoryEntry, ListingFilters, DealPreset, etc.
    utils.ts                    # formatPrice, domColor, bedsLabel, streetEasyUrl, zillowSearchUrl
    brain.ts                    # Claude Brain TypeScript client (postgres)
    brain-types.ts              # Brain type definitions
    queries/
      listings.ts               # getListings, getListingById, getDealListings, getDealCounts, etc.
      market.ts                 # getMarketAreas, getMarketTrend, getMarketTrendCount
  instrumentation.ts            # Runs runMigrations() on Next.js startup

scripts/
  import.ts                     # Orchestrates import (loads .env.local manually)
  seed-demo.ts                  # ~200 fake listings + benchmarks
  import-market-data.ts         # Imports StreetEasy CSVs from local folder
  importers/
    streeteasy.ts               # RapidAPI ST Easy fetcher (dual-pass: listed + price_reduction)
    zillow.ts                   # RapidAPI Zillow fetcher (search + detail phases)

data/
  apartments.db                 # SQLite database file (gitignored)
```

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/` | Server | Redirects to `/listings` |
| `/listings` | Server | Browse all active listings with filters, stats banner, sortable table |
| `/listing/[id]` | Server | Detail view — price, stats, price history chart, external links |
| `/deals` | Server | 6 deal presets (reduced 7d/30d, DOM 60+/90+, below median $/sqft, big reductions) |
| `/compare` | Server | Side-by-side comparison of up to 4 listings (via `?ids=1,2,3`) |
| `/market` | Client | Market trends dashboard — 8 metrics × selectable area × time range |
| `/import` | Client | Import UI — run StreetEasy/demo imports, test API key, view import history |

### API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/listings` | GET | Filtered listings with pagination, stats, neighborhood list |
| `/api/listings/[id]` | GET | Single listing by ID |
| `/api/deals` | GET | Without `?preset` returns counts; with preset returns matching listings |
| `/api/market-trends` | GET | `?action=areas` for area list, `?action=count` for data check, `?area=X` for trend data |
| `/api/price-history/[id]` | GET | Price history events for a listing |
| `/api/import` | GET/POST | GET returns import logs; POST spawns detached `tsx` import script |
| `/api/import/test` | GET | Tests StreetEasy API key connectivity |

All API routes use `export const dynamic = 'force-dynamic'`.

## Database Schema

SQLite with WAL mode + foreign key constraints. 5 tables:

### `listings`
Core table. Key fields: `external_id` (unique), `source` (streeteasy/zillow/demo), `address`, `unit`, `neighborhood`, `borough` (Manhattan/Brooklyn), `zip_code`, `lat/lng`, `bedrooms`, `bathrooms`, `sqft`, `price`, `price_per_sqft`, `hoa_fee`, `tax_annual`, `listing_status` (for_sale/pending/off_market), `listing_type` (Condo/Co-op/Townhouse), `days_on_market`, `listed_date`, `original_price`, `price_reduction_amount`, `price_reduction_pct`, `last_price_reduction_date`, `first_seen_at`, `imported_at`.

Indexes on: borough, neighborhood, price, days_on_market, bedrooms, listing_status, price_reduction_pct.

### `price_history`
Tracks price events per listing. Fields: `listing_id` (FK → listings), `price`, `event_type` (listed/reduced/increased/relisted), `event_date`. Unique on `(listing_id, event_date, event_type)`.

### `neighborhood_benchmarks`
Median price/ppsf per neighborhood+borough+bedrooms. Used for "below median $/sqft" deal detection. Seeded by demo script; not auto-computed from live data.

### `market_trends`
Time-series market data. Fields: `area_name`, `borough`, `area_type` (neighborhood/submarket/borough/city), `metric`, `period` (YYYY-MM), `value`. 8 metrics: medianAskingPrice, medianSalesPrice, daysOnMarket, totalInventory, priceCutShare, saleListRatio, recordedSalesVolume, priceIndex.

### `import_logs`
Audit trail for imports. Fields: `source`, `status` (running/success/error), `listings_added`, `listings_updated`, `error_message`, `started_at`, `completed_at`.

Migrations run automatically via `instrumentation.ts` on Next.js startup. Add new migrations to `schema.ts` → `runMigrations()`.

## Key Services

### `lib/queries/listings.ts`
- `getListings(filters)` — main query with dynamic WHERE, JOIN to benchmarks, pagination
- `getListingById(id)` / `getListingsByIds(ids)` — single/multi lookup with benchmark join
- `getPriceHistory(listingId)` — ordered price events
- `getDistinctNeighborhoods()` — for filter dropdowns
- `getListingStats()` — aggregate counts (total, price reduced, stale, price range)
- `getDealListings(preset)` / `getDealCounts()` — 6 preset deal queries

### `lib/queries/market.ts`
- `getMarketAreas(areaType?)` — distinct areas for selector
- `getMarketTrend(areaName, metrics, fromPeriod?)` — time-series data
- `getMarketTrendCount()` — check if market data is imported

### `scripts/importers/streeteasy.ts`
Dual-pass import: first fetches listings sorted by `listed_desc` (up to 100 pages × 2 boroughs), then a second pass sorted by `price_reduction` (10 pages × 2 boroughs) to catch recent cuts. Upserts listings, detects price changes between runs, computes DOM from `first_seen_at`.

### `scripts/importers/zillow.ts`
Two-phase import: Phase 1 searches by zip code (19 zips), Phase 2 fetches property details for new listings only (price history, HOA, tax, description).

### `scripts/import-market-data.ts`
Reads StreetEasy CSV files from a local folder (default: Google Drive Downloads2025). Handles standard format (area × period matrix) and wide format (priceIndex). Parses 8 metrics into `market_trends` table.

## Authentication & Authorisation

None. This is a personal tool with no auth layer. Do not add one.

## External Integrations

| Integration | Purpose | Config |
|-------------|---------|--------|
| **StreetEasy via RapidAPI** (ST Easy API) | Primary listing source — Manhattan & Brooklyn active for-sale | `RAPIDAPI_KEY` in `.env.local`. Free tier: 500 req/month. ~210 listings per run |
| **Zillow via RapidAPI** (zillow-com1) | Alternative listing source (not currently used in import orchestrator) | Same `RAPIDAPI_KEY`. Free tier: 500 req/month |
| **Claude Brain** (Postgres) | Shared intelligence layer for prompts/instructions | `CLAUDE_BRAIN_DATABASE_URL` in `.env.local` |

## Component Patterns

- **URL-driven filters**: All filter state lives in query params via `useSearchParams()` + `router.push()`. No Zustand, no React context. Enables shareable URLs and back button support
- **Server Components for data**: Listings, deals, compare, detail pages are async server components that call query functions directly. Only interactive UI (filters, table, charts, import) is `'use client'`
- **Client-side data refresh**: `ListingsTable` re-fetches via `/api/listings` when searchParams change. Market page and import page use `useEffect` + `fetch`
- **Recharts for charts**: `PriceHistoryChart` (step-after line with colored dots per event type) and `MarketPage` (8 mini line charts in a 4-col grid)
- **Compare flow**: Checkboxes in `ListingsTable` → max 4 → blue compare bar → `/compare?ids=1,2,3,4`
- **Badge component**: Simple `Badge` with color variants (green/yellow/red/blue/gray/orange) used for DOM indicators and status labels
- **External links**: Every listing row/detail has StreetEasy and Zillow search links built from address

## Environment Variables

```
RAPIDAPI_KEY                    # StreetEasy + Zillow API access (RapidAPI)
CLAUDE_BRAIN_DATABASE_URL       # Postgres connection string for claude-brain
```

## Key Files

| File | Description |
|------|-------------|
| `src/lib/db.ts` | Singleton SQLite connection with WAL mode |
| `src/lib/schema.ts` | All table DDL + indexes + migrations |
| `src/lib/types.ts` | Core types: Listing, ListingFilters, DealPreset, PriceHistoryEntry |
| `src/lib/queries/listings.ts` | All listing queries including 6 deal presets |
| `src/lib/queries/market.ts` | Market trend queries |
| `src/lib/utils.ts` | formatPrice, domColor, bedsLabel, streetEasyUrl, buildListingUrl |
| `src/instrumentation.ts` | Auto-runs migrations on Next.js startup |
| `src/app/listings/page.tsx` | Main browse page (server component with filters + table) |
| `src/app/deals/page.tsx` | Deal presets page with 6 query cards |
| `src/app/compare/page.tsx` | Side-by-side comparison table |
| `src/app/market/page.tsx` | Market trends dashboard (client, 8 metric charts) |
| `src/app/listing/[id]/page.tsx` | Listing detail with price history |
| `src/app/import/page.tsx` | Import UI with test/run/history |
| `src/components/listings/ListingsTable.tsx` | Sortable table with compare checkboxes + pagination |
| `src/components/listings/ListingsFilters.tsx` | URL-driven filter bar |
| `src/components/charts/PriceHistoryChart.tsx` | Price history line chart |
| `scripts/importers/streeteasy.ts` | StreetEasy dual-pass importer |
| `scripts/importers/zillow.ts` | Zillow two-phase importer |
| `scripts/import.ts` | Import orchestrator |
| `scripts/seed-demo.ts` | Demo data generator (~200 listings + benchmarks) |
| `scripts/import-market-data.ts` | StreetEasy CSV market data importer |
| `next.config.mjs` | Enables instrumentation hook + externalizes better-sqlite3 |

## Development

```bash
npm run dev              # Start dev server
npm run seed             # Seed ~200 demo listings (no API key needed)
npm run import           # Run StreetEasy import (needs RAPIDAPI_KEY)
npm run import-market    # Import market CSVs from local folder
npm run build            # Production build
```

- Database auto-creates on first run via `instrumentation.ts`
- Demo data is sufficient to test all features except market trends (need `npm run import-market`)
- StreetEasy import: ~210 listings per run, safe to run 2x/week on free tier
- Import runs as detached subprocess — check import history on `/import` page
- Days on market computed from `first_seen_at`, not from API data

## Data Sources

- **StreetEasy** via RapidAPI (ST Easy API) — free tier: 500 req/month. ~210 listings per run
- **Zillow** via RapidAPI (zillow-com1) — available but not wired into default import orchestrator
- **Market CSVs** — downloaded StreetEasy data files, imported via `npm run import-market`
- **Demo seed** — `npm run seed` for local dev without API key

## What I Don't Want

- No ORM — keep raw SQL
- Don't move filter state into Zustand or React context — URL params are the source of truth
- Don't add an auth layer — this is a personal tool
- No component libraries (shadcn, MUI, etc.) — hand-rolled Tailwind components only
