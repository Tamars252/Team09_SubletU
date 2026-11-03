import { Router } from "express";
import { db, nowIso } from "../db.ts";
import { hashPassword, issueToken, newId, verifyPassword } from "../lib/crypto.ts";
import {
  asyncHandler,
  badRequest,
  conflict,
  optionalString,
  requireString,
  unauthorized,
} from "../lib/http.ts";
import { emailKey, rateLimit } from "../lib/rateLimit.ts";
import { initialsFor } from "../lib/text.ts";
import { currentUser, loadUserById, requireAuth, tokenVersionFor } from "../middleware/auth.ts";
import { ScreenSettings } from "../domain/ScreenSettings.ts";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Credential endpoints are the only ones worth guessing at, so they are the
 * only ones throttled. Keyed on IP + email so one attacker cannot lock out an
 * account they do not own by hammering it from elsewhere.
 */
const credentialLimiter = rateLimit({ limit: 10, windowMs: 15 * 60_000, keyFor: emailKey });
const signupLimiter = rateLimit({ limit: 5, windowMs: 60 * 60_000 });
// Runs behind requireAuth, so the signed-in account is the natural bucket.
const passwordLimiter = rateLimit({
  limit: 10,
  windowMs: 15 * 60_000,
  keyFor: (req) => req.user?.id ?? req.ip ?? "unknown",
});

authRouter.post(
  "/register",
  signupLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = requireString(body, "email", { min: 5, max: 254 }).toLowerCase();
    const password = requireString(body, "password", { min: 8, max: 200 });
    const name = requireString(body, "name", { min: 2, max: 80 });
    const university = optionalString(body, "university", "Syracuse University", 120);
    const bio = optionalString(body, "bio", "", 600);

    if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address");

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) throw conflict("An account with that email already exists");

    const id = newId("usr");
    const createdAt = nowIso();
    // A .edu address is treated as a verified student account.
    const verified = /\.edu$/.test(email.split("@")[1] ?? "") ? 1 : 0;

    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, university, bio,
                          avatar_initials, verified, rating, review_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    ).run(id, email, name, hashPassword(password), university, bio, initialsFor(name), verified, createdAt);

    const settings = new ScreenSettings(id);
    settings.payload.university = university;
    settings.storeData();

    res.status(201).json({ token: issueToken(id, email, 0), user: loadUserById(id) });
  }),
);

authRouter.post(
  "/login",
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = requireString(body, "email", { min: 5, max: 254 }).toLowerCase();
    const password = requireString(body, "password", { min: 1, max: 200 });

    const row = db
      .prepare("SELECT id, password_hash, token_version FROM users WHERE email = ?")
      .get(email) as { id: string; password_hash: string; token_version: number } | undefined;

    // Same message either way so the endpoint can't be used to enumerate accounts.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw unauthorized("Email or password is incorrect");
    }

    res.json({
      token: issueToken(row.id, email, row.token_version),
      user: loadUserById(row.id),
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: currentUser(req) });
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const name = optionalString(body, "name", user.name, 80);
    const bio = optionalString(body, "bio", user.bio, 600);
    const university = optionalString(body, "university", user.university, 120);

    db.prepare(
      "UPDATE users SET name = ?, bio = ?, university = ?, avatar_initials = ? WHERE id = ?",
    ).run(name, bio, university, initialsFor(name), user.id);

    res.json({ user: loadUserById(user.id) });
  }),
);

authRouter.post(
  "/password",
  requireAuth,
  passwordLimiter,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const current = requireString(body, "currentPassword", { min: 1, max: 200 });
    const next = requireString(body, "newPassword", { min: 8, max: 200 });

    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as
      | { password_hash: string }
      | undefined;
    if (!row || !verifyPassword(current, row.password_hash)) {
      throw unauthorized("Current password is incorrect");
    }

    // Bumping token_version invalidates every token issued so far, so a
    // password change signs out other devices. The caller gets a fresh token
    // in exchange and stays signed in here.
    db.prepare(
      "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
    ).run(hashPassword(next), user.id);

    res.json({ ok: true, token: issueToken(user.id, user.email, tokenVersionFor(user.id) ?? 0) });
  }),
);
