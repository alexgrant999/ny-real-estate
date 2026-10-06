/**
 * Loads .env.local from the working directory into process.env, for scripts run with
 * tsx outside Next.js (which would otherwise do this itself). Variables already set in
 * the environment win, so `DATABASE_URL=... npm run seed` targets that database.
 */
import path from 'path';
import fs from 'fs';

export function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const [key, ...rest] = line.split('=');
    const name = key?.trim();
    if (name && !name.startsWith('#') && rest.length && process.env[name] === undefined) {
      process.env[name] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}
