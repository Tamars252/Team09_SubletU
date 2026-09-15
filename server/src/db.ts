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
  -- Nullable: an account created through Microsoft sign-in has no password
  -- until its owner chooses to set one.
  password_hash    TEXT,
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

-- Short-lived CSRF/PKCE state for an in-flight Microsoft sign-in. Rows are
-- deleted as soon as they are redeemed, and swept on expiry.
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);

-- One-time codes handed to the browser after a successful SSO callback. The
-- session token is never put in a redirect URL, where it would land in browser
-- history, logs and Referer headers; the SPA trades this code for it instead.
CREATE TABLE IF NOT EXISTS sso_handoffs (
  code_hash  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- The six-digit code that proves someone can read the address they signed up
-- with. One row per account, replaced on resend, so an old code stops working
-- the moment a new one is sent.
CREATE TABLE IF NOT EXISTS email_verification_codes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  email      TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Password-reset tokens, stored only as a SHA-256 hash so a database leak
-- cannot be replayed into account takeover.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- Failed sign-in attempts, keyed by email and by client address, so both an
-- account and a source can be throttled.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,
  key        TEXT NOT NULL,
  created_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_reset_user      ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_lookup ON auth_attempts(scope, key, created_at);
`);

/**
 * Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
 * EXISTS", so check the table first — this keeps existing databases working
 * without a migration tool.
 */
function addColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

/**
 * The first release declared `password_hash TEXT NOT NULL`, which an SSO-only
 * account cannot satisfy. SQLite has no "ALTER COLUMN", so relaxing it means
 * rebuilding the table — the procedure documented at sqlite.org/lang_altertable.
 *
 * Foreign keys are disabled for the swap because other tables reference
 * users(id); with enforcement on, dropping the old table would be refused.
 * Renaming the replacement into place re-points those references.
 */
function makePasswordHashNullable(): void {
  const columns = db.prepare("PRAGMA table_info(users)").all() as ColumnInfo[];
  const passwordHash = columns.find((c) => c.name === "password_hash");
  if (!passwordHash || passwordHash.notnull === 0) return;

  const definitions = columns
    .map((c) => {
      const pk = c.pk ? " PRIMARY KEY" : "";
      // Every column keeps its constraints except the one being relaxed.
      const notNull = c.name === "password_hash" || !c.notnull ? "" : " NOT NULL";
      const dflt = c.dflt_value !== null ? ` DEFAULT ${c.dflt_value}` : "";
      return `  ${c.name} ${c.type}${pk}${notNull}${dflt}`;
    })
    .join(",\n");
  const names = columns.map((c) => c.name).join(", ");

  console.log("  migrating users.password_hash to allow SSO-only accounts…");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`CREATE TABLE users_migrating (\n${definitions}\n)`);
    db.exec(`INSERT INTO users_migrating (${names}) SELECT ${names} FROM users`);
    db.exec("DROP TABLE users");
    db.exec("ALTER TABLE users_migrating RENAME TO users");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

makePasswordHashNullable();

// table_info cannot report the inline UNIQUE the original schema had on email,
// so the rebuild above would silently drop it. Re-assert it as an index, which
// is equivalent and survives any future rebuild.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");

// Existing rows keep their password; SSO-only accounts have none, so the
// column has to tolerate NULL from here on.
addColumn("users", "sso_subject", "TEXT");
addColumn("users", "sso_tenant", "TEXT");
// Bumped whenever credentials change. It rides in every session token, so a
// password reset invalidates tokens that were issued before it.
addColumn("users", "token_version", "INTEGER NOT NULL DEFAULT 1");

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso ON users(sso_subject) WHERE sso_subject IS NOT NULL");

/** Clears expired one-time rows. Cheap enough to run on boot and hourly. */
export function sweepExpired(): void {
  const now = nowIso();
  db.prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM sso_handoffs WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM email_verification_codes WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM auth_attempts WHERE created_at < ?").run(
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  );
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
