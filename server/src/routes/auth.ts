import { Router } from "express";
import type { Request } from "express";
import { config, ssoConfigured, ssoEnabled } from "../config.ts";
import { db, nowIso } from "../db.ts";
import { ScreenSettings } from "../domain/ScreenSettings.ts";
import { hashPassword, issueToken, newId, verifyPassword } from "../lib/crypto.ts";
import {
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  optionalString,
  requireString,
  tooManyRequests,
  unauthorized,
} from "../lib/http.ts";
import { passwordResetEmail, sendMail, verificationEmail } from "../lib/mailer.ts";
import {
  issueCode,
  verificationLimits,
  verifyCode,
  type SendOutcome,
} from "../lib/verification.ts";
import {
  assertAllowedDomain,
  beginSignIn,
  completeSignIn,
  consumeState,
  devIdentity,
  issueHandoff,
  redeemHandoff,
  sha256,
  type SsoIdentity,
} from "../lib/oidc.ts";
import {
  checkPasswordStrength,
  clearAttempts,
  isThrottled,
  needsRehash,
  recordFailedAttempt,
  throttleWindowMinutes,
} from "../lib/passwords.ts";
import { currentUser, loadUserById, requireAuth } from "../middleware/auth.ts";

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

function clientAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function sessionFor(userId: string) {
  const user = loadUserById(userId);
  if (!user) throw unauthorized();
  return { token: issueToken(user.id, user.email, user.tokenVersion), user };
}

/** Invalidates every session for a user by moving their token version forward. */
function bumpTokenVersion(userId: string): void {
  db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(userId);
}

/* ----------------------------------------------------------- capabilities */

/**
 * Lets the sign-in screen render the right thing rather than guessing: whether
 * to offer the Microsoft button, which domains are accepted, and how long a
 * password has to be.
 */
authRouter.get("/config", (_req, res) => {
  res.json({
    ssoEnabled,
    ssoConfigured,
    ssoDevMode: ssoEnabled && !ssoConfigured,
    allowedDomains: config.ssoAllowedDomains,
    passwordMinLength: config.passwordMinLength,
    verificationCooldownSeconds: verificationLimits.resendCooldownSeconds,
  });
});

/* ------------------------------------------------------------------- SSO */

