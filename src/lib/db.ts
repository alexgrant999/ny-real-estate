import postgres from 'postgres';
import type { Sql } from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

// Neon pooled URLs sit behind pgbouncer in transaction mode, which cannot hold named
// prepared statements across transactions, so they are turned off.
export function getSql(): Sql {
  if (!global.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set. Point it at the Neon (or any Postgres) connection string.');
    }
    // onnotice silences the "already exists, skipping" notices from CREATE ... IF NOT EXISTS.
    // TimeZone is pinned because now()::text feeds TEXT timestamp columns that sort as text.
    global.__sql = postgres(url, {
      prepare: false,
      onnotice: () => {},
      connection: { TimeZone: 'UTC' },
    });
  }
  return global.__sql;
}

/** Close the shared connection pool so a script can exit. */
export async function closeSql(): Promise<void> {
  const sql = global.__sql;
  global.__sql = undefined;
  if (sql) await sql.end();
}
