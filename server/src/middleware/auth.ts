import type { NextFunction, Request, Response } from "express";
import { db } from "../db.ts";
import { HttpError, unauthorized } from "../lib/http.ts";
import { verifyToken } from "../lib/crypto.ts";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  university: string;
  bio: string;
  avatarInitials: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  tokenVersion: number;
  /** How this account can sign in — drives what the Profile screen offers. */
  hasPassword: boolean;
  linkedToSso: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const selectUser = db.prepare(
  `SELECT id, email, name, university, bio, avatar_initials, verified,
          rating, review_count, created_at, token_version,
          sso_subject, password_hash
   FROM users WHERE id = ?`,
);

export function loadUserById(id: string): AuthUser | null {
  const row = selectUser.get(id) as
    | {
        id: string;
        email: string;
        name: string;
        university: string;
        bio: string;
        avatar_initials: string;
        verified: number;
        rating: number;
        review_count: number;
        created_at: string;
        token_version: number;
        sso_subject: string | null;
        password_hash: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    university: row.university,
    bio: row.bio,
    avatarInitials: row.avatar_initials,
    verified: row.verified === 1,
    rating: row.rating,
    reviewCount: row.review_count,
    createdAt: row.created_at,
    tokenVersion: row.token_version ?? 1,
    hasPassword: Boolean(row.password_hash),
    linkedToSso: Boolean(row.sso_subject),
  };
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/** Attaches req.user when a valid token is present; never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = loadUserById(payload.sub);
      // A signature alone is not enough: the token also has to match the
      // account's current version, so resetting a password retires every
      // session issued before it. Tokens minted before this field existed
      // carry no `tv` and are treated as version 1.
      if (user && (payload.tv ?? 1) === user.tokenVersion) req.user = user;
    }
  }
  next();
}

/** Rejects the request unless a valid session is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}

/**
 * Rejects anything that would put a user in front of other people — posting a
 * listing, opening a conversation, filing a report — until the account is
 * verified. Browsing, swiping and saving are private and stay open, so a new
 * account can look around while it waits for a code.
 *
 * The UI gates on the same flag, but that is a courtesy; this is the check
 * that actually holds, since the API is reachable without it.
 */
export function requireVerified(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  if (!req.user.verified) {
    next(
      new HttpError(
        403,
        "Confirm your school email before you can post or message. Check your inbox for the code.",
      ),
    );
    return;
  }
  next();
}

/** Narrowing helper for handlers that run behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
