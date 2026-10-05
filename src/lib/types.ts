import type { Region } from './areas';

export type { Region } from './areas';

export type ListingCategory = 'sale' | 'rental';

/** Normalised property types. Catskills inventory is houses and land, not apartments. */
export type ListingType =
  | 'House'
  | 'Condo'
  | 'Co-op'
  | 'Townhouse'
  | 'Multi-family'
  | 'Land'
  | 'Manufactured'
  | 'Apartment'
  | 'Other';

export const LISTING_TYPES: ListingType[] = [
  'House', 'Land', 'Multi-family', 'Condo', 'Townhouse', 'Manufactured', 'Apartment', 'Co-op', 'Other',
];

export interface Listing {
  id: number;
  external_id: string;
  source: 'redfin' | 'zillow' | 'demo';
  address: string;
  unit: string | null;
  /** Town / hamlet (post office name), e.g. "Bearsville". Column kept as `neighborhood`. */
  neighborhood: string;
  region: Region;
  zip_code: string;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  price: number;
  price_per_sqft: number | null;
  hoa_fee: number | null;
  tax_annual: number | null;
  listing_status: 'for_sale' | 'pending' | 'off_market';
  listing_type: ListingType | string | null;
  days_on_market: number | null;
  listed_date: string | null;
  last_price_reduction_date: string | null;
  original_price: number | null;
  price_reduction_amount: number | null;
  price_reduction_pct: number | null;
  description: string | null;
  image_url: string | null;
  listing_url: string | null;
  listing_category: ListingCategory;
  available_at: string | null;
  off_market_at: string | null;
  price_delta_reported: number | null;
  first_seen_at: string | null;
  imported_at: string;
  created_at: string;
  // joined from benchmarks
  neighborhood_median_ppsf?: number | null;
}

export interface PriceHistoryEntry {
  id: number;
  listing_id: number;
  price: number;
  event_type: 'listed' | 'reduced' | 'increased' | 'relisted';
  event_date: string;
}

export interface ListingFilters {
  category?: ListingCategory | 'all';
  region?: Region;
  /** Town names (the `neighborhood` column). */
  neighborhoods?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minDom?: number;
  maxDom?: number;
  /** Minimum lot size in acres. */
  minAcres?: number;
  priceReduced?: boolean;
  listingType?: string;
  sortBy?: 'price' | 'dom' | 'price_reduction_pct' | 'price_reduction_amount' | 'price_per_sqft' | 'sqft' | 'lot_sqft';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  // Bounding box (map draw-a-box)
  swLat?: number;
  swLng?: number;
  neLat?: number;
  neLng?: number;
  // Skip default "all" price caps (used by map view)
  noPriceCap?: boolean;
}

export type DealPreset =
  | 'price_reduced_7d'
  | 'price_reduced_30d'
  | 'dom_over_60'
  | 'dom_over_90'
  | 'ppsf_below_median'
  | 'big_reductions';

export interface ImportLog {
  id: number;
  source: string;
  status: 'success' | 'error' | 'running';
  listings_added: number;
  listings_updated: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface NeighborhoodBenchmark {
  neighborhood: string;
  region: string;
  bedrooms: number | null;
  median_price: number;
  median_ppsf: number | null;
  sample_size: number;
}
