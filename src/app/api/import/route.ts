import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { TOWNS } from '@/lib/areas';
import type { ImportLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sql = getSql();
  const logs = await sql<ImportLog[]>`SELECT * FROM import_logs ORDER BY started_at DESC LIMIT 20`;
  return NextResponse.json(logs);
}

function launch(cmd: string) {
  const child = spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore', env: { ...process.env } });
  child.unref();
}

async function createLog(source: 'redfin' | 'demo'): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO import_logs (source, status) VALUES (${source}, 'running') RETURNING id
  `;
  return Number(row.id);
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: 'Imports run on the machine that hosts the scraper. Run npm run scrape locally; it writes to the same database.' },
      { status: 501 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const sources: string[] = body.sources ?? ['redfin'];
  const requested: string[] = Array.isArray(body.towns) ? body.towns : [];
  // Only known slugs make it onto the command line.
  const towns = requested.filter(slug => TOWNS.some(t => t.slug === slug));

  const dataDir = path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  if (sources.includes('redfin')) {
    const logId = await createLog('redfin');
    const logPath = path.join(dataDir, `import-${logId}.log`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape-redfin.ts');
    const townArg = towns.length > 0 ? `--towns ${towns.join(',')}` : '';
    launch(`npx tsx "${scriptPath}" ${townArg} --log-id ${logId} > "${logPath}" 2>&1`);
    return NextResponse.json({ logId, status: 'started', towns });
  }

  if (sources.includes('demo')) {
    const logId = await createLog('demo');
    const logPath = path.join(dataDir, `import-${logId}.log`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'seed-demo.ts');
    launch(`npx tsx "${scriptPath}" --log-id ${logId} > "${logPath}" 2>&1`);
    return NextResponse.json({ logId, status: 'started' });
  }

  return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
}
