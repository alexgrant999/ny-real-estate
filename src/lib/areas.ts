/**
 * Geography for the Catskills edition.
 *
 * Two regions, named after the towns the app was built around:
 *   Woodstock     – the Ulster County side: Woodstock, Bearsville and the Route 28 corridor
 *                   out to Phoenicia, plus the Ashokan hamlets.
 *   Tannersville  – the Greene County mountaintop: Tannersville, Hunter, Haines Falls,
 *                   Windham and the villages between them, down the escarpment to Palenville.
 *
 * Every "town" is a post office / zip code. Redfin indexes listings by zip (region_type 2),
 * which is the only unit that covers hamlets like Bearsville or Elka Park that Redfin has no
 * city entry for. The redfinRegionId is Redfin's internal id for that zip and was resolved
 * via their location autocomplete; it does not change.
 *
 * `active` marks the towns scraped by default. Toggle in the Import UI or pass --towns.
 */

export type Region = 'Woodstock' | 'Tannersville';

export const REGIONS: Region[] = ['Woodstock', 'Tannersville'];

export const REGION_LABELS: Record<Region, string> = {
  Woodstock: 'Woodstock area',
  Tannersville: 'Tannersville area',
};

export const REGION_DESCRIPTIONS: Record<Region, string> = {
  Woodstock: 'Ulster County · Woodstock, Bearsville, Route 28 corridor, Ashokan hamlets',
  Tannersville: 'Greene County mountaintop · Tannersville, Hunter, Haines Falls, Windham, Palenville',
};

export interface Town {
  slug: string;
  name: string;
  zip: string;
  region: Region;
  redfinRegionId: number;
  lat: number;
  lng: number;
  active: boolean;
}

