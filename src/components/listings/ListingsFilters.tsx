'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { REGIONS, REGION_LABELS, type Region } from '@/lib/areas';
import { LISTING_TYPES } from '@/lib/types';

interface FiltersProps {
  /** Towns present in the data (the `neighborhood` column), with their region. */
  towns: { neighborhood: string; region: string }[];
}

const ACRE_OPTIONS = [
  { label: 'Any', value: '' },
  { label: '0.5+ ac', value: '0.5' },
  { label: '1+ ac', value: '1' },
  { label: '2+ ac', value: '2' },
  { label: '5+ ac', value: '5' },
  { label: '10+ ac', value: '10' },
];

export function ListingsFilters({ towns }: FiltersProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const update = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams(sp.toString());
    if (value === undefined || value === '' || value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set('page', '1');
    router.push(`/listings?${params.toString()}`);
  }, [router, sp]);

  const category = sp.get('category') ?? 'all';
  const region = sp.get('region') ?? 'all';
  const town = sp.get('neighborhood') ?? '';
  const minPrice = sp.get('minPrice') ?? '';
  const maxPrice = sp.get('maxPrice') ?? '';
  const minBeds = sp.get('minBedrooms') ?? '';
  const minDom = sp.get('minDom') ?? '';
  const maxDom = sp.get('maxDom') ?? '';
  const minAcres = sp.get('minAcres') ?? '';
  const priceReduced = sp.get('priceReduced') === 'true';
  const listingType = sp.get('listingType') ?? 'all';
  const sortBy = sp.get('sortBy') ?? 'price';
  const sortDir = sp.get('sortDir') ?? 'asc';

  const regionOptions: ('all' | Region)[] = ['all', ...REGIONS];
  const bedOptions = [
    { label: 'Any', value: '' },
    { label: 'Studio', value: '0' },
    { label: '1+', value: '1' },
    { label: '2+', value: '2' },
    { label: '3+', value: '3' },
  ];

  // Towns grouped by region for the <optgroup>s; towns with an unknown region go in a trailing group.
  const townsByRegion = REGIONS.map(r => ({
    region: r,
    label: REGION_LABELS[r],
    towns: towns.filter(t => t.region === r),
  }));
  const otherTowns = towns.filter(t => !REGIONS.includes(t.region as Region));

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-screen-2xl mx-auto flex flex-wrap gap-3 items-center">

        {/* Category */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['all', 'sale', 'rental'] as const).map(c => (
            <button
              key={c}
              onClick={() => update('category', c === 'all' ? undefined : c)}
              className={`px-3 py-1.5 ${
                category === c
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c === 'all' ? 'All' : c === 'sale' ? 'For Sale' : 'Rentals'}
            </button>
          ))}
        </div>

        {/* Region */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {regionOptions.map(r => (
            <button
              key={r}
              onClick={() => update('region', r === 'all' ? undefined : r)}
              className={`px-3 py-1.5 whitespace-nowrap ${
                region === r
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {r === 'all' ? 'All' : REGION_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Town */}
        {towns.length > 0 && (
          <select
            value={town}
            onChange={e => update('neighborhood', e.target.value || undefined)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All towns</option>
            {townsByRegion.map(group => group.towns.length > 0 && (
              <optgroup key={group.region} label={group.label}>
                {group.towns.map(t => (
                  <option key={`${t.region}-${t.neighborhood}`} value={t.neighborhood}>
                    {t.neighborhood}
                  </option>
                ))}
              </optgroup>
            ))}
            {otherTowns.length > 0 && (
              <optgroup label="Other">
                {otherTowns.map(t => (
                  <option key={`${t.region}-${t.neighborhood}`} value={t.neighborhood}>
                    {t.neighborhood}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}

        {/* Bedrooms */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {bedOptions.map(o => (
            <button
              key={o.value}
              onClick={() => update('minBedrooms', o.value || undefined)}
              className={`px-3 py-1.5 ${
                minBeds === o.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Price Range */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500 text-xs">Price</span>
          <input
            type="number"
            placeholder="Min $"
            value={minPrice}
            onChange={e => update('minPrice', e.target.value || undefined)}
            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            placeholder="Max $"
            value={maxPrice}
            onChange={e => update('maxPrice', e.target.value || undefined)}
            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
        </div>

        {/* Days on Market */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500 text-xs">DOM</span>
          <select
            value={`${minDom}-${maxDom}`}
            onChange={e => {
              const [min, max] = e.target.value.split('-');
              const params = new URLSearchParams(sp.toString());
              if (min) params.set('minDom', min); else params.delete('minDom');
              if (max) params.set('maxDom', max); else params.delete('maxDom');
              params.set('page', '1');
              router.push(`/listings?${params.toString()}`);
            }}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="-">Any</option>
            <option value="-30">Under 30 days</option>
            <option value="30-60">30–60 days</option>
            <option value="60-90">60–90 days</option>
            <option value="90-">Over 90 days</option>
          </select>
        </div>

        {/* Min acres */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500 text-xs">Min acres</span>
          <select
            value={minAcres}
            onChange={e => update('minAcres', e.target.value || undefined)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            {ACRE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Listing type */}
        <select
          value={listingType}
          onChange={e => update('listingType', e.target.value === 'all' ? undefined : e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="all">All types</option>
          {LISTING_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Price reduced toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <div
            onClick={() => update('priceReduced', priceReduced ? undefined : 'true')}
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
              priceReduced ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              priceReduced ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
          <span className="text-gray-700">Price reduced</span>
        </label>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-gray-500 text-xs">Sort by</span>
          <select
            value={sortBy}
            onChange={e => update('sortBy', e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="price">Price</option>
            <option value="dom">Days on market</option>
            <option value="price_reduction_pct">% Reduction</option>
            <option value="price_reduction_amount">$ Reduction</option>
            <option value="price_per_sqft">$/sqft</option>
            <option value="sqft">Sq ft</option>
            <option value="lot_sqft">Lot size</option>
          </select>
          <button
            onClick={() => update('sortDir', sortDir === 'asc' ? 'desc' : 'asc')}
            className="px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
            title="Toggle sort direction"
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
    </div>
  );
}
