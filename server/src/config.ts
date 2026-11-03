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
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

function resolveFromServer(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(SERVER_ROOT, p);
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
  // Photos arrive as base64 data URLs inside a JSON body, so the body limit
  // has to clear MAX_PHOTO_BYTES inflated by base64's 4/3, plus the data:
  // prefix and the JSON envelope. Derived rather than hardcoded so raising
  // MAX_PHOTO_BYTES cannot silently leave the body limit below it.
  jsonBodyLimitBytes: Math.ceil((int("MAX_PHOTO_BYTES", 6 * 1024 * 1024) * 4) / 3) + 64 * 1024,
  nominatimUrl: str("NOMINATIM_URL", "https://nominatim.openstreetmap.org"),
  nominatimUserAgent: str(
    "NOMINATIM_USER_AGENT",
    "SubletU/1.0 (CIS-453 course project)",
  ),
  isProd: process.env.NODE_ENV === "production",
};

if (config.isProd) {
  // Both secrets are load-bearing: one signs sessions, the other encrypts every
  // user's settings payload at rest. Neither may keep its development default.
  if (config.jwtSecret === "dev-only-change-me") {
    throw new Error("Refusing to start in production with the default JWT_SECRET.");
  }
  if (config.settingsSecret === "dev-only-change-me-too") {
    throw new Error("Refusing to start in production with the default SETTINGS_SECRET.");
  }
}

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
