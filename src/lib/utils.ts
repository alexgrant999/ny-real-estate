export function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 2)}M`;
  }
  return `$${price.toLocaleString()}`;
}

export function formatPriceFull(price: number): string {
  return `$${price.toLocaleString()}`;
}

export function formatRentalPrice(price: number): string {
  return `$${price.toLocaleString()}/mo`;
}

export function domColor(dom: number | null): 'green' | 'yellow' | 'red' | 'gray' {
  if (dom === null) return 'gray';
  if (dom < 30) return 'green';
  if (dom < 60) return 'yellow';
  return 'red';
}

export function domLabel(dom: number | null): string {
  if (dom === null) return '—';
  if (dom === 0) return 'New';
  if (dom === 1) return '1 day';
  return `${dom} days`;
}

/** Move-in date, shown as "Now" once the date has passed. */
export function availableLabel(availableAt: string | null): string | null {
  if (!availableAt) return null;
  const date = new Date(`${availableAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date <= today) return 'Now';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export function bedsLabel(beds: number | null): string {
  if (beds === null) return '—';
  if (beds === 0) return 'Studio';
  return `${beds}BR`;
}

const SQFT_PER_ACRE = 43_560;

export function sqftToAcres(lotSqft: number): number {
  return lotSqft / SQFT_PER_ACRE;
}

export function acresToSqft(acres: number): number {
  return Math.round(acres * SQFT_PER_ACRE);
}

/** Lot size the way Catskills listings quote it: acres, unless it is a small village lot. */
export function lotLabel(lotSqft: number | null): string {
  if (!lotSqft || lotSqft <= 0) return '—';
  const acres = sqftToAcres(lotSqft);
  if (acres >= 0.25) return `${acres < 10 ? acres.toFixed(2).replace(/\.?0+$/, '') : Math.round(acres)} ac`;
  return `${lotSqft.toLocaleString()} sqft`;
}

/** Search Redfin for an address when a listing carries no direct Redfin link. */
export function redfinSearchUrl(address: string, town: string): string {
  const query = encodeURIComponent(`${address}, ${town}, NY`);
  return `https://www.redfin.com/stingray/do/location-search?location=${query}`;
}

/** Build Zillow search URL for a given address */
export function zillowSearchUrl(address: string, town?: string): string {
  const query = [address, town, 'NY'].filter(Boolean).join(', ');
  return `https://www.zillow.com/homes/${encodeURIComponent(query)}_rb/`;
}

export function buildListingUrl(filters: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== false) {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return `/listings${qs ? `?${qs}` : ''}`;
}
