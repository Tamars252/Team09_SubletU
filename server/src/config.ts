import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, "..");

// Minimal .env loader so the project stays dependency-light.
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(SERVER_ROOT, ".env"));

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

function int(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

function resolveFromServer(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(SERVER_ROOT, p);
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const config = {
  port: int("PORT", 4000),
  corsOrigins: str("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  jwtSecret: str("JWT_SECRET", "dev-only-change-me"),
  jwtTtlHours: int("JWT_TTL_HOURS", 720),
  settingsSecret: str("SETTINGS_SECRET", "dev-only-change-me-too"),
  databaseFile: resolveFromServer(str("DATABASE_FILE", "./data/subletu.db")),
  uploadDir: resolveFromServer(str("UPLOAD_DIR", "./uploads")),
  maxPhotoBytes: int("MAX_PHOTO_BYTES", 6 * 1024 * 1024),
  nominatimUrl: str("NOMINATIM_URL", "https://nominatim.openstreetmap.org"),
  nominatimUserAgent: str(
    "NOMINATIM_USER_AGENT",
    "SubletU/1.0 (CIS-453 course project)",
  ),
  isProd: process.env.NODE_ENV === "production",

  /** Public origin of the app; reset links and the SSO redirect are built from it. */
  appUrl: str("APP_URL", `http://localhost:${int("PORT", 4000)}`).replace(/\/$/, ""),

  /* ------------------------------------------------- Microsoft Entra ID (SSO) */

  /**
   * Syracuse's directory. "organizations" accepts any work/school tenant, which
   * is only safe because the callback also enforces ssoAllowedDomains — but a
   * real deployment should pin SU's tenant id so the token is rejected at the
   * issuer rather than after the fact.
   */
  msTenantId: str("MS_TENANT_ID", "organizations"),
  msClientId: str("MS_CLIENT_ID", ""),
  msClientSecret: str("MS_CLIENT_SECRET", ""),
  msRedirectUri: str("MS_REDIRECT_URI", ""),

  /** Only these email domains may create or claim an account through SSO. */
  ssoAllowedDomains: str("SSO_ALLOWED_DOMAINS", "syr.edu")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  /**
   * Stands in for Microsoft when no app registration is available, so the whole
   * handshake can be exercised locally. Never permitted in production.
   */
  ssoDevMode: bool("SSO_DEV_MODE", false),

  /* ------------------------------------------------------------------- email */

  resendApiKey: str("RESEND_API_KEY", ""),
  mailFrom: str("MAIL_FROM", "SubletU <onboarding@resend.dev>"),

  /* ---------------------------------------------------------------- passwords */

  passwordMinLength: int("PASSWORD_MIN_LENGTH", 12),
  /** How long a password-reset link stays valid. */
  resetTokenMinutes: int("RESET_TOKEN_MINUTES", 45),
};

export const ssoConfigured = Boolean(config.msClientId && config.msClientSecret);
export const ssoEnabled = ssoConfigured || (config.ssoDevMode && !config.isProd);
export const mailerConfigured = Boolean(config.resendApiKey);

if (config.isProd && config.jwtSecret === "dev-only-change-me") {
  throw new Error("Refusing to start in production with the default JWT_SECRET.");
}
if (config.isProd && config.settingsSecret === "dev-only-change-me-too") {
  throw new Error("Refusing to start in production with the default SETTINGS_SECRET.");
}
if (config.isProd && config.ssoDevMode) {
  throw new Error("SSO_DEV_MODE bypasses Microsoft sign-in and cannot run in production.");
}
if (config.isProd && !mailerConfigured) {
  // Without a mailer, "forgot password" silently does nothing for real users.
  throw new Error("Set RESEND_API_KEY in production so password resets can be delivered.");
}

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
