/**
 * Listing detail view: the formatting the detail screen and the listing cards
 * share, kept free of React so it can be tested without a DOM.
 */

/** Route for one listing's full details. */
export const LISTING_PATH = "/listings/:id";

export function listingPath(id: string): string {
  return `/listings/${encodeURIComponent(id)}`;
}

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(amount: number): string {
  return wholeDollars.format(amount);
}

/**
 * Availability dates arrive as `YYYY-MM-DD`. `new Date("2026-05-15")` is
 * midnight UTC, which is still May 14 in Syracuse, so formatting it in local
 * time shows the wrong day. Formatting in UTC keeps the date the host typed.
 */
function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDay(day: string): string {
  const date = parseDay(day);
  return date ? monthDayYear.format(date) : day;
}

/**
 * "May 15 – Aug 15, 2026", or "Dec 20, 2026 – Jan 10, 2027" across a year
 * boundary. Exact dates, never "summer" (usability finding F-6).
 */
export function dateRange(from: string, to: string): string {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end) return `${from} – ${to}`;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${sameYear ? monthDay.format(start) : monthDayYear.format(start)} – ${monthDayYear.format(end)}`;
}

export function bedroomsLabel(bedrooms: number): string {
  if (bedrooms === 0) return "Studio";
  return bedrooms === 1 ? "1 bedroom" : `${bedrooms} bedrooms`;
}

export function bathroomsLabel(bathrooms: number): string {
  return bathrooms === 1 ? "1 bath" : `${bathrooms} baths`;
}

export function distanceLabel(miles: number | null, university: string): string | null {
  if (miles === null) return null;
  return `${miles.toFixed(1)} mi from ${university}`;
}

export function hostRatingLabel(rating: number, reviewCount: number): string {
  if (reviewCount === 0) return "No reviews yet";
  return `${rating.toFixed(1)} from ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`;
}

/**
 * Photos in the host's order. The API sends `sortOrder`; the array order is
 * not part of the contract, so the cover photo is the lowest sortOrder, not
 * whatever happens to be first.
 */
export function sortedPhotos<T extends { sortOrder: number }>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Steps through photos and wraps at both ends, so Next on the last goes to the first. */
export function stepPhoto(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}
