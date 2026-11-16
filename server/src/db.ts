import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";
import { runMigrations } from "./migrations.ts";

export const db = new DatabaseSync(config.databaseFile);

// Pragmas before migrations: journal mode cannot be changed from inside a
// transaction, and `foreign_keys` is a per-connection setting the migrations
// and every query after them rely on.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/**
 * The schema lives in src/migrations.ts and is applied here at import time, so
 * every module that imports `db` gets a database that is already up to date.
 * See that file for how to add a migration.
 */
runMigrations(db);

/** `?, ?, ?` for an IN clause of n values. */
export function placeholders(n: number): string {
  return new Array(n).fill("?").join(", ");
}

/**
 * Splits ids into batches an IN clause can take. SQLite caps the number of
 * bound parameters per statement, so a page of listings is queried in chunks
 * rather than one statement per listing.
 */
export function chunkIds(ids: string[], size = 400): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Run a set of statements atomically. */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
