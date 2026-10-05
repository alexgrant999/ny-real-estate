import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'apartments.db');

// On Vercel the filesystem is read-only and the database ships inside the bundle,
// so it has to be opened read-only and left in whatever journal mode it was built with.
export const IS_READ_ONLY = !!process.env.VERCEL;

if (!IS_READ_ONLY) {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!global.__db) {
    global.__db = new Database(DB_PATH, IS_READ_ONLY ? { readonly: true, fileMustExist: true } : {});
    if (!IS_READ_ONLY) {
      global.__db.pragma('journal_mode = WAL');
    }
    global.__db.pragma('foreign_keys = ON');
  }
  return global.__db;
}
