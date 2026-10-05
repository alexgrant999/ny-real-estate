export async function register() {
  // Migrations write, so they only run against the local database. The deployed copy
  // is read-only and already carries whatever schema the local one had.
  if (process.env.NEXT_RUNTIME === 'nodejs' && !process.env.VERCEL) {
    const { runMigrations } = await import('./lib/schema');
    runMigrations();
  }
}
