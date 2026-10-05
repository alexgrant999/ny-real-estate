'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { REGION_LABELS, type Region } from '@/lib/areas';

type Area = { area_name: string; region: string; area_type: string };
type TrendRow = { period: string; metric: string; value: number };

const METRICS = [
  { key: 'medianAskingPrice',  label: 'Median Asking Price',   color: '#3b82f6', fmt: (v: number) => `$${(v / 1000).toFixed(0)}k` },
  { key: 'medianPricePerSqft', label: 'Median $/sqft',         color: '#8b5cf6', fmt: (v: number) => `$${Math.round(v)}` },
  { key: 'medianRent',         label: 'Median Rent',           color: '#06b6d4', fmt: (v: number) => `$${Math.round(v).toLocaleString()}/mo` },
  { key: 'totalInventory',     label: 'Homes for Sale',        color: '#10b981', fmt: (v: number) => Math.round(v).toLocaleString() },
  { key: 'rentalInventory',    label: 'Rentals Listed',        color: '#84cc16', fmt: (v: number) => Math.round(v).toLocaleString() },
  { key: 'daysOnMarket',       label: 'Median Days on Market', color: '#f59e0b', fmt: (v: number) => `${Math.round(v)}d` },
  { key: 'priceCutShare',      label: 'Price Cut Share',       color: '#ef4444', fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: 'medianLotAcres',     label: 'Median Lot (acres)',    color: '#f97316', fmt: (v: number) => `${v.toFixed(1)} ac` },
];

const RANGES = [
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: 'All', months: 0 },
];

const AREA_TYPES = [
  { key: 'town', label: 'Town' },
  { key: 'region', label: 'Region' },
  { key: 'all', label: 'All' },
];

function areaLabel(a: Area): string {
  if (a.area_type !== 'town') return a.area_name;
  return `${a.area_name} (${REGION_LABELS[a.region as Region] ?? a.region})`;
}

function getPeriodFrom(months: number): string | undefined {
  if (!months) return undefined;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function MiniChart({
  data, color, fmt,
}: {
  data: { period: string; value: number }[];
  color: string;
  fmt: (v: number) => string;
}) {
  if (!data.length) {
    return (
      <div className="h-36 flex items-center justify-center text-xs text-gray-400">
        No data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={144}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 9 }}
          tickFormatter={v => v.slice(2)}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 9 }}
          tickFormatter={fmt}
          width={46}
        />
        <Tooltip
          formatter={(v) => [fmt(Number(v)), '']}
          labelStyle={{ fontSize: 10 }}
          contentStyle={{ fontSize: 10, padding: '2px 8px' }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function MarketPage() {
  const [areaType, setAreaType] = useState('town');
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [range, setRange] = useState(36);
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState<boolean | null>(null);

  // Check if market data has been imported
  useEffect(() => {
    fetch('/api/market-trends?action=count')
      .then(r => r.json())
      .then(d => setHasData(d.count > 0));
  }, []);

  // Load areas when area type changes
  useEffect(() => {
    fetch(`/api/market-trends?action=areas&areaType=${areaType}`)
      .then(r => r.json())
      .then((data: Area[]) => {
        setAreas(data);
        setSelectedArea(data[0]?.area_name ?? '');
      });
  }, [areaType]);

  // Load trend data when area or range changes
  const loadTrends = useCallback(() => {
    if (!selectedArea) return;
    setLoading(true);
    const from = getPeriodFrom(range);
    const url = `/api/market-trends?area=${encodeURIComponent(selectedArea)}${from ? `&from=${from}` : ''}`;
    fetch(url)
      .then(r => r.json())
      .then((data: TrendRow[]) => { setRows(data); setLoading(false); });
  }, [selectedArea, range]);

  useEffect(() => { loadTrends(); }, [loadTrends]);

  // Group rows by metric key for chart lookup
  const byMetric = Object.fromEntries(
    METRICS.map(m => [
      m.key,
      rows.filter(r => r.metric === m.key).map(r => ({ period: r.period, value: r.value })),
    ])
  );

  const selectedAreaObj = areas.find(a => a.area_name === selectedArea);

  if (hasData === false) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Market Trends</h1>
        <p className="text-gray-500 mb-6">No market snapshots yet.</p>
        <div className="inline-block bg-gray-100 rounded-xl px-6 py-4 text-left text-sm font-mono text-gray-700">
          npm run scrape
        </div>
        <p className="text-gray-400 text-xs mt-3">
          A snapshot is written at the end of every import, so trends build up over repeated imports.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Trends</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monthly snapshots computed from imported listings</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Area type */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {AREA_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setAreaType(t.key)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                areaType === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Area selector */}
        <select
          value={selectedArea}
          onChange={e => setSelectedArea(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {areas.map(a => (
            <option key={a.area_name} value={a.area_name}>
              {areaLabel(a)}
            </option>
          ))}
        </select>

        {/* Time range */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white ml-auto">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.months)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                range === r.months
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Area badge */}
      {selectedAreaObj && (
        <p className="text-sm text-gray-500 mb-4">
          Showing <span className="font-semibold text-gray-800">{selectedArea}</span>
          {' '}· {selectedAreaObj.area_type}
          {loading && <span className="ml-2 text-blue-500">Loading…</span>}
        </p>
      )}

      {/* Chart grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map(m => (
          <div key={m.key} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">{m.label}</span>
              {byMetric[m.key]?.length > 0 && (
                <span className="text-xs font-bold" style={{ color: m.color }}>
                  {m.fmt(byMetric[m.key][byMetric[m.key].length - 1].value)}
                </span>
              )}
            </div>
            <MiniChart data={byMetric[m.key] ?? []} color={m.color} fmt={m.fmt} />
          </div>
        ))}
      </div>
    </div>
  );
}
