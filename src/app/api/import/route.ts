import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const logs = db.prepare(`
    SELECT * FROM import_logs ORDER BY started_at DESC LIMIT 20
  `).all();
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sources: string[] = body.sources ?? ['streeteasy'];
  const neighborhoods: string[] = body.neighborhoods ?? [];

  const db = getDb();
  const dataDir = path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  if (sources.includes('streeteasy')) {
    const logResult = db.prepare(
      `INSERT INTO import_logs (source, status) VALUES ('streeteasy-scrape', 'running')`
    ).run();
    const logId = logResult.lastInsertRowid;

    const logPath = path.join(dataDir, `import-${logId}.log`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape-streeteasy.ts');
    const hoodArg = neighborhoods.length > 0 ? `--hoods ${neighborhoods.join(',')}` : '';
    const cmd = `npx tsx "${scriptPath}" ${hoodArg} --log-id ${logId} > "${logPath}" 2>&1`;

    const child = spawn('sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();

    return NextResponse.json({ logId, status: 'started', neighborhoods });
  }

  if (sources.includes('demo')) {
    const logResult = db.prepare(
      `INSERT INTO import_logs (source, status) VALUES ('demo', 'running')`
    ).run();
    const logId = logResult.lastInsertRowid;

    const logPath = path.join(dataDir, `import-${logId}.log`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'seed-demo.ts');
    const cmd = `npx tsx "${scriptPath}" > "${logPath}" 2>&1`;

    const child = spawn('sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();

    return NextResponse.json({ logId, status: 'started' });
  }

  return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
}
