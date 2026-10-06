import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getSql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const sql = getSql();
  const [log] = await sql<{ status: string }[]>`SELECT status FROM import_logs WHERE id = ${Number(id)}`;
  const status = log?.status ?? 'running';

  // Log files live on the machine that ran the scraper, not on Vercel.
  if (process.env.VERCEL) {
    return NextResponse.json({ lines: [], status, note: 'Import logs are only available on the machine that ran the import.' });
  }

  const logPath = path.join(process.cwd(), 'data', `import-${id}.log`);
  const lines = existsSync(logPath)
    ? readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)
    : [];

  return NextResponse.json({ lines, status });
}
