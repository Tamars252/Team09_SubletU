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

/**
 * How many transaction() calls are currently on the stack. 0 means the next
 * one opens a real transaction; anything higher means it nests inside one.
 */
let transactionDepth = 0;

/**
 * Run a set of statements atomically, nesting if one is already open.
 *
 * SQLite has no nested `BEGIN`: a second one on the same connection fails with
 * "cannot start a transaction within a transaction", and a nested `COMMIT`
 * would commit the outer caller's work early. So only the outermost call uses
 * BEGIN/COMMIT/ROLLBACK; an inner one brackets itself with a SAVEPOINT and
 * RELEASEs it on success.
 *
 * That makes the unit of atomicity the outermost call, which is what a caller
 * wrapping two already-atomic operations means by it. An inner failure the
 * outer one catches undoes only the inner statements; an outer failure undoes
 * everything, including inner work that had already been RELEASEd.
 */
export function transaction<T>(fn: () => T): T {
  // Depth-numbered, and the nesting is a strict stack, so two live savepoints
  // can never share a name.
  const savepoint = transactionDepth > 0 ? `sp_${transactionDepth}` : null;

  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : "BEGIN");
  transactionDepth += 1;
  try {
    const result = fn();
    db.exec(savepoint ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (err) {
    if (savepoint) {
      // ROLLBACK TO rewinds to the savepoint but leaves it on the stack, so
      // it is released separately. Without that the stack grows by one for
      // every inner failure the outer call swallows.
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
    } else {
      db.exec("ROLLBACK");
    }
    throw err;
  } finally {
    transactionDepth -= 1;
  }
}
