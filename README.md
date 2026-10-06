# Catskills Homes

A personal deal finder for homes and land in the Woodstock and Tannersville areas of the
Catskills. Imports active listings from Redfin (no API key), tracks price history across
imports, surfaces deals with preset queries, compares listings side by side, plots them on a
map, and charts market trends built from its own monthly snapshots.

Forked from the NYC apartment finder; same stack (Next.js 14, TypeScript, Tailwind, Postgres on Neon),
different geography and data source.

## Quick start

```bash
npm install
npm run seed        # ~300 fake Catskills listings, no network needed
npm run dev         # http://localhost:3000
```

To replace the demo data with live listings:

```bash
npm run scrape      # all active towns, sales + rentals (~1 minute)
```

or use the Import page in the app to pick towns and watch the log.

## Areas

Two regions, defined in `src/lib/areas.ts`:

| Region | Towns scraped by default |
|--------|--------------------------|
| Woodstock area (Ulster) | Woodstock, Bearsville, Lake Hill, Willow, Mount Tremper, Phoenicia, Boiceville, Glenford, West Hurley, Shokan, West Shokan |
| Tannersville area (Greene) | Tannersville, Hunter, Haines Falls, Elka Park, Lanesville, Jewett, Windham, Hensonville, Maplecrest, Palenville |

Further-out towns (Saugerties, Hurley, Olivebridge, Shandaken, Big Indian, Chichester, Lexington,
Round Top, Ashland, Prattsville, Cairo, Catskill) are configured but off by default. Flip
`active` in `areas.ts`, toggle them on the Import page, or pass `--towns`.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run scrape` | Redfin import. Flags: `--towns woodstock,hunter`, `--region tannersville`, `--all-towns`, `--sale-only`, `--rental-only`, `--no-details`, `--details-limit N` (default 120), `--debug` |
| `npm run seed` | Demo listings, benchmarks and a year of market history |
| `npm run benchmarks` | Recompute median $/sqft per town from current listings |
| `npm run snapshot` | Write this month's market snapshot from current listings |
| `npm run rollup` | Fold price history into the reduction columns |
| `npm run geocode` | Fill missing coordinates via the US Census geocoder |
| `npm run import zillow` | Optional secondary source, needs `RAPIDAPI_KEY` |
| `npm run deploy` | `vercel --prod` |

## How the Redfin import works

Each town is a zip code with a Redfin region id. One search request per town per category
returns up to 350 active listings with coordinates, lot size, year built and days on market.
New sale listings get one extra request for the MLS price history and the latest tax bill.
Listings that vanish from a scraped town are marked off-market rather than deleted. Requests
are spaced 1.5 seconds apart; a 403 or 429 backs off and retries.

See `CLAUDE.md` for the full architecture notes.
