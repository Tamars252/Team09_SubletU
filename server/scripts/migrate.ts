/**
 * TM09-121: applies any pending schema migrations and reports what it did.
 *
 *     npm run db:migrate
 *     DATABASE_FILE=/tmp/copy.db npm run db:migrate
 *
 * Opens the database directly instead of importing src/db.ts: that module runs
 * the migrations as a side effect of being imported, which would leave nothing
 * for this script to report. Everything else about the connection — the file,
 * the pragmas — matches what the server does.
 */
import { DatabaseSync } from "node:sqlite";
import { config } from "../src/config.ts";
import { LATEST_VERSION, runMigrations, schemaVersion } from "../src/migrations.ts";

function main(): number {
  const db = new DatabaseSync(config.databaseFile);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  console.log(`\n  database  ${config.databaseFile}`);
  console.log(`  at        user_version ${schemaVersion(db)}`);

  try {
    const result = runMigrations(db);
    for (const migration of result.applied) {
      console.log(`  applied   ${migration.version}. ${migration.description}`);
    }
    if (result.applied.length === 0) console.log("  applied   nothing, already up to date");
    console.log(`\n  user_version ${result.from} -> ${result.to} (latest ${LATEST_VERSION})\n`);
    return 0;
  } catch (err) {
    console.error(`\n  ✗ migration failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`    rolled back; still on user_version ${schemaVersion(db)}\n`);
    return 1;
  } finally {
    db.close();
  }
}

process.exit(main());
