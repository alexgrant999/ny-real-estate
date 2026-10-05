/* eslint-disable react/jsx-key */
import { getListingsByIds } from '@/lib/queries/listings';
import { Badge } from '@/components/ui/Badge';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { formatPriceFull, formatPrice, domColor, domLabel, bedsLabel } from '@/lib/utils';
import Link from 'next/link';

interface PageProps {
  searchParams: { ids?: string };
}

function Row({ label, values }: { label: string; values: (string | React.ReactNode)[] }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-500 font-medium w-36 shrink-0">{label}</td>
      {values.map((v, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <td key={i} className="px-4 py-3 text-sm text-gray-900 text-center">{v ?? '—'}</td>
      ))}
    </tr>
  );
}

export default async function ComparePage({ searchParams }: PageProps) {
  const ids = (searchParams.ids ?? '').split(',').map(Number).filter(Boolean).slice(0, 4);
  const listings = getListingsByIds(ids);

  if (listings.length === 0) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4">⚖️</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">No listings to compare</h1>
        <p className="text-gray-500 mb-4">Select up to 4 listings from the listings page using the checkboxes.</p>
        <Link href="/listings" className="text-blue-600 hover:text-blue-800">← Browse listings</Link>
      </div>
    );
  }

  const minPrice = Math.min(...listings.map(l => l.price));

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/listings" className="text-sm text-blue-600 hover:text-blue-800">← Back to listings</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Comparing {listings.length} listings</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-sm text-gray-500 w-36">Field</th>
              {listings.map(l => (
                <th key={l.id} className="px-4 py-3 text-center">
                  <div className="font-semibold text-gray-900 text-sm">
                    {l.address}{l.unit ? ` #${l.unit}` : ''}
                  </div>
                  <div className="text-xs text-gray-500">{l.neighborhood}, {l.borough}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row
              label="Price"
              values={listings.map(l => (
                <div>
                  <span className={`font-bold text-base ${l.price === minPrice ? 'text-green-600' : 'text-gray-900'}`}>
                    {formatPriceFull(l.price)}
                  </span>
                  {l.price === minPrice && listings.length > 1 && (
                    <div className="text-xs text-green-600">Lowest</div>
                  )}
                </div>
              ))}
            />
            <Row
              label="Price reduction"
              values={listings.map(l =>
                l.price_reduction_pct
                  ? <span className="text-red-600 font-medium">-{l.price_reduction_pct.toFixed(1)}% ({formatPrice(l.price_reduction_amount!)})</span>
                  : <span className="text-gray-400">None</span>
              )}
            />
            <Row label="Beds / Baths" values={listings.map(l => `${bedsLabel(l.bedrooms)} / ${l.bathrooms ?? '—'}ba`)} />
            <Row label="Sqft" values={listings.map(l => l.sqft?.toLocaleString() ?? '—')} />
            <Row
              label="$/sqft"
              values={listings.map(l => {
                if (!l.price_per_sqft) return '—';
                const belowMedian = l.neighborhood_median_ppsf && l.price_per_sqft < l.neighborhood_median_ppsf;
                return (
                  <span className={belowMedian ? 'text-green-600 font-medium' : ''}>
                    ${l.price_per_sqft.toLocaleString()}
                    {belowMedian && ' ↓'}
                  </span>
                );
              })}
            />
            <Row
              label="Days on market"
              values={listings.map(l => <Badge variant={domColor(l.days_on_market)}>{domLabel(l.days_on_market)}</Badge>)}
            />
            <Row label="Listed date" values={listings.map(l => l.listed_date ?? '—')} />
            <Row label="Type" values={listings.map(l => l.listing_type ?? '—')} />
            <Row label="HOA/mo" values={listings.map(l => l.hoa_fee ? `$${l.hoa_fee.toLocaleString()}` : '—')} />
            <Row label="Annual tax" values={listings.map(l => l.tax_annual ? `$${l.tax_annual.toLocaleString()}` : '—')} />
            <Row
              label="vs. median $/sqft"
              values={listings.map(l => {
                if (!l.neighborhood_median_ppsf || !l.price_per_sqft) return '—';
                const diff = Math.round((l.price_per_sqft - l.neighborhood_median_ppsf) / l.neighborhood_median_ppsf * 100);
                return (
                  <span className={diff < 0 ? 'text-green-600 font-medium' : 'text-red-500'}>
                    {diff > 0 ? '+' : ''}{diff}%
                  </span>
                );
              })}
            />
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-sm text-gray-500 font-medium align-top">Price history</td>
              {listings.map(l => (
                <td key={l.id} className="px-4 py-3">
                  <PriceHistoryChart listingId={l.id} currentPrice={l.price} />
                </td>
              ))}
            </tr>
            <Row
              label=""
              values={listings.map(l => (
                <Link href={`/listing/${l.id}`} className="text-blue-600 text-xs hover:text-blue-800">
                  View details →
                </Link>
              ))}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
