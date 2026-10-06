import { NextRequest, NextResponse } from 'next/server';
import { getMarketAreas, getMarketTrend, getMarketTrendCount } from '@/lib/queries/market';

export const dynamic = 'force-dynamic';

const ALL_METRICS = [
  'medianAskingPrice',
  'medianPricePerSqft',
  'medianRent',
  'totalInventory',
  'rentalInventory',
  'daysOnMarket',
  'priceCutShare',
  'medianLotAcres',
];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');

  if (action === 'areas') {
    const areaType = sp.get('areaType') || undefined;
    return NextResponse.json(await getMarketAreas(areaType));
  }

  if (action === 'count') {
    return NextResponse.json({ count: await getMarketTrendCount() });
  }

  const areaName = sp.get('area');
  if (!areaName) return NextResponse.json({ error: 'area is required' }, { status: 400 });

  const metricsParam = sp.get('metrics');
  const metrics = metricsParam ? metricsParam.split(',') : ALL_METRICS;
  const fromPeriod = sp.get('from') || undefined;

  const rows = await getMarketTrend(areaName, metrics, fromPeriod);
  return NextResponse.json(rows);
}
