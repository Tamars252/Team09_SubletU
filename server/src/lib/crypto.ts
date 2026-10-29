import crypto from "node:crypto";
import { config } from "../config.ts";

/* ------------------------------------------------------------------ ids */

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

/* -------------------------------------------------------------- password */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/* ------------------------------------------------------------------- jwt */

type JwtPayload = { sub: string; email: string; iat: number; exp: number };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", config.jwtSecret).update(data).digest("base64url");
}

export function issueToken(userId: string, email: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + config.jwtTtlHours * 3600;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub: userId, email, iat, exp }));
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as JwtPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------- ScreenSettings at rest */

const settingsKey = crypto.createHash("sha256").update(config.settingsSecret).digest();

/** Backs ScreenSettings.EncryptData() from the class diagram. */
export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", settingsKey, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

/** Backs ScreenSettings.DecryptData(). Returns null on tamper or key rotation. */
export function decryptJson<T>(blob: string | null): T | null {
  if (!blob) return null;
  const [ivB64, tagB64, dataB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      settingsKey,
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(dec.toString("utf8")) as T;
  } catch {
    return null;
  }
}
