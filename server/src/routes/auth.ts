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
import { currentUser, loadUserById, requireAuth } from "../middleware/auth.ts";
import { ScreenSettings } from "../domain/ScreenSettings.ts";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

authRouter.post(
  "/register",
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

    res.status(201).json({ token: issueToken(id, email), user: loadUserById(id) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = requireString(body, "email", { min: 5, max: 254 }).toLowerCase();
    const password = requireString(body, "password", { min: 1, max: 200 });

    const row = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
      | { id: string; password_hash: string }
      | undefined;

    // Same message either way so the endpoint can't be used to enumerate accounts.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw unauthorized("Email or password is incorrect");
    }

    res.json({ token: issueToken(row.id, email), user: loadUserById(row.id) });
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

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(next),
      user.id,
    );
    res.json({ ok: true });
  }),
);
