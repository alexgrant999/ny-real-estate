import { NextRequest, NextResponse } from 'next/server';
import { getDealListings, getDealCounts } from '@/lib/queries/listings';
import type { DealPreset } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const preset = req.nextUrl.searchParams.get('preset') as DealPreset | null;

  if (!preset) {
    // Return counts for all presets
    const counts = await getDealCounts();
    return NextResponse.json(counts);
  }

  const listings = await getDealListings(preset);
  return NextResponse.json({ listings, preset });
}