/** Creates or links the local account behind a verified Microsoft identity. */
function upsertSsoUser(identity: SsoIdentity): string {
  const existingBySubject = db
    .prepare("SELECT id FROM users WHERE sso_subject = ?")
    .get(identity.subject) as { id: string } | undefined;
  if (existingBySubject) {
    db.prepare("UPDATE users SET verified = 1, sso_tenant = ? WHERE id = ?").run(
      identity.tenantId,
      existingBySubject.id,
    );
    return existingBySubject.id;
  }

  // Someone who signed up with a password and is now using SSO for the first
  // time. Microsoft has proven they control the address, so link the accounts
  // rather than creating a duplicate.
  const existingByEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(identity.email) as
    | { id: string }
    | undefined;
  if (existingByEmail) {
    db.prepare(
      "UPDATE users SET sso_subject = ?, sso_tenant = ?, verified = 1 WHERE id = ?",
    ).run(identity.subject, identity.tenantId, existingByEmail.id);
    return existingByEmail.id;
  }

  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, university, bio, avatar_initials,
                        verified, rating, review_count, created_at, sso_subject, sso_tenant)
     VALUES (?, ?, ?, NULL, ?, '', ?, 1, 0, 0, ?, ?, ?)`,
  ).run(
    id,
    identity.email,
    identity.name,
    "Syracuse University",
    initialsFor(identity.name),
    nowIso(),
    identity.subject,
    identity.tenantId,
  );

  const settings = new ScreenSettings(id);
  settings.payload.university = "Syracuse University";
  settings.storeData();
  return id;
}

/** Sends the browser to Microsoft. */
authRouter.get(
  "/sso/start",
  asyncHandler(async (_req, res) => {
    if (!ssoEnabled) throw badRequest("Microsoft sign-in is not configured on this server");
    if (!ssoConfigured) {
      // Dev mode: no Microsoft to talk to, so present the local stand-in.
      res.redirect(`${config.appUrl}/auth/dev-sso`);
      return;
    }
    const { url } = beginSignIn();
    res.redirect(url);
  }),
);

/** Where Microsoft returns the user. */
authRouter.get(
  "/sso/callback",
  asyncHandler(async (req, res) => {
    const fail = (message: string) =>
      res.redirect(`${config.appUrl}/auth/error?reason=${encodeURIComponent(message)}`);

    if (!ssoConfigured) return fail("Microsoft sign-in is not configured");

    const error = typeof req.query.error === "string" ? req.query.error : null;
    if (error) {
      const description =
        typeof req.query.error_description === "string" ? req.query.error_description : error;
      return fail(description);
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) return fail("Microsoft did not return a sign-in code");

    // Consumed first, so a replayed callback cannot reuse it even if the
    // exchange below fails.
    const row = consumeState(state);
    if (!row) return fail("That sign-in link has expired — please try again");

    try {
      const identity = await completeSignIn(code, row);
      const userId = upsertSsoUser(identity);
      return res.redirect(`${config.appUrl}/auth/callback?code=${issueHandoff(userId)}`);
    } catch (err) {
      console.warn("[sso] sign-in failed:", (err as Error).message);
      return fail((err as Error).message);
    }
  }),
);

/**
 * Dev-mode stand-in for Microsoft. Mounted only when SSO is enabled without a
 * real app registration, and config.ts forbids that combination in production.
 */
authRouter.post(
  "/sso/dev-complete",
  asyncHandler(async (req, res) => {
    if (!ssoEnabled || ssoConfigured) throw forbidden("Not available");
    const body = req.body as Record<string, unknown>;
    const email = requireString(body, "email", { min: 5, max: 254 }).toLowerCase();
    const name = optionalString(body, "name", "", 80);
    if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address");

    let identity: SsoIdentity;
    try {
      identity = devIdentity(email, name);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    res.json({ code: issueHandoff(upsertSsoUser(identity)) });
  }),
);

/** Trades the one-time handoff code for a session. */
authRouter.post(
  "/sso/exchange",
  asyncHandler(async (req, res) => {
    const code = requireString(req.body as Record<string, unknown>, "code", { min: 8, max: 200 });
    const userId = redeemHandoff(code);
    if (!userId) throw unauthorized("That sign-in link has already been used or has expired");
    res.json(sessionFor(userId));
  }),
);

/* -------------------------------------------------------- password sign-up */

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = requireString(body, "email", { min: 5, max: 254 }).toLowerCase();
    const password = requireString(body, "password", { min: 1, max: 200 });
    const name = requireString(body, "name", { min: 2, max: 80 });
    const university = optionalString(body, "university", "Syracuse University", 120);
    const bio = optionalString(body, "bio", "", 600);

    if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address");
    try {
      assertAllowedDomain(email);
    } catch (err) {
      throw badRequest((err as Error).message);
    }

    const strength = checkPasswordStrength(password, [email.split("@")[0], name]);
    if (!strength.ok) throw badRequest("That password is not strong enough", strength.problems);

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) throw conflict("An account with that email already exists");

    const id = newId("usr");
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, university, bio,
                          avatar_initials, verified, rating, review_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
    ).run(id, email, name, hashPassword(password), university, bio, initialsFor(name), nowIso());

    // Deliberately not verified. A matching domain only proves the address was
    // typed correctly. Reading the code sent to it is what proves it is theirs.
    const settings = new ScreenSettings(id);
    settings.payload.university = university;
    settings.storeData();

    await deliverCode(id, email, name);

    res.status(201).json(sessionFor(id));
  }),
);

/* ----------------------------------------------------- email verification */

/** Issues a code and emails it. Silent on a cooldown — the caller decides. */
async function deliverCode(userId: string, email: string, name: string): Promise<SendOutcome> {
  const outcome = issueCode(userId, email);
  if (!outcome.ok) return outcome;
  try {
    const mail = verificationEmail(name, outcome.code, outcome.expiresInMinutes);
    await sendMail({ ...mail, to: email });
  } catch (err) {
    console.error("[auth] could not send verification email:", (err as Error).message);
  }
  return outcome;
}

authRouter.post(
  "/verify/send",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.verified) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }

    const outcome = await deliverCode(user.id, user.email, user.name);
    if (!outcome.ok) {
      throw tooManyRequests(
        `Wait ${outcome.retryAfterSeconds} seconds before asking for another code.`,
      );
    }
    res.json({
      ok: true,
      email: user.email,
      expiresInMinutes: outcome.expiresInMinutes,
      cooldownSeconds: verificationLimits.resendCooldownSeconds,
    });
  }),
);

authRouter.post(
  "/verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.verified) {
      res.json(sessionFor(user.id));
      return;
    }

    const code = requireString(req.body as Record<string, unknown>, "code", { min: 4, max: 12 });
    const outcome = verifyCode(user.id, code.replace(/\s+/g, ""));

    if (!outcome.ok) {
      if (outcome.reason === "locked") {
        throw badRequest("Too many wrong codes. Ask for a new one.");
      }
      if (outcome.reason === "expired") {
        throw badRequest("That code has expired. Ask for a new one.");
      }
      throw badRequest(
        outcome.attemptsLeft === 1
          ? "That code is not right. One attempt left before it is cancelled."
          : `That code is not right. ${outcome.attemptsLeft} attempts left.`,
      );
    }

    res.json(sessionFor(user.id));
  }),
);

/* ---------------------------------------------------------------- sign-in */

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = requireString(body, "email", { min: 5, max: 254 }).toLowerCase();
    const password = requireString(body, "password", { min: 1, max: 200 });
    const address = clientAddress(req);

    if (isThrottled(email, address)) {
      throw tooManyRequests(
        `Too many sign-in attempts. Wait ${throttleWindowMinutes} minutes and try again.`,
      );
    }

    const row = db
      .prepare("SELECT id, password_hash, sso_subject FROM users WHERE email = ?")
      .get(email) as
      | { id: string; password_hash: string | null; sso_subject: string | null }
      | undefined;

    // One message and one code for every failure, so this cannot be used to
    // discover which addresses have accounts. The work is done either way to
    // keep the timing similar.
    const stored = row?.password_hash ?? null;
    const ok = stored ? verifyPassword(password, stored) : false;

    if (!row || !ok) {
      recordFailedAttempt(email, address);
      if (row && !stored) {
        // The account exists but only has Microsoft sign-in. Saying so would
        // confirm the address, so the generic error stands.
        console.info(`[auth] password attempt on SSO-only account ${row.id}`);
      }
      throw unauthorized("Email or password is incorrect");
    }

    clearAttempts(email, address);
    // Opportunistically move old hashes onto the current cost parameters.
    if (needsRehash(stored as string)) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        hashPassword(password),
        row.id,
      );
    }

    res.json(sessionFor(row.id));
  }),
);

/* --------------------------------------------------------- forgot / reset */

authRouter.post(
  "/forgot",
  asyncHandler(async (req, res) => {
    const email = requireString(req.body as Record<string, unknown>, "email", {
      min: 5,
      max: 254,
    }).toLowerCase();

    // Always the same answer, whether or not the address is registered.
    const generic = {
      ok: true,
      message: "If that email has an account, a reset link is on its way.",
    };

    const row = db.prepare("SELECT id, name FROM users WHERE email = ?").get(email) as
      | { id: string; name: string }
      | undefined;
    if (!row) {
      res.json(generic);
      return;
    }

    // Only the newest link should work.
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(row.id);

    const token = `rst_${newId("t").slice(2)}${sha256(`${row.id}${Date.now()}${Math.random()}`).slice(0, 32)}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      sha256(token),
      row.id,
      new Date(now).toISOString(),
      new Date(now + config.resetTokenMinutes * 60_000).toISOString(),
    );

    const link = `${config.appUrl}/auth/reset?token=${encodeURIComponent(token)}`;
    try {
      const mail = passwordResetEmail(row.name, link, config.resetTokenMinutes);
      await sendMail({ ...mail, to: email });
    } catch (err) {
      // Logged, never surfaced — the response must not differ.
      console.error("[auth] could not send reset email:", (err as Error).message);
    }

    res.json(generic);
  }),
);

