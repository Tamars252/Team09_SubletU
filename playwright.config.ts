import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The root package.json is CommonJS, so Playwright loads this config with
// `require` and `import.meta` is not available. npm runs scripts from the
// package directory, so cwd is the repo root — verified rather than assumed,
// because every path below depends on it.
const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "playwright.config.ts"))) {
  throw new Error(`Run the e2e suite from the repo root (cwd was ${ROOT})`);
}

const PORT = 4100;

export const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The suite runs against the production bundle served single-origin by the API
 * — the same mode `npm start` uses — rather than the Vite dev server. That
 * removes HMR and the dev proxy from the picture, so a failure is a failure in
 * the app rather than in the dev tooling, and it exercises the build that
 * would actually ship.
 *
 * The server is pointed at a throwaway database under e2e/.tmp. Nothing here
 * touches server/data/subletu.db.
 */
export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false, // one API and one database; keep writes predictable
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },

  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        // Wide enough to cross the 900px breakpoint, where the app renders as
        // a centred panel rather than filling the window.
        viewport: { width: 1280, height: 900 },
      },
    },
  ],

  webServer: {
    command: [
      `node --no-warnings=ExperimentalWarning ${path.join(ROOT, "e2e/setup/prepare-db.ts")}`,
      "npm run build",
      `node --no-warnings=ExperimentalWarning ${path.join(ROOT, "server/src/index.ts")}`,
    ].join(" && "),
    cwd: ROOT,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT: String(PORT),
      DATABASE_FILE: path.join(ROOT, "e2e/.tmp/e2e.db"),
      UPLOAD_DIR: path.join(ROOT, "e2e/.tmp/uploads"),
      JWT_SECRET: "e2e-jwt-secret",
      SETTINGS_SECRET: "e2e-settings-secret",
      NOMINATIM_URL: "http://127.0.0.1:9/offline",
      APP_URL: BASE_URL,
      // No Microsoft app registration in CI, so the suite drives the local
      // stand-in. Everything downstream of the identity — handoff codes,
      // account linking, the domain rule — is the same code a real sign-in
      // takes; only the identity provider itself is substituted.
      SSO_DEV_MODE: "true",
      SSO_ALLOWED_DOMAINS: "syr.edu",
    },
  },
});
