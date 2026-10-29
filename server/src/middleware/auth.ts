import type { NextFunction, Request, Response } from "express";
import { db } from "../db.ts";
import { unauthorized } from "../lib/http.ts";
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
          rating, review_count, created_at
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
      if (user) req.user = user;
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

/** Narrowing helper for handlers that run behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
