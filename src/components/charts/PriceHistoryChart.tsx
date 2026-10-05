'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot
} from 'recharts';
import type { PriceHistoryEntry } from '@/lib/types';
import { formatPriceFull } from '@/lib/utils';

interface Props {
  listingId: number;
  currentPrice: number;
}

export function PriceHistoryChart({ listingId, currentPrice }: Props) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);

  useEffect(() => {
    fetch(`/api/price-history/${listingId}`)
      .then(r => r.json())
      .then(setHistory);
  }, [listingId]);

  if (history.length === 0) {
    return <div className="h-32 flex items-center justify-center text-sm text-gray-400">No price history</div>;
  }

  const data = history.map(h => ({
    date: new Date(h.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: h.price,
    type: h.event_type,
  }));

  const minPrice = Math.min(...data.map(d => d.price)) * 0.97;
  const maxPrice = Math.max(...data.map(d => d.price)) * 1.03;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis
          domain={[minPrice, maxPrice]}
          tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10 }}
          width={55}
        />
        <Tooltip
          formatter={(v) => [formatPriceFull(Number(v)), 'Price']}
          labelStyle={{ fontSize: 11 }}
          contentStyle={{ fontSize: 11 }}
        />
        <ReferenceLine y={currentPrice} stroke="#3b82f6" strokeDasharray="4 2" label={{ value: 'Current', fontSize: 10, fill: '#3b82f6' }} />
        <Line
          type="stepAfter"
          dataKey="price"
          stroke="#6366f1"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props;
            const color = payload.type === 'reduced' ? '#ef4444' : payload.type === 'listed' ? '#22c55e' : '#f59e0b';
            return <Dot key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1} />;
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
