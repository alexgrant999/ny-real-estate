import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/queries/listings';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const history = await getPriceHistory(Number(params.id));
  return NextResponse.json(history);
}
