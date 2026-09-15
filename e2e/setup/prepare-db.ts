/**
 * Builds the database the end-to-end run works against.
 *
 * Two things matter here:
 *
 * 1. It is a throwaway file under e2e/.tmp, never server/data/subletu.db. The
 *    suite signs in, swipes, saves and sends messages — all of which write —
 *    so it must never touch a developer's real data.
 *
 * 2. The geocode cache is pre-filled from e2e/fixtures/geocache.json before
 *    seeding. `npm run seed` forward-geocodes 24 addresses through Nominatim
 *    at the one-request-per-second their policy requires, which would make
 *    every run take ~25s and depend on a third-party service being up.
 *    geocodeAddress checks the cache first, so a warm cache makes seeding
 *    instant and completely offline.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const TMP_DIR = path.join(REPO_ROOT, "e2e/.tmp");

export const E2E_DB = path.join(TMP_DIR, "e2e.db");
export const E2E_UPLOADS = path.join(TMP_DIR, "uploads");

type CacheRow = { query: string; lat: number | null; lng: number | null; display_name: string | null };

export function prepareDatabase(): void {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(E2E_UPLOADS, { recursive: true });

  // Importing the server's db module creates the schema; do it in a child
  // process so this script never holds a handle on the file.
  const env = { ...process.env, DATABASE_FILE: E2E_DB, UPLOAD_DIR: E2E_UPLOADS };
  execFileSync(
    process.execPath,
    ["--no-warnings=ExperimentalWarning", "-e", 'import("./src/db.ts")'],
    { cwd: path.join(REPO_ROOT, "server"), env, stdio: "inherit" },
  );

  // Warm the geocode cache before seeding so nothing reaches the network.
  const cache = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "e2e/fixtures/geocache.json"), "utf8"),
  ) as CacheRow[];

  const db = new DatabaseSync(E2E_DB);
  const insert = db.prepare(
    `INSERT INTO geocache (query, lat, lng, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng`,
  );
  const now = new Date().toISOString();
  for (const row of cache) insert.run(row.query, row.lat, row.lng, row.display_name, now);
  db.close();

  execFileSync("npm", ["run", "seed", "--workspace", "server", "--", "--force"], {
    cwd: REPO_ROOT,
    env: {
      ...env,
      // Any address the fixture misses must fail fast rather than hang on a
      // real network call — a cache miss should be a loud, quick failure.
      NOMINATIM_URL: "http://127.0.0.1:9/offline",
    },
    stdio: "inherit",
  });

  const check = new DatabaseSync(E2E_DB);
  const listings = check.prepare("SELECT COUNT(*) n FROM listings WHERE status = 'active'").get() as {
    n: number;
  };
  const missing = check.prepare(
    "SELECT COUNT(*) n FROM listings WHERE lat IS NULL OR lng IS NULL",
  ).get() as { n: number };
  check.close();

  if (listings.n === 0) throw new Error("e2e seed produced no listings");
  if (missing.n > 0) {
    throw new Error(
      `${missing.n} seeded listing(s) have no coordinates — regenerate e2e/fixtures/geocache.json`,
    );
  }
  console.log(`\n  e2e database ready: ${listings.n} listings, all geocoded\n`);
}

// Allow `node e2e/setup/prepare-db.ts` directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prepareDatabase();
}
