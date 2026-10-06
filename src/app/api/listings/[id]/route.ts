import { NextRequest, NextResponse } from 'next/server';
import { getListingById } from '@/lib/queries/listings';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListingById(Number(params.id));
  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(listing);
}