export const TOWNS: Town[] = [
  // ── Woodstock area (Ulster County) ─────────────────────────────────────────
  { slug: 'woodstock',     name: 'Woodstock',     zip: '12498', region: 'Woodstock', redfinRegionId: 4240, lat: 42.041, lng: -74.118, active: true },
  { slug: 'bearsville',    name: 'Bearsville',    zip: '12409', region: 'Woodstock', redfinRegionId: 4164, lat: 42.045, lng: -74.158, active: true },
  { slug: 'lake-hill',     name: 'Lake Hill',     zip: '12448', region: 'Woodstock', redfinRegionId: 4197, lat: 42.071, lng: -74.206, active: true },
  { slug: 'willow',        name: 'Willow',        zip: '12495', region: 'Woodstock', redfinRegionId: 4238, lat: 42.097, lng: -74.214, active: true },
  { slug: 'mount-tremper', name: 'Mount Tremper', zip: '12457', region: 'Woodstock', redfinRegionId: 4206, lat: 42.047, lng: -74.263, active: true },
  { slug: 'phoenicia',     name: 'Phoenicia',     zip: '12464', region: 'Woodstock', redfinRegionId: 4212, lat: 42.082, lng: -74.316, active: true },
  { slug: 'chichester',    name: 'Chichester',    zip: '12416', region: 'Woodstock', redfinRegionId: 4170, lat: 42.110, lng: -74.280, active: false },
  { slug: 'boiceville',    name: 'Boiceville',    zip: '12412', region: 'Woodstock', redfinRegionId: 4167, lat: 42.000, lng: -74.267, active: true },
  { slug: 'glenford',      name: 'Glenford',      zip: '12433', region: 'Woodstock', redfinRegionId: 4185, lat: 42.004, lng: -74.157, active: true },
  { slug: 'west-hurley',   name: 'West Hurley',   zip: '12491', region: 'Woodstock', redfinRegionId: 4234, lat: 41.995, lng: -74.100, active: true },
  { slug: 'shokan',        name: 'Shokan',        zip: '12481', region: 'Woodstock', redfinRegionId: 4225, lat: 41.981, lng: -74.212, active: true },
  { slug: 'west-shokan',   name: 'West Shokan',   zip: '12494', region: 'Woodstock', redfinRegionId: 4237, lat: 41.964, lng: -74.284, active: true },
  { slug: 'olivebridge',   name: 'Olivebridge',   zip: '12461', region: 'Woodstock', redfinRegionId: 4210, lat: 41.934, lng: -74.253, active: false },
  { slug: 'hurley',        name: 'Hurley',        zip: '12443', region: 'Woodstock', redfinRegionId: 4194, lat: 41.925, lng: -74.061, active: false },
  { slug: 'saugerties',    name: 'Saugerties',    zip: '12477', region: 'Woodstock', redfinRegionId: 4223, lat: 42.078, lng: -73.953, active: false },
  { slug: 'shandaken',     name: 'Shandaken',     zip: '12480', region: 'Woodstock', redfinRegionId: 4224, lat: 42.120, lng: -74.390, active: false },
  { slug: 'big-indian',    name: 'Big Indian',    zip: '12410', region: 'Woodstock', redfinRegionId: 4165, lat: 42.070, lng: -74.450, active: false },

  // ── Tannersville area (Greene County mountaintop) ──────────────────────────
  { slug: 'tannersville',  name: 'Tannersville',  zip: '12485', region: 'Tannersville', redfinRegionId: 4229, lat: 42.195, lng: -74.134, active: true },
  { slug: 'hunter',        name: 'Hunter',        zip: '12442', region: 'Tannersville', redfinRegionId: 4193, lat: 42.212, lng: -74.214, active: true },
  { slug: 'haines-falls',  name: 'Haines Falls',  zip: '12436', region: 'Tannersville', redfinRegionId: 4188, lat: 42.195, lng: -74.093, active: true },
  { slug: 'elka-park',     name: 'Elka Park',     zip: '12427', region: 'Tannersville', redfinRegionId: 4179, lat: 42.162, lng: -74.113, active: true },
  { slug: 'lanesville',    name: 'Lanesville',    zip: '12450', region: 'Tannersville', redfinRegionId: 4199, lat: 42.142, lng: -74.213, active: true },
  { slug: 'jewett',        name: 'Jewett',        zip: '12444', region: 'Tannersville', redfinRegionId: 4195, lat: 42.247, lng: -74.282, active: true },
  { slug: 'windham',       name: 'Windham',       zip: '12496', region: 'Tannersville', redfinRegionId: 4239, lat: 42.308, lng: -74.252, active: true },
  { slug: 'hensonville',   name: 'Hensonville',   zip: '12439', region: 'Tannersville', redfinRegionId: 4190, lat: 42.273, lng: -74.209, active: true },
  { slug: 'maplecrest',    name: 'Maplecrest',    zip: '12454', region: 'Tannersville', redfinRegionId: 4203, lat: 42.287, lng: -74.166, active: true },
  { slug: 'palenville',    name: 'Palenville',    zip: '12463', region: 'Tannersville', redfinRegionId: 4211, lat: 42.173, lng: -74.018, active: true },
  { slug: 'lexington',     name: 'Lexington',     zip: '12452', region: 'Tannersville', redfinRegionId: 4201, lat: 42.237, lng: -74.364, active: false },
  { slug: 'round-top',     name: 'Round Top',     zip: '12473', region: 'Tannersville', redfinRegionId: 4220, lat: 42.254, lng: -74.051, active: false },
  { slug: 'ashland',       name: 'Ashland',       zip: '12407', region: 'Tannersville', redfinRegionId: 4163, lat: 42.311, lng: -74.339, active: false },
  { slug: 'prattsville',   name: 'Prattsville',   zip: '12468', region: 'Tannersville', redfinRegionId: 4215, lat: 42.318, lng: -74.432, active: false },
  { slug: 'cairo',         name: 'Cairo',         zip: '12413', region: 'Tannersville', redfinRegionId: 4168, lat: 42.299, lng: -73.998, active: false },
  { slug: 'catskill',      name: 'Catskill',      zip: '12414', region: 'Tannersville', redfinRegionId: 4169, lat: 42.217, lng: -73.865, active: false },
];

export const TOWNS_BY_REGION: Record<Region, Town[]> = {
  Woodstock: TOWNS.filter(t => t.region === 'Woodstock'),
  Tannersville: TOWNS.filter(t => t.region === 'Tannersville'),
};

export function townBySlug(slug: string): Town | undefined {
  return TOWNS.find(t => t.slug === slug);
}

export function townByZip(zip: string): Town | undefined {
  return TOWNS.find(t => t.zip === zip);
}

/** Region for a listing, from its zip first and its city name second. */
export function regionFor(zip: string | null | undefined, city: string | null | undefined): Region | null {
  const byZip = zip ? townByZip(zip) : undefined;
  if (byZip) return byZip.region;
  if (city) {
    const name = city.trim().toLowerCase();
    const byName = TOWNS.find(t => t.name.toLowerCase() === name);
    if (byName) return byName.region;
  }
  return null;
}

/** Canonical town label for a listing: our spelling if the zip is known, else the source's city. */
export function townNameFor(zip: string | null | undefined, city: string | null | undefined): string {
  const byZip = zip ? townByZip(zip) : undefined;
  if (byZip) return byZip.name;
  if (city?.trim()) {
    // Redfin reports some towns as "Catskill-t" or "Malden On Hudson"; tidy the obvious ones.
    return city.trim().replace(/-t$/i, '').replace(/\bOn\b/g, 'on');
  }
  return 'Unknown';
}
