/**
 * Side-effect module that redirects the server's config at a throwaway SQLite
 * file. Import it FIRST in every test file:
 *
 *     import "../helpers/env.ts";
 *     import { PricingData } from "../../src/domain/PricingData.ts";
 *
 * Order matters. `src/db.ts` opens the database and creates the schema at
 * import time, and `src/config.ts` only falls back to `.env` for keys that are
 * still undefined in `process.env`. ES modules evaluate in the order they are
 * declared, so this file's assignments land before anything reads them — and
 * the real `server/data/subletu.db` is never touched by a test run.
 *
 * Each test process gets its own directory, so `node --test` can keep running
 * test files in parallel without them fighting over one database file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "subletu-test-"));

process.env.DATABASE_FILE = path.join(TEST_ROOT, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_ROOT, "uploads");

// Deterministic secrets so token and ciphertext assertions don't depend on
// whatever happens to be in the developer's .env.
process.env.JWT_SECRET = "test-jwt-secret";
process.env.SETTINGS_SECRET = "test-settings-secret";
process.env.JWT_TTL_HOURS = "1";

// Never let a test hit the live Nominatim endpoint by accident.
process.env.NOMINATIM_URL = "http://127.0.0.1:9/never-called";

process.on("exit", () => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});
