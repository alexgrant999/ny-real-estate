import { Suspense } from 'react';
import { getListings, getDistinctNeighborhoods, getListingStats } from '@/lib/queries/listings';
import { ListingsTable } from '@/components/listings/ListingsTable';
import { ListingsFilters } from '@/components/listings/ListingsFilters';
import type { ListingFilters } from '@/lib/types';

interface PageProps {
  searchParams: Record<string, string>;
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const filters: ListingFilters = {
    category: (searchParams.category as ListingFilters['category']) || 'all',
    borough: (searchParams.borough as ListingFilters['borough']) || undefined,
    neighborhoods: searchParams.neighborhood ? [searchParams.neighborhood] : undefined,
    minPrice: searchParams.minPrice ? Number(searchParams.minPrice) : undefined,
    maxPrice: searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined,
    minBedrooms: searchParams.minBedrooms ? Number(searchParams.minBedrooms) : undefined,
    minDom: searchParams.minDom ? Number(searchParams.minDom) : undefined,
    maxDom: searchParams.maxDom ? Number(searchParams.maxDom) : undefined,
    priceReduced: searchParams.priceReduced === 'true',
    listingType: searchParams.listingType || undefined,
    sortBy: (searchParams.sortBy as ListingFilters['sortBy']) || 'price',
    sortDir: (searchParams.sortDir as ListingFilters['sortDir']) || 'asc',
    page: searchParams.page ? Number(searchParams.page) : 1,
    pageSize: 50,
  };

  const { listings, total } = getListings(filters);
  const neighborhoods = getDistinctNeighborhoods();
  const stats = getListingStats();

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Stats banner */}
      {stats.total_listings > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-6 text-sm text-gray-600">
          <span><strong className="text-gray-900">{stats.total_listings.toLocaleString()}</strong> listings</span>
          <span><strong className="text-blue-600">{stats.sale_count}</strong> for sale</span>
          <span><strong className="text-purple-600">{stats.rental_count}</strong> rentals</span>
          <span><strong className="text-red-600">{stats.price_reduced_count}</strong> price reduced</span>
          <span><strong className="text-orange-600">{stats.stale_count}</strong> over 60 days</span>
        </div>
      )}

      <Suspense>
        <ListingsFilters neighborhoods={neighborhoods} />
      </Suspense>

      <div className="flex-1 overflow-auto bg-white">
        <Suspense>
          <ListingsTable initialListings={listings} initialTotal={total} />
        </Suspense>
      </div>

      {stats.total_listings === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="text-5xl">🏙️</div>
          <h2 className="text-xl font-semibold text-gray-900">No listings yet</h2>
          <p className="text-gray-500 max-w-sm">
            Load demo data to explore the app, or connect a real data source via the Import page.
          </p>
          <a
            href="/import"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Go to Import
          </a>
        </div>
      )}
    </div>
  );
}
