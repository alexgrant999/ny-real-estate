/**
 * App-wide settings for the Catskills (Woodstock / Tannersville) edition.
 * Geography lives in areas.ts; this file holds the knobs that are not about places.
 */

export const APP_NAME = 'Catskills Homes';
export const APP_TAGLINE = 'Woodstock & Tannersville area';

// Default price ceilings applied when the listings page shows "All" categories.
// A buyer looking at both sales and rentals does not want $6M estates mixed in.
export const DEFAULT_SALE_CAP = 1_500_000;
export const DEFAULT_RENT_CAP = 4_500;

// Map starting view: roughly midway between Woodstock (south) and Tannersville (north).
export const MAP_CENTER: [number, number] = [42.12, -74.15];
export const MAP_ZOOM = 11;

// Browser-like User-Agent used by the Redfin importer. Redfin serves its search
// JSON to ordinary browsers; a bare Node fetch is answered with an HTML error page.
export const SCRAPER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
