export async function register() {
  // The deployed app never migrates on boot; the schema is applied from a local run or a
  // script. Locally, a missing or unreachable database must not stop the dev server.
  if (process.env.NEXT_RUNTIME === 'nodejs' && !process.env.VERCEL && process.env.DATABASE_URL) {
    try {
      const { runMigrations } = await import('./lib/schema');
      await runMigrations();
    } catch (err) {
      console.error('Schema migration on startup failed:', err);
    }
  }
}
