export type ListingCategory = 'sale' | 'rental';

export interface Listing {
  id: number;
  external_id: string;
  source: 'zillow' | 'realtor' | 'demo' | 'streeteasy';
  address: string;
  unit: string | null;
  neighborhood: string;
  borough: 'Manhattan' | 'Brooklyn';
  zip_code: string;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  price: number;
  price_per_sqft: number | null;
  hoa_fee: number | null;
  tax_annual: number | null;
  listing_status: 'for_sale' | 'pending' | 'off_market';
  listing_type: string | null;
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
  borough?: 'Manhattan' | 'Brooklyn';
  neighborhoods?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minDom?: number;
  maxDom?: number;
  priceReduced?: boolean;
  listingType?: string;
  sortBy?: 'price' | 'dom' | 'price_reduction_pct' | 'price_reduction_amount' | 'price_per_sqft' | 'sqft';
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
  borough: string;
  bedrooms: number | null;
  median_price: number;
  median_ppsf: number | null;
  sample_size: number;
}
