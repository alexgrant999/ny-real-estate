import { NextRequest, NextResponse } from 'next/server';
import { getListings, getDistinctTowns, getListingStats } from '@/lib/queries/listings';
import type { ListingFilters } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const filters: ListingFilters = {
    category: (sp.get('category') as ListingFilters['category']) || 'all',
    region: (sp.get('region') as ListingFilters['region']) || undefined,
    neighborhoods: sp.get('neighborhood')
      ? [sp.get('neighborhood')!]
      : sp.get('neighborhoods')
        ? sp.get('neighborhoods')!.split(',')
        : undefined,
    minPrice: sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined,
    maxPrice: sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined,
    minBedrooms: sp.get('minBedrooms') ? Number(sp.get('minBedrooms')) : undefined,
    maxBedrooms: sp.get('maxBedrooms') ? Number(sp.get('maxBedrooms')) : undefined,
    minDom: sp.get('minDom') ? Number(sp.get('minDom')) : undefined,
    maxDom: sp.get('maxDom') ? Number(sp.get('maxDom')) : undefined,
    minAcres: sp.get('minAcres') ? Number(sp.get('minAcres')) : undefined,
    priceReduced: sp.get('priceReduced') === 'true',
    listingType: sp.get('listingType') || undefined,
    sortBy: (sp.get('sortBy') as ListingFilters['sortBy']) || 'price',
    sortDir: (sp.get('sortDir') as ListingFilters['sortDir']) || 'asc',
    page: sp.get('page') ? Number(sp.get('page')) : 1,
    pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : 50,
    swLat: sp.get('swLat') ? Number(sp.get('swLat')) : undefined,
    swLng: sp.get('swLng') ? Number(sp.get('swLng')) : undefined,
    neLat: sp.get('neLat') ? Number(sp.get('neLat')) : undefined,
    neLng: sp.get('neLng') ? Number(sp.get('neLng')) : undefined,
    noPriceCap: sp.get('noPriceCap') === 'true',
  };

  const { listings, total } = getListings(filters);
  const towns = getDistinctTowns();
  const stats = getListingStats();

  return NextResponse.json({ listings, total, towns, stats, page: filters.page, pageSize: filters.pageSize });
}
