import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, details);
export const unauthorized = (message = "Sign in required") => new HttpError(401, message);
export const forbidden = (message = "Not allowed") => new HttpError(403, message);
export const notFound = (message = "Not found") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new HttpError(429, message, { retryAfterSeconds });

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/* ------------------------------------------------------------ validation */

export function requireString(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max?: number } = {},
): string {
  const raw = body[field];
  if (typeof raw !== "string") throw badRequest(`"${field}" is required`);
  const value = raw.trim();
  const min = opts.min ?? 1;
  const max = opts.max ?? 5000;
  if (value.length < min) throw badRequest(`"${field}" must be at least ${min} characters`);
  if (value.length > max) throw badRequest(`"${field}" must be at most ${max} characters`);
  return value;
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
  fallback = "",
  max = 5000,
): string {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") throw badRequest(`"${field}" must be a string`);
  const value = raw.trim();
  if (value.length > max) throw badRequest(`"${field}" must be at most ${max} characters`);
  return value;
}

export function requireNumber(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max?: number } = {},
): number {
  const value = Number(body[field]);
  if (!Number.isFinite(value)) throw badRequest(`"${field}" must be a number`);
  if (opts.min !== undefined && value < opts.min)
    throw badRequest(`"${field}" must be at least ${opts.min}`);
  if (opts.max !== undefined && value > opts.max)
    throw badRequest(`"${field}" must be at most ${opts.max}`);
  return value;
}

export function optionalNumber(
  body: Record<string, unknown>,
  field: string,
  fallback: number,
  opts: { min?: number; max?: number } = {},
): number {
  if (body[field] === undefined || body[field] === null || body[field] === "") return fallback;
  return requireNumber(body, field, opts);
}

export function toBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * Accepts YYYY-MM-DD (month and day may be unpadded) and always returns the
 * zero-padded form.
 *
 * The padding matters: SQLite's date() returns NULL for "2026-1-5", so an
 * unpadded date stored verbatim makes the listing invisible to every
 * availability filter, and sorts wrong under a string comparison.
 */
export function requireDate(body: Record<string, unknown>, field: string): string {
  const value = requireString(body, field, { min: 8, max: 32 });
  const match = DATE_RE.exec(value);
  if (!match) throw badRequest(`"${field}" must be a date in YYYY-MM-DD form`);

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  // Date() rolls over out-of-range parts (Feb 31 -> Mar 3), so compare back.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw badRequest(`"${field}" is not a valid date`);
  }

  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