/** Lets the reset screen tell a bad link from a good one before asking for a password. */
authRouter.get(
  "/reset/check",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const row = token
      ? (db
          .prepare("SELECT expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?")
          .get(sha256(token)) as { expires_at: string; used_at: string | null } | undefined)
      : undefined;

    const valid =
      !!row && !row.used_at && new Date(row.expires_at).getTime() > Date.now();
    res.json({ valid, passwordMinLength: config.passwordMinLength });
  }),
);

authRouter.post(
  "/reset",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const token = requireString(body, "token", { min: 8, max: 300 });
    const password = requireString(body, "password", { min: 1, max: 200 });

    const hash = sha256(token);
    const row = db
      .prepare(
        `SELECT t.user_id, t.expires_at, t.used_at, u.email, u.name
         FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ?`,
      )
      .get(hash) as
      | { user_id: string; expires_at: string; used_at: string | null; email: string; name: string }
      | undefined;

    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw badRequest("That reset link is no longer valid. Request a new one.");
    }

    const strength = checkPasswordStrength(password, [row.email.split("@")[0], row.name]);
    if (!strength.ok) throw badRequest("That password is not strong enough", strength.problems);

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(password),
      row.user_id,
    );
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?").run(
      nowIso(),
      hash,
    );
    // Anything else outstanding for this account is now void, and so is every
    // session that existed before the reset.
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND token_hash <> ?").run(
      row.user_id,
      hash,
    );
    bumpTokenVersion(row.user_id);
    clearAttempts(row.email, clientAddress(req));

    // A fresh session so the user lands signed in rather than back at the form.
    res.json(sessionFor(row.user_id));
  }),
);

/* ---------------------------------------------------------------- profile */

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
    const next = requireString(body, "newPassword", { min: 1, max: 200 });

    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as
      | { password_hash: string | null }
      | undefined;

    // An SSO-only account has no current password to prove; being signed in
    // through Microsoft is the proof. Everyone else must supply theirs.
    if (row?.password_hash) {
      const current = requireString(body, "currentPassword", { min: 1, max: 200 });
      if (!verifyPassword(current, row.password_hash)) {
        throw unauthorized("Current password is incorrect");
      }
    }

    const strength = checkPasswordStrength(next, [user.email.split("@")[0], user.name]);
    if (!strength.ok) throw badRequest("That password is not strong enough", strength.problems);

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
    bumpTokenVersion(user.id);

    // The caller's own token was just invalidated; hand back a new one so they
    // are not signed out by their own password change.
    res.json(sessionFor(user.id));
  }),
);
