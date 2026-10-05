import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key?.trim()) {
    return NextResponse.json({ ok: false, message: 'RAPIDAPI_KEY not set in .env.local' });
  }
  try {
    const res = await fetch(
      'https://st-easy-api.p.rapidapi.com/search/buy?location=manhattan&status=active&beds=any&sort_by=Default&page=1',
      { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'st-easy-api.p.rapidapi.com' } }
    );
    if (res.status === 403) return NextResponse.json({ ok: false, message: 'Invalid API key or not subscribed to ST Easy API on RapidAPI' });
    if (res.status === 429) return NextResponse.json({ ok: false, message: 'Rate limit hit — try again in a moment' });
    if (!res.ok) return NextResponse.json({ ok: false, message: `API returned ${res.status}` });

    const data = await res.json();
    const total = data?.search_results?.totalCount ?? 0;
    return NextResponse.json({ ok: true, message: `Connected — ${Number(total).toLocaleString()} active Manhattan listings available` });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message });
  }
}
