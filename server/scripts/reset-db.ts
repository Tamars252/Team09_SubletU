/**
 * TM09-121: throws the database away and builds a fresh seeded one.
 *
 *     npm run db:reset
 *     DATABASE_FILE=/tmp/scratch.db npm run db:reset
 *
 * Deletes DATABASE_FILE and its WAL sidecars, migrates from nothing to the
 * latest version, then runs the seed. For when a schema change is easier to
 * adopt by starting over than by writing a data migration for throwaway
 * development rows.
 *
 * Refuses to run under NODE_ENV=production. The whole point of the script is
 * that it destroys data, and there is no undo.
 */
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Checked before anything else is loaded. `import` statements are hoisted and
// evaluated before the first line of a module body, and src/config.ts both
// creates directories and throws its own production errors on import — so the
// refusal only comes first if the imports below it are dynamic.
if (process.env.NODE_ENV === "production") {
  console.error("\n  ✗ db:reset deletes the database. Refusing to run with NODE_ENV=production.\n");
  process.exit(1);
}

const { config } = await import("../src/config.ts");
const { LATEST_VERSION, runMigrations } = await import("../src/migrations.ts");

// -wal and -shm are SQLite's sidecars. Leaving a WAL behind next to a deleted
// database makes the next connection try to recover from a journal that
// belongs to a file that no longer exists.
const files = [config.databaseFile, `${config.databaseFile}-wal`, `${config.databaseFile}-shm`];

console.log(`\n  database  ${config.databaseFile}`);
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  fs.rmSync(file);
  console.log(`  deleted   ${file}`);
}

const db = new DatabaseSync(config.databaseFile);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
const result = runMigrations(db);
db.close();
console.log(`  migrated  user_version ${result.from} -> ${result.to} (latest ${LATEST_VERSION})`);

// Imported rather than spawned so a seed failure fails this script. The seed
// opens its own connection through src/db.ts, which is why the one above is
// closed first.
console.log("  seeding   ...\n");
await import("../src/seed.ts");
