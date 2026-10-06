import { getListingById, getPriceHistory } from '@/lib/queries/listings';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { PhotoGallery } from '@/components/listings/PhotoGallery';
import { formatPriceFull, formatPrice, formatRentalPrice, domColor, domLabel, bedsLabel, lotLabel, redfinSearchUrl, zillowSearchUrl, availableLabel } from '@/lib/utils';
import { REGION_LABELS } from '@/lib/areas';
import Link from 'next/link';

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = await getListingById(Number(params.id));
  if (!listing) notFound();

  const history = await getPriceHistory(listing.id);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/listings" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to listings
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {listing.image_url && (
          <PhotoGallery imageUrl={listing.image_url} alt={listing.address} />
        )}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {listing.address}{listing.unit ? ` #${listing.unit}` : ''}
              </h1>
              <p className="text-gray-500 mt-0.5">{listing.neighborhood}, {REGION_LABELS[listing.region] ?? listing.region} · {listing.zip_code}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-bold text-gray-900">
                {listing.listing_category === 'rental'
                  ? formatRentalPrice(listing.price)
                  : formatPriceFull(listing.price)}
              </div>
              {listing.listing_category === 'rental' && (
                <div className="text-xs font-semibold text-purple-600">RENTAL</div>
              )}
              {listing.original_price && listing.original_price !== listing.price && (
                <div className="text-gray-400 line-through text-sm">
                  {listing.listing_category === 'rental'
                    ? formatRentalPrice(listing.original_price)
                    : formatPriceFull(listing.original_price)}
                </div>
              )}
              {listing.price_reduction_pct && (
                <div className="text-red-600 font-medium text-sm">
                  -{listing.price_reduction_pct.toFixed(1)}% ({listing.listing_category === 'rental'
                    ? formatRentalPrice(listing.price_reduction_amount!)
                    : formatPrice(listing.price_reduction_amount!)})
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant={domColor(listing.days_on_market)} size="md">
              {domLabel(listing.days_on_market)} on market
            </Badge>
            {listing.listing_type && <Badge variant="gray" size="md">{listing.listing_type}</Badge>}
            {listing.price_reduction_pct && <Badge variant="red" size="md">Price reduced</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-gray-100">
          {[
            { label: 'Bedrooms', value: bedsLabel(listing.bedrooms) },
            { label: 'Bathrooms', value: listing.bathrooms ? `${listing.bathrooms}` : '—' },
            { label: 'Sqft', value: listing.sqft ? listing.sqft.toLocaleString() : '—' },
            // Lot, year built, $/sqft, taxes and HOA are sale concepts. Rentals get move-in date
            // instead, which is the field a renter actually filters on.
            ...(listing.listing_category === 'rental'
              ? [{ label: 'Available', value: availableLabel(listing.available_at) ?? '—' }]
              : [
                  { label: 'Lot', value: lotLabel(listing.lot_sqft) },
                  { label: 'Year built', value: listing.year_built ? `${listing.year_built}` : '—' },
                  { label: '$/sqft', value: listing.price_per_sqft ? `$${listing.price_per_sqft.toLocaleString()}` : '—' },
                  { label: 'Annual tax', value: listing.tax_annual ? `$${listing.tax_annual.toLocaleString()}` : '—' },
                  ...(listing.hoa_fee ? [{ label: 'HOA/mo', value: `$${listing.hoa_fee.toLocaleString()}` }] : []),
                ]),
            { label: 'Listed', value: listing.listed_date ?? '—' },
            { label: 'Source', value: listing.source.toUpperCase() },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
              <div className="font-semibold text-gray-900 mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {listing.neighborhood_median_ppsf && listing.price_per_sqft && (
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="text-sm text-gray-600">
              Town median: <strong>${Math.round(listing.neighborhood_median_ppsf).toLocaleString()}/sqft</strong>
              {listing.price_per_sqft < listing.neighborhood_median_ppsf ? (
                <span className="ml-2 text-green-600 font-medium">
                  This listing is {Math.round((listing.neighborhood_median_ppsf - listing.price_per_sqft) / listing.neighborhood_median_ppsf * 100)}% below median
                </span>
              ) : (
                <span className="ml-2 text-red-500">
                  This listing is {Math.round((listing.price_per_sqft - listing.neighborhood_median_ppsf) / listing.neighborhood_median_ppsf * 100)}% above median
                </span>
              )}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Price History</h2>
            <PriceHistoryChart listingId={listing.id} currentPrice={listing.price} />
            <div className="mt-3 space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    h.event_type === 'listed' ? 'bg-green-500' :
                    h.event_type === 'reduced' ? 'bg-red-500' :
                    h.event_type === 'increased' ? 'bg-orange-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-gray-500 w-24 shrink-0">{h.event_date}</span>
                  <span className="capitalize text-gray-700">{h.event_type}</span>
                  <span className="font-medium text-gray-900 ml-auto">{formatPriceFull(h.price)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {listing.description && (
          <div className="p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Description</h2>
            <p className="text-gray-600 text-sm leading-relaxed">{listing.description}</p>
          </div>
        )}

        <div className="px-6 pb-6 flex flex-wrap gap-3">
          {listing.listing_url && listing.listing_url.includes('redfin.com') ? (
            <a
              href={listing.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#a02021] text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              View on Redfin ↗
            </a>
          ) : (
            <a
              href={redfinSearchUrl(listing.address, listing.neighborhood)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#a02021] text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              Search on Redfin ↗
            </a>
          )}
          {listing.listing_url && listing.source === 'zillow' ? (
            <a
              href={listing.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#006AFF] text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              View on Zillow ↗
            </a>
          ) : (
            <a
              href={zillowSearchUrl(listing.address, listing.neighborhood)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#006AFF] text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              Search on Zillow ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
