import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { TOWNS } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const logs = db.prepare(`SELECT * FROM import_logs ORDER BY started_at DESC LIMIT 20`).all();
  return NextResponse.json(logs);
}

function launch(cmd: string) {
  const child = spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore', env: { ...process.env } });
  child.unref();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sources: string[] = body.sources ?? ['redfin'];
  const requested: string[] = Array.isArray(body.towns) ? body.towns : [];
  // Only known slugs make it onto the command line.
  const towns = requested.filter(slug => TOWNS.some(t => t.slug === slug));

  const db = getDb();
  const dataDir = path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  if (sources.includes('redfin')) {
    const logId = db.prepare(`INSERT INTO import_logs (source, status) VALUES ('redfin', 'running')`).run().lastInsertRowid;
    const logPath = path.join(dataDir, `import-${logId}.log`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape-redfin.ts');
    const townArg = towns.length > 0 ? `--towns ${towns.join(',')}` : '';
    launch(`npx tsx "${scriptPath}" ${townArg} --log-id ${logId} > "${logPath}" 2>&1`);
    return NextResponse.json({ logId, status: 'started', towns });
  }

  if (sources.includes('demo')) {
    const logId = db.prepare(`INSERT INTO import_logs (source, status) VALUES ('demo', 'running')`).run().lastInsertRowid;
    const logPath = path.join(dataDir, `import-${logId}.log`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'seed-demo.ts');
    launch(`npx tsx "${scriptPath}" > "${logPath}" 2>&1`);
    return NextResponse.json({ logId, status: 'started' });
  }

  return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
}
