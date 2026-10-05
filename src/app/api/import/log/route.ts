import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const logPath = path.join(process.cwd(), 'data', `import-${id}.log`);
  const lines = existsSync(logPath)
    ? readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)
    : [];

  const db = getDb();
  const log = db.prepare('SELECT status FROM import_logs WHERE id = ?').get(Number(id)) as
    { status: string } | undefined;

  return NextResponse.json({ lines, status: log?.status ?? 'running' });
}
