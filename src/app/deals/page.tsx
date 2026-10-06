import { getDealListings, getDealCounts } from '@/lib/queries/listings';
import { Badge } from '@/components/ui/Badge';
import { formatPrice, domColor, domLabel, bedsLabel } from '@/lib/utils';
import type { DealPreset } from '@/lib/types';
import { REGION_LABELS } from '@/lib/areas';
import Link from 'next/link';

const PRESETS: { id: DealPreset; title: string; description: string; color: string }[] = [
  {
    id: 'price_reduced_7d',
    title: 'Reduced This Week',
    description: 'Price cut in the last 7 days, sellers are motivated',
    color: 'bg-red-50 border-red-200 text-red-700',
  },
  {
    id: 'price_reduced_30d',
    title: 'Reduced This Month',
    description: 'Price cut in the last 30 days',
    color: 'bg-orange-50 border-orange-200 text-orange-700',
  },
  {
    id: 'big_reductions',
    title: 'Big Reductions (5%+)',
    description: 'More than 5% off the original listing price',
    color: 'bg-red-50 border-red-200 text-red-800',
  },
  {
    id: 'dom_over_60',
    title: 'Sitting 60+ Days',
    description: 'On the market over 2 months, room to negotiate',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  },
  {
    id: 'dom_over_90',
    title: 'Sitting 90+ Days',
    description: 'On the market over 3 months, strongly motivated sellers',
    color: 'bg-orange-50 border-orange-200 text-orange-800',
  },
  {
    id: 'ppsf_below_median',
    title: 'Below Median $/sqft',
    description: 'Priced below the town median price per sqft',
    color: 'bg-green-50 border-green-200 text-green-800',
  },
];

interface PageProps {
  searchParams: { preset?: DealPreset };
}

export default async function DealsPage({ searchParams }: PageProps) {
  const activePreset = searchParams.preset ?? 'price_reduced_7d';
  const [counts, listings] = await Promise.all([
    getDealCounts(),
    getDealListings(activePreset),
  ]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Deals & Opportunities</h1>
      <p className="text-gray-500 text-sm mb-6">Pre-built queries to find the best deals in the Woodstock and Tannersville areas.</p>

      {/* Preset grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {PRESETS.map(p => (
          <Link
            key={p.id}
            href={`/deals?preset=${p.id}`}
            className={`rounded-xl border-2 p-3 cursor-pointer transition-all ${
              activePreset === p.id
                ? `${p.color} ring-2 ring-offset-1 ring-blue-400`
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`text-2xl font-bold ${activePreset === p.id ? '' : 'text-gray-900'}`}>
              {counts[p.id] ?? 0}
            </div>
            <div className={`text-xs font-semibold mt-0.5 ${activePreset === p.id ? '' : 'text-gray-700'}`}>
              {p.title}
            </div>
            <div className={`text-xs mt-1 leading-tight ${activePreset === p.id ? 'opacity-80' : 'text-gray-400'}`}>
              {p.description}
            </div>
          </Link>
        ))}
      </div>

      {/* Results table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-sm text-gray-600">
          <strong>{listings.length}</strong> listings matching: {PRESETS.find(p => p.id === activePreset)?.title}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Address</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Town</th>
                <th className="text-right px-4 py-2 text-gray-600 font-medium">Price</th>
                <th className="text-right px-4 py-2 text-gray-600 font-medium">Reduction</th>
                <th className="text-right px-4 py-2 text-gray-600 font-medium">$/sqft</th>
                <th className="text-center px-4 py-2 text-gray-600 font-medium">Beds</th>
                <th className="text-center px-4 py-2 text-gray-600 font-medium">DOM</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listings.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">
                    No listings match this query. Import data to populate.
                  </td>
                </tr>
              )}
              {listings.map(l => {
                const belowMedian = l.neighborhood_median_ppsf && l.price_per_sqft
                  ? l.price_per_sqft < l.neighborhood_median_ppsf : false;

                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/listing/${l.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {l.address}{l.unit ? ` #${l.unit}` : ''}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{l.neighborhood}, {REGION_LABELS[l.region]}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatPrice(l.price)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {l.price_reduction_pct
                        ? <span className="text-red-600 font-medium">-{l.price_reduction_pct.toFixed(1)}%</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {l.price_per_sqft
                        ? <span className={belowMedian ? 'text-green-600 font-medium' : 'text-gray-700'}>
                            ${l.price_per_sqft.toLocaleString()}{belowMedian ? ' ↓' : ''}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{bedsLabel(l.bedrooms)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant={domColor(l.days_on_market)}>{domLabel(l.days_on_market)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{l.listing_type ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
