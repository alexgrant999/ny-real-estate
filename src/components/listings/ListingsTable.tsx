'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Listing } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { formatPrice, formatRentalPrice, domColor, domLabel, bedsLabel, lotLabel, redfinSearchUrl, zillowSearchUrl, availableLabel } from '@/lib/utils';
import { REGION_LABELS } from '@/lib/areas';
import Link from 'next/link';

interface SortThProps {
  col: string;
  label: string;
  sortBy: string;
  sortDir: string;
  onSort: (col: string) => void;
  align?: 'left' | 'right' | 'center';
}

function SortTh({ col, label, sortBy, sortDir, onSort, align = 'left' }: SortThProps) {
  const active = sortBy === col;
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      className={`px-3 py-2 text-gray-600 font-medium cursor-pointer select-none hover:text-gray-900 hover:bg-gray-100 ${alignClass}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-blue-600' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );
}

interface Props {
  initialListings: Listing[];
  initialTotal: number;
}

export function ListingsTable({ initialListings, initialTotal }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [listings, setListings] = useState(initialListings);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());

  const sortBy = sp.get('sortBy') ?? 'price';
  const sortDir = sp.get('sortDir') ?? 'asc';

  const handleSort = (col: string) => {
    const params = new URLSearchParams(sp.toString());
    if (sortBy === col) {
      params.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      params.set('sortBy', col);
      params.set('sortDir', 'asc');
    }
    router.push(`/listings?${params.toString()}`);
  };

  const spString = sp.toString();
  useEffect(() => {
    setLoading(true);
    fetch(`/api/listings?${spString}`)
      .then(r => r.json())
      .then(d => {
        setListings(d.listings ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spString]);

  const toggleCompare = (id: number) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  return (
    <div>
      {/* Compare bar */}
      {compareIds.size > 0 && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center gap-3 text-sm">
          <span>{compareIds.size} listing{compareIds.size > 1 ? 's' : ''} selected</span>
          <Link
            href={`/compare?ids=${Array.from(compareIds).join(',')}`}
            className="bg-white text-blue-600 px-3 py-1 rounded-md font-medium hover:bg-blue-50"
          >
            Compare
          </Link>
          <button onClick={() => setCompareIds(new Set())} className="ml-auto opacity-80 hover:opacity-100">
            Clear
          </button>
        </div>
      )}

      {/* Stats bar */}
      <div className="px-4 py-2 text-sm text-gray-500 bg-gray-50 border-b border-gray-200">
        {loading ? 'Loading...' : `${total.toLocaleString()} listings`}
        {compareIds.size > 0 && (
          <span className="ml-2 text-blue-600">(select up to 4 to compare)</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2 text-gray-600 font-medium">Address</th>
              <th className="text-left px-3 py-2 text-gray-600 font-medium">Town</th>
              <SortTh col="price" label="Price" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortTh col="price_reduction_pct" label="Reduction" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortTh col="price_per_sqft" label="$/sqft" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <th className="text-center px-3 py-2 text-gray-600 font-medium">Beds/Baths</th>
              <SortTh col="sqft" label="Sqft" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortTh col="dom" label="DOM" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="center" />
              <th className="text-left px-3 py-2 text-gray-600 font-medium">Type</th>
              <SortTh col="lot_sqft" label="Lot" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100 ${loading ? 'opacity-50' : ''}`}>
            {listings.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-12 text-gray-400">
                  No listings found. Try adjusting your filters.
                </td>
              </tr>
            )}
            {listings.map(l => {
              const belowMedian = l.neighborhood_median_ppsf && l.price_per_sqft
                ? l.price_per_sqft < l.neighborhood_median_ppsf
                : false;

              return (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={compareIds.has(l.id)}
                      onChange={() => toggleCompare(l.id)}
                      disabled={!compareIds.has(l.id) && compareIds.size >= 4}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      {l.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={l.image_url}
                          alt=""
                          loading="lazy"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                          className="w-11 h-11 rounded object-cover bg-gray-100 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded bg-gray-100 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/listing/${l.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                            {l.address}{l.unit ? ` #${l.unit}` : ''}
                          </Link>
                          {l.listing_category === 'rental' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">RENT</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {REGION_LABELS[l.region] ?? l.region}
                          {availableLabel(l.available_at) && (
                            <span className="text-gray-500"> · Avail {availableLabel(l.available_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{l.neighborhood}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold text-gray-900">
                      {l.listing_category === 'rental' ? formatRentalPrice(l.price) : formatPrice(l.price)}
                    </span>
                    {l.original_price && l.original_price !== l.price && (
                      <div className="text-xs text-gray-400 line-through">
                        {l.listing_category === 'rental' ? formatRentalPrice(l.original_price) : formatPrice(l.original_price)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.price_reduction_pct ? (
                      <div>
                        <span className="text-red-600 font-medium">-{l.price_reduction_pct.toFixed(1)}%</span>
                        <div className="text-xs text-red-400">
                          -{l.listing_category === 'rental' ? formatRentalPrice(l.price_reduction_amount!) : formatPrice(l.price_reduction_amount!)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.price_per_sqft ? (
                      <span className={belowMedian ? 'text-green-600 font-medium' : 'text-gray-700'}>
                        ${l.price_per_sqft.toLocaleString()}
                        {belowMedian && <span className="ml-1 text-xs">↓</span>}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-700">
                    {bedsLabel(l.bedrooms)}{l.bathrooms ? ` / ${l.bathrooms}ba` : ''}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {l.sqft ? l.sqft.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant={domColor(l.days_on_market)}>
                      {domLabel(l.days_on_market)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.listing_type ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {lotLabel(l.lot_sqft)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={l.listing_url?.includes('redfin.com') ? l.listing_url : redfinSearchUrl(l.address, l.neighborhood)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.listing_url?.includes('redfin.com') ? 'View on Redfin' : 'Search on Redfin'}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#a02021] text-white hover:opacity-80 whitespace-nowrap"
                      >
                        RF
                      </a>
                      <a
                        href={l.listing_url && l.source === 'zillow' ? l.listing_url : zillowSearchUrl(l.address, l.neighborhood)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.listing_url && l.source === 'zillow' ? 'View on Zillow' : 'Search on Zillow'}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#006AFF] text-white hover:opacity-80"
                      >
                        Z
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
