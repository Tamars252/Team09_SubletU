import crypto from "node:crypto";
import { config } from "../config.ts";
import { db, nowIso } from "../db.ts";

/* ------------------------------------------------------------------ hashing */

/**
 * scrypt parameters. OWASP's Password Storage Cheat Sheet recommends at least
 * N=2^17/r=8/p=1 for interactive logins; 2^16 with r=8 is the same memory
 * budget (64 MiB) at half the CPU, which is a reasonable balance for a server
 * that also runs the API. maxmem must be raised explicitly because Node's
 * default 32 MiB cap is below what these parameters need.
 */
const SCRYPT = { N: 1 << 16, r: 8, p: 1, keylen: 64, maxmem: 160 * 1024 * 1024 };

/**
 * Hashes are self-describing — `scrypt$N$r$p$salt$key` — so the cost can be
 * raised later without locking anyone out: an old hash still verifies under
 * the parameters it was written with. The original release wrote
 * `scrypt$salt$key` with Node's defaults, and those still verify too.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return false;

  let salt: Buffer;
  let expected: Buffer;
  let opts: crypto.ScryptOptions;

  if (parts.length === 6) {
    const [, n, r, p, saltB64, keyB64] = parts;
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(keyB64, "base64url");
    opts = { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem };
  } else if (parts.length === 3) {
    // Legacy format from the first release: Node's default cost.
    const [, saltB64, keyB64] = parts;
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(keyB64, "base64url");
    opts = {};
  } else {
    return false;
  }

  if (expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, opts);
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

/** True when a stored hash was written with parameters weaker than current. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6) return true;
  return Number(parts[1]) < SCRYPT.N || Number(parts[2]) < SCRYPT.r;
}

/* ----------------------------------------------------------------- strength */

/**
 * The most-guessed passwords, plus the ones this project invites. NIST
 * SP 800-63B asks for a blocklist check rather than composition rules — a
 * required symbol mostly produces "Password1!", which is on every list.
 */
const BLOCKLIST = new Set([
  "password", "password1", "password123", "passw0rd", "123456", "1234567",
  "12345678", "123456789", "1234567890", "qwerty", "qwerty123", "abc123",
  "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon", "football",
  "baseball", "sunshine", "princess", "trustno1", "changeme", "secret",
  "syracuse", "syracuse1", "gosyracuse", "orangenation", "subletu",
  "subletu123", "sublet123", "gootters", "cuse", "cusebasketball",
]);

export type PasswordCheck = { ok: boolean; problems: string[] };

/**
 * Length first, no composition rules, blocklist and context terms rejected —
 * the shape NIST SP 800-63B recommends. `context` carries the user's own email
 * and name so a password cannot simply be their address.
 */
export function checkPasswordStrength(password: string, context: string[] = []): PasswordCheck {
  const problems: string[] = [];
  const min = config.passwordMinLength;

  if (password.length < min) problems.push(`Use at least ${min} characters`);
  // Long passphrases are the goal, but scrypt has to hash whatever arrives —
  // cap it so a huge body can't be used to burn CPU.
  if (password.length > 128) problems.push("Use at most 128 characters");
  if (/^\s|\s$/.test(password)) problems.push("Remove the leading or trailing space");

  const folded = password.toLowerCase();
  // Checking the raw value alone lets "password1234" and "Password1!" through,
  // which are exactly the shapes people reach for when a rule demands a digit
  // or a symbol. Stripping the decoration first catches them, while a genuine
  // passphrase that happens to contain a common word is left alone because
  // removing its other letters does not reduce it to a blocklist entry.
  const letters = folded.replace(/[^a-z]/g, "");
  if (BLOCKLIST.has(folded) || BLOCKLIST.has(letters)) {
    problems.push("That password is too common to be safe");
  }

  for (const term of context) {
    const cleaned = term.toLowerCase().trim();
    if (cleaned.length >= 4 && folded.includes(cleaned)) {
      problems.push("Don't include your name or email in your password");
      break;
    }
  }

  if (/^(.)\1+$/.test(password)) problems.push("Use more than one repeated character");
  if (/^(?:0123456789|1234567890|abcdefghij)/.test(folded)) {
    problems.push("Avoid simple sequences like 1234567890");
  }
  if (new Set(password).size < 5) problems.push("Use a greater variety of characters");

  return { ok: problems.length === 0, problems };
}

/* --------------------------------------------------------------- throttling */

const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 8;
const MAX_PER_ADDRESS = 30;

function countRecent(scope: string, key: string): number {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE scope = ? AND key = ? AND created_at > ?")
    .get(scope, key.toLowerCase(), since) as { n: number };
  return row.n;
}

export function recordFailedAttempt(email: string, address: string): void {
  const at = nowIso();
  const insert = db.prepare("INSERT INTO auth_attempts (scope, key, created_at) VALUES (?, ?, ?)");
  insert.run("email", email.toLowerCase(), at);
  insert.run("address", address, at);
}

export function clearAttempts(email: string, address: string): void {
  db.prepare("DELETE FROM auth_attempts WHERE (scope = 'email' AND key = ?) OR (scope = 'address' AND key = ?)")
    .run(email.toLowerCase(), address);
}

/**
 * Throttles by account and by source address. The account limit blocks
 * password spraying at one user; the address limit blocks one host working
 * through many accounts.
 */
export function isThrottled(email: string, address: string): boolean {
  return (
    countRecent("email", email) >= MAX_PER_EMAIL ||
    countRecent("address", address) >= MAX_PER_ADDRESS
  );
}

export const throttleWindowMinutes = WINDOW_MINUTES;
