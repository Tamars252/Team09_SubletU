/**
 * Email verification — proving that whoever signed up can actually read the
 * syr.edu address they typed.
 *
 * This is the fallback for not having a Microsoft app registration. It is a
 * weaker claim than SSO and worth being precise about: it proves control of
 * the mailbox at this moment, not current enrolment. Syracuse keeps alumni
 * addresses alive for a while, so a recent graduate would pass. What it does
 * stop — and what actually matters for a student marketplace — is anyone with
 * a personal address claiming to be a student at all.
 *
 * A six-digit code has only a million possibilities, so the guess limit is
 * what makes it safe, not the hash. Five wrong attempts destroys the code and
 * forces a new one to be sent.
 */
import crypto from "node:crypto";
import { config } from "../config.ts";
import { db, nowIso } from "../db.ts";

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
/** Minimum gap between sends, so the endpoint can't be used to spam an inbox. */
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;

export type SendOutcome =
  | { ok: true; code: string; expiresInMinutes: number }
  | { ok: false; retryAfterSeconds: number };

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "expired" | "mismatch" | "locked"; attemptsLeft: number };

/**
 * Salted with the user id so one stolen hash cannot be compared against
 * another account's, and so a precomputed table of a million digests is
 * useless.
 */
function hashCode(userId: string, code: string): string {
  return crypto.createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

/** Six digits, uniformly distributed — no modulo bias. */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function sendsInLastHour(userId: string): number {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM auth_attempts WHERE scope = 'verify_send' AND key = ? AND created_at > ?",
    )
    .get(userId, since) as { n: number };
  return row.n;
}

function lastSentAt(userId: string): number | null {
  const row = db
    .prepare(
      "SELECT created_at FROM auth_attempts WHERE scope = 'verify_send' AND key = ? ORDER BY id DESC LIMIT 1",
    )
    .get(userId) as { created_at: string } | undefined;
  return row ? new Date(row.created_at).getTime() : null;
}

/**
 * Issues a fresh code, replacing any outstanding one. Returns the plaintext
 * for the caller to email — it is never stored and never returned over HTTP.
 */
export function issueCode(userId: string, email: string): SendOutcome {
  const last = lastSentAt(userId);
  if (last !== null) {
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) };
    }
  }
  if (sendsInLastHour(userId) >= MAX_SENDS_PER_HOUR) {
    return { ok: false, retryAfterSeconds: 3600 };
  }

  const code = generateCode();
  const now = Date.now();
  db.prepare(
    `INSERT INTO email_verification_codes (user_id, code_hash, email, attempts, created_at, expires_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       code_hash = excluded.code_hash,
       email = excluded.email,
       attempts = 0,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`,
  ).run(
    userId,
    hashCode(userId, code),
    email.toLowerCase(),
    new Date(now).toISOString(),
    new Date(now + CODE_TTL_MINUTES * 60_000).toISOString(),
  );

  db.prepare("INSERT INTO auth_attempts (scope, key, created_at) VALUES ('verify_send', ?, ?)").run(
    userId,
    nowIso(),
  );

  return { ok: true, code, expiresInMinutes: CODE_TTL_MINUTES };
}

/** Checks a submitted code and, on success, marks the account verified. */
export function verifyCode(userId: string, submitted: string): VerifyOutcome {
  const row = db
    .prepare("SELECT code_hash, attempts, expires_at FROM email_verification_codes WHERE user_id = ?")
    .get(userId) as { code_hash: string; attempts: number; expires_at: string } | undefined;

  if (!row) return { ok: false, reason: "expired", attemptsLeft: 0 };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(userId);
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(userId);
    return { ok: false, reason: "locked", attemptsLeft: 0 };
  }

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashCode(userId, submitted.trim()), "hex");
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    const attempts = row.attempts + 1;
    db.prepare("UPDATE email_verification_codes SET attempts = ? WHERE user_id = ?").run(
      attempts,
      userId,
    );
    // Burn the code rather than let it be ground down one guess at a time.
    if (attempts >= MAX_ATTEMPTS) {
      db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(userId);
      return { ok: false, reason: "locked", attemptsLeft: 0 };
    }
    return { ok: false, reason: "mismatch", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  db.prepare("UPDATE users SET verified = 1 WHERE id = ?").run(userId);
  db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(userId);
  return { ok: true };
}

export const verificationLimits = {
  codeTtlMinutes: CODE_TTL_MINUTES,
  maxAttempts: MAX_ATTEMPTS,
  resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
};

/** Whether a domain is one we accept at all — reused by the register route. */
export function allowedDomainList(): string[] {
  return config.ssoAllowedDomains;
}
