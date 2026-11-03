import type { Request, RequestHandler } from "express";
import { tooManyRequests } from "./http.ts";

type Options = {
  /** How many requests one key may make inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** What counts as "the same caller". Defaults to the client IP. */
  keyFor?: (req: Request) => string;
};

type Bucket = { count: number; resetAt: number };

/**
 * A fixed-window limiter held in memory.
 *
 * The API runs as a single process against a single SQLite file, so there is
 * nothing to share state with — keeping this in a Map avoids a dependency and
 * a second datastore. If the API is ever scaled out, this has to move to a
 * shared store, because each process would otherwise allow the full quota.
 */
export function rateLimit(options: Options): RequestHandler {
  const { limit, windowMs, keyFor = (req) => req.ip ?? "unknown" } = options;
  const buckets = new Map<string, Bucket>();

  // Sweep expired buckets so a long-running process does not grow without
  // bound. unref() keeps the timer from holding the process open on shutdown.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const key = keyFor(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      next(tooManyRequests("Too many attempts — try again shortly", retryAfterSeconds));
      return;
    }

    next();
  };
}

/** Normalises the email in a credential body so one account is one bucket. */
export function emailKey(req: Request): string {
  const body = req.body as Record<string, unknown> | undefined;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  return `${req.ip ?? "unknown"}:${email}`;
}
