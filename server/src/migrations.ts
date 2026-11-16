import type { DatabaseSync } from "node:sqlite";

/**
 * Versioned schema migrations.
 *
 * The schema used to be one `CREATE TABLE IF NOT EXISTS` block plus a hand
 * written `ensureColumn()` call. That works for a fresh database and for the
 * one column somebody remembered to back-fill, and silently does nothing for
 * everything else: a database created by an earlier release never picks up a
 * new column, a changed default or a new index, and there is no way to ask it
 * which version of the schema it is actually on.
 *
 * So: an ordered list of migrations and `PRAGMA user_version` as the marker.
 * Each pending migration runs in its own transaction and the version is only
 * bumped once it has succeeded, which means a half-applied migration cannot
 * leave the database claiming to be newer than it is.
 *
 * Takes the database as a parameter rather than importing `db` from db.ts,
 * because db.ts calls `runMigrations()` — importing back would be a cycle, and
 * the tests need to migrate throwaway databases of their own anyway.
 *
 * ## Adding a migration
 *
 * Append a new entry with the next version number. **Never edit a migration
 * that has shipped** — a database that already ran it will not run it again,
 * so an edit only ever applies to databases that have not seen it yet, and the
 * two drift apart. Fix a shipped migration with another migration.
 */
export type Migration = {
  version: number;
  description: string;
  up(db: DatabaseSync): void;
};

/**
 * Migration 1: the baseline schema, moved verbatim out of db.ts.
 *
 * Every statement is `IF NOT EXISTS`, which is what makes an existing database
 * safe to adopt: a database created before there was a migration system still
 * reports `user_version` 0, so this runs against it and finds there is nothing
 * to do.
 *
 * Mirrors the SubletU class diagram:
 *   Data (abstract)  -> every *_data table below carries validate/store/retrieve
 *                       behaviour in server/src/domain/.
 *   ListingData      -> listings
 *   PhotoData        -> photos
 *   PricingData      -> pricing
 *   RoomDetails      -> room_details
 *   ScreenSettings   -> screen_settings (payload encrypted at rest)
 */
const BASELINE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  university       TEXT NOT NULL DEFAULT 'Syracuse University',
  bio              TEXT NOT NULL DEFAULT '',
  avatar_initials  TEXT NOT NULL DEFAULT '',
  verified         INTEGER NOT NULL DEFAULT 0,
  token_version    INTEGER NOT NULL DEFAULT 0,
  rating           REAL NOT NULL DEFAULT 0,
  review_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screen_settings (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  font        TEXT NOT NULL DEFAULT 'Inter',
  color       TEXT NOT NULL DEFAULT '#D4603A',
  theme       TEXT NOT NULL DEFAULT 'light',
  width_px    INTEGER NOT NULL DEFAULT 430,
  height_px   INTEGER NOT NULL DEFAULT 932,
  payload_enc TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  address        TEXT NOT NULL,
  city           TEXT NOT NULL DEFAULT 'Syracuse',
  state          TEXT NOT NULL DEFAULT 'NY',
  zip            TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  lat            REAL,
  lng            REAL,
  geocode_source TEXT NOT NULL DEFAULT 'pending',
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing (
  listing_id         TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  monthly_rent       REAL NOT NULL,
  available_from     TEXT NOT NULL,
  available_to       TEXT NOT NULL,
  utilities_included INTEGER NOT NULL DEFAULT 0,
  deposit            REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_details (
  listing_id     TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  bedrooms       INTEGER NOT NULL DEFAULT 1,
  bathrooms      REAL NOT NULL DEFAULT 1,
  max_roommates  INTEGER NOT NULL DEFAULT 0,
  pets_allowed   INTEGER NOT NULL DEFAULT 0,
  furnished      INTEGER NOT NULL DEFAULT 0,
  private_bath   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS photos (
  id               TEXT PRIMARY KEY,
  listing_id       TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  file_url         TEXT NOT NULL,
  file_size        INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  upload_timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_amenities (
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  PRIMARY KEY (listing_id, name)
);

CREATE TABLE IF NOT EXISTS swipes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  direction  TEXT NOT NULL CHECK (direction IN ('left','right')),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS saved_listings (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  listing_id      TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  guest_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  UNIQUE (listing_id, guest_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  read_at         TEXT
);

CREATE TABLE IF NOT EXISTS conversation_state (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geocache (
  query        TEXT PRIMARY KEY,
  lat          REAL,
  lng          REAL,
  display_name TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_owner  ON listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_geo    ON listings(lat, lng);
CREATE INDEX IF NOT EXISTS idx_photos_listing  ON photos(listing_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_swipes_user     ON swipes(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_user      ON saved_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_convo  ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_convo_guest     ON conversations(guest_id);
CREATE INDEX IF NOT EXISTS idx_convo_host      ON conversations(host_id);
`;

/**
 * Adds a column to an existing table when it is missing.
 *
 * `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS` form, so the column list
 * is read first and the statement skipped when the column is already there.
 * That is what lets migration 2 run against a database created after
 * `token_version` joined the baseline as well as one created before it.
 */
function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  ddl: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

/** Every migration, in the order they must be applied. Append only. */
export const migrations: Migration[] = [
  {
    version: 1,
    description: "baseline schema (14 tables, 9 indexes)",
    up(db) {
      db.exec(BASELINE_SCHEMA);
    },
  },
  {
    version: 2,
    description: "users.token_version",
    up(db) {
      // Replaces the ensureColumn() back-fill db.ts used to run on every boot.
      // The column is part of the baseline above, so this is a no-op on any
      // database created from it and a real ALTER on an older one.
      addColumnIfMissing(db, "users", "token_version", "INTEGER NOT NULL DEFAULT 0");
    },
  },
];

/** The version a fully migrated database reports. */
export const LATEST_VERSION = migrations[migrations.length - 1].version;

/** The schema version this database is on; 0 means "never migrated". */
export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

export type MigrationResult = {
  from: number;
  to: number;
  applied: Array<{ version: number; description: string }>;
};

/**
 * Applies every migration the database has not seen, oldest first.
 *
 * Each one gets its own transaction together with the `user_version` bump, so
 * a migration that throws leaves both its own statements and the version
 * marker untouched and the next run retries it from the same place. The error
 * is re-thrown: a database that is half-way through a schema change is not
 * something to start serving requests on top of.
 *
 * `list` is a parameter so the tests can drive a failing migration through the
 * real code path; callers pass nothing.
 */
export function runMigrations(db: DatabaseSync, list: Migration[] = migrations): MigrationResult {
  const from = schemaVersion(db);
  const applied: Array<{ version: number; description: string }> = [];
  let current = from;

  for (const migration of list) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      // PRAGMA takes no bound parameters, so the version is interpolated.
      // It is a number from the literal list above, never caller input.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    current = migration.version;
    applied.push({ version: migration.version, description: migration.description });
  }

  return { from, to: current, applied };
}
