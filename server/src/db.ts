import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";

export const db = new DatabaseSync(config.databaseFile);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/**
 * Schema. Mirrors the SubletU class diagram:
 *   Data (abstract)  -> every *_data table below carries validate/store/retrieve
 *                       behaviour in server/src/domain/.
 *   ListingData      -> listings
 *   PhotoData        -> photos
 *   PricingData      -> pricing
 *   RoomDetails      -> room_details
 *   ScreenSettings   -> screen_settings (payload encrypted at rest)
 */
db.exec(`
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
`);

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
