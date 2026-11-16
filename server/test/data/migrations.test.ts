/**
 * TM09-121: the versioned migration runner.
 *
 * Covers the four things the runner has to get right:
 *   1. A fresh database ends up on the latest version with the whole schema.
 *   2. A database that predates the runner — tables already there, no
 *      token_version, user_version still 0 — is adopted and upgraded.
 *   3. Running again does nothing.
 *   4. A migration that throws takes its own statements and the version bump
 *      down with it.
 *
 * Opens its own throwaway databases rather than going through src/db.ts: that
 * module migrates at import time, which is exactly what is under test here.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import type { Migration } from "../../src/migrations.ts";
import { LATEST_VERSION, migrations, runMigrations, schemaVersion } from "../../src/migrations.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "subletu-migrations-"));
const open: DatabaseSync[] = [];

let n = 0;
/** A fresh, empty database with the server's pragmas and no schema at all. */
function emptyDatabase(): DatabaseSync {
  const db = new DatabaseSync(path.join(TMP, `m${n++}.db`));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  open.push(db);
  return db;
}

function tableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/**
 * Only the indexes the schema declares. SQLite builds its own
 * `sqlite_autoindex_*` behind every UNIQUE constraint; those are not ours to
 * count.
 */
function indexNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function columnNames(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/**
 * `users` exactly as it was before token_version was added, which is what a
 * database created by an early release still has on disk.
 */
const USERS_BEFORE_TOKEN_VERSION = `
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  university       TEXT NOT NULL DEFAULT 'Syracuse University',
  bio              TEXT NOT NULL DEFAULT '',
  avatar_initials  TEXT NOT NULL DEFAULT '',
  verified         INTEGER NOT NULL DEFAULT 0,
  rating           REAL NOT NULL DEFAULT 0,
  review_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);`;

after(() => {
  for (const db of open) {
    try {
      db.close();
    } catch {
      // Already closed by a test; nothing to do.
    }
  }
  // Best-effort, for the same Windows reason helpers/env.ts documents.
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    // Ignore.
  }
});

describe("runMigrations: a fresh database", () => {
  it("reports the versions it moved between", () => {
    const db = emptyDatabase();
    assert.equal(schemaVersion(db), 0);

    const result = runMigrations(db);

    assert.equal(result.from, 0);
    assert.equal(result.to, LATEST_VERSION);
    assert.equal(schemaVersion(db), LATEST_VERSION);
    assert.deepEqual(
      result.applied.map((m) => m.version),
      migrations.map((m) => m.version),
    );
  });

  it("creates all 14 tables", () => {
    const db = emptyDatabase();
    runMigrations(db);

    assert.deepEqual(tableNames(db), [
      "conversation_state",
      "conversations",
      "geocache",
      "listing_amenities",
      "listings",
      "messages",
      "photos",
      "pricing",
      "reports",
      "room_details",
      "saved_listings",
      "screen_settings",
      "swipes",
      "users",
    ]);
    assert.equal(tableNames(db).length, 14);
  });

  it("creates all 9 indexes", () => {
    const db = emptyDatabase();
    runMigrations(db);

    assert.deepEqual(indexNames(db), [
      "idx_convo_guest",
      "idx_convo_host",
      "idx_listings_geo",
      "idx_listings_owner",
      "idx_listings_status",
      "idx_messages_convo",
      "idx_photos_listing",
      "idx_saved_user",
      "idx_swipes_user",
    ]);
    assert.equal(indexNames(db).length, 9);
  });

  it("includes token_version, so migration 2 has nothing to do", () => {
    const db = emptyDatabase();
    runMigrations(db);

    assert.ok(columnNames(db, "users").includes("token_version"));
  });
});

describe("runMigrations: a database from before the runner existed", () => {
  it("adopts tables that are already there and adds the missing column", () => {
    const db = emptyDatabase();
    // The state an early release left behind: schema on disk, no version
    // marker, no token_version.
    db.exec(USERS_BEFORE_TOKEN_VERSION);
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ('usr_old', 'old@syr.edu', 'Old Account', 'x', '2025-01-01T00:00:00.000Z')`,
    ).run();
    assert.equal(schemaVersion(db), 0);
    assert.ok(!columnNames(db, "users").includes("token_version"));

    const result = runMigrations(db);

    assert.equal(result.from, 0);
    assert.equal(result.to, LATEST_VERSION);
    assert.ok(columnNames(db, "users").includes("token_version"));
    assert.equal(tableNames(db).length, 14);
  });

  it("keeps the rows it found and defaults the new column", () => {
    const db = emptyDatabase();
    db.exec(USERS_BEFORE_TOKEN_VERSION);
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ('usr_old', 'old@syr.edu', 'Old Account', 'x', '2025-01-01T00:00:00.000Z')`,
    ).run();

    runMigrations(db);

    const row = db.prepare("SELECT name, token_version FROM users WHERE id = 'usr_old'").get() as {
      name: string;
      token_version: number;
    };
    assert.equal(row.name, "Old Account");
    assert.equal(row.token_version, 0);
  });
});

describe("runMigrations: running again", () => {
  it("applies nothing the second time", () => {
    const db = emptyDatabase();
    runMigrations(db);

    const second = runMigrations(db);

    assert.equal(second.from, LATEST_VERSION);
    assert.equal(second.to, LATEST_VERSION);
    assert.deepEqual(second.applied, []);
    assert.equal(schemaVersion(db), LATEST_VERSION);
  });

  it("leaves the schema exactly as it was", () => {
    const db = emptyDatabase();
    runMigrations(db);
    const tablesBefore = tableNames(db);
    const indexesBefore = indexNames(db);

    runMigrations(db);

    assert.deepEqual(tableNames(db), tablesBefore);
    assert.deepEqual(indexNames(db), indexesBefore);
  });
});

describe("runMigrations: a migration that throws", () => {
  /** The real list plus one that writes a table and then fails. */
  const withFailure: Migration[] = [
    ...migrations,
    {
      version: LATEST_VERSION + 1,
      description: "writes a table, then fails",
      up(db) {
        db.exec("CREATE TABLE halfway (id TEXT PRIMARY KEY)");
        throw new Error("migration exploded");
      },
    },
  ];

  it("re-throws rather than carrying on with a half-migrated database", () => {
    const db = emptyDatabase();

    assert.throws(() => runMigrations(db, withFailure), /migration exploded/);
  });

  it("leaves user_version on the last migration that succeeded", () => {
    const db = emptyDatabase();

    assert.throws(() => runMigrations(db, withFailure));

    assert.equal(schemaVersion(db), LATEST_VERSION);
  });

  it("rolls back what the failed migration had already written", () => {
    const db = emptyDatabase();

    assert.throws(() => runMigrations(db, withFailure));

    assert.ok(!tableNames(db).includes("halfway"));
    // The migrations before it committed on their own and are still there.
    assert.equal(tableNames(db).length, 14);
  });

  it("retries the failed migration on the next run", () => {
    const db = emptyDatabase();
    assert.throws(() => runMigrations(db, withFailure));

    // Same version, this time one that works: the runner has not recorded it
    // as done, so it gets another go.
    const fixed: Migration[] = [
      ...migrations,
      {
        version: LATEST_VERSION + 1,
        description: "writes a table and returns",
        up(db) {
          db.exec("CREATE TABLE halfway (id TEXT PRIMARY KEY)");
        },
      },
    ];
    const result = runMigrations(db, fixed);

    assert.equal(result.from, LATEST_VERSION);
    assert.equal(result.to, LATEST_VERSION + 1);
    assert.ok(tableNames(db).includes("halfway"));
  });
});
