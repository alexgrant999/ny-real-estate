import { NextResponse } from 'next/server';
import { SCRAPER_USER_AGENT } from '@/lib/config';
import { townBySlug } from '@/lib/areas';

export const dynamic = 'force-dynamic';

/** Confirms Redfin answers from this machine by counting active Woodstock sale listings. */
export async function GET() {
  const woodstock = townBySlug('woodstock')!;
  const url = `https://www.redfin.com/stingray/api/gis?al=1&num_homes=350&ord=redfin-recommended-asc&page_number=1&region_id=${woodstock.redfinRegionId}&region_type=2&sf=1,2,3,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SCRAPER_USER_AGENT, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' },
      cache: 'no-store',
    });
    if (res.status === 429) return NextResponse.json({ ok: false, message: 'Redfin rate limit hit — try again in a few minutes' });
    if (res.status === 403) return NextResponse.json({ ok: false, message: 'Redfin refused the request (403). Try again later or from a different network.' });
    if (!res.ok) return NextResponse.json({ ok: false, message: `Redfin returned HTTP ${res.status}` });
    const text = await res.text();
    const data = JSON.parse(text.startsWith('{}&&') ? text.slice(4) : text);
    const count = (data?.payload?.homes ?? []).length as number;
    return NextResponse.json({ ok: true, message: `Connected — ${count} active listings for sale in Woodstock (${woodstock.zip}) on Redfin` });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message });
  }
}
