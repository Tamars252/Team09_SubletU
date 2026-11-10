/**
 * TM09-101: every decision the Saved screen makes, kept apart from the
 * component that renders it so it can be tested without a DOM — the same split
 * as auth/guard.ts and components/ProtectedRoute.tsx.
 *
 * Nothing here touches React, `fetch`, or the clock.
 */
import type { Listing } from "../api/types.ts";

/**
 * Where a saved card points. The web listing-detail screen is a separate
 * story; this mirrors `GET /listings/:id` from docs/api-contract.md so the one
 * place that needs changing when that screen lands is this function. Until
 * then the URL falls through App's catch-all route back to "/".
 */
export function listingDetailPath(listingId: string): string {
  return `/listings/${listingId}`;
}

/* ------------------------------------------------------------------ order */

/**
 * `savedAt` as a sortable number, or null when the API left it off or sent
 * something unparseable. The field is optional on `Listing`, so a saved
 * listing that arrives without it must not poison the whole ordering.
 */
export function savedAtTime(listing: Listing): number | null {
  if (!listing.savedAt) return null;
  const ms = Date.parse(listing.savedAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Newest save first (AC2). `GET /saved` already orders this way, but the
 * screen re-sorts because it also re-renders lists it has changed locally, and
 * because an ordering the UI promises should not depend on the server
 * remembering to keep it.
 *
 * Entries with no usable `savedAt` sort last, in the order the API sent them;
 * ties keep their arrival order too, so the result is stable.
 */
export function sortBySavedAt(listings: readonly Listing[]): Listing[] {
  return listings
    .map((listing, index) => ({ listing, index, at: savedAtTime(listing) }))
    .sort((a, b) => {
      if (a.at === null && b.at === null) return a.index - b.index;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      if (a.at !== b.at) return b.at - a.at;
      return a.index - b.index;
    })
    .map((entry) => entry.listing);
}

/* ----------------------------------------------------- optimistic unsave */

/**
 * What `beginRemove` hands back so a failed DELETE can be undone: the list
 * without the card, plus where it used to sit.
 */
export type Removal = {
  /** The list to show while the DELETE is in flight. */
  next: Listing[];
  /** The card that was taken out. */
  removed: Listing;
  /** Its position in the list it came from. */
  index: number;
};

/**
 * Takes a card out straight away, before the server has answered (AC3).
 * Returns null when the id isn't in the list, which is what a double-click or
 * a second request for an already-removed card looks like — the caller should
 * do nothing rather than fire a second DELETE.
 */
export function beginRemove(listings: readonly Listing[], listingId: string): Removal | null {
  const index = listings.findIndex((listing) => listing.id === listingId);
  if (index === -1) return null;
  const next = listings.slice();
  const [removed] = next.splice(index, 1);
  return { next, removed, index };
}

/**
 * Puts the card back where it was after a failed DELETE (AC3).
 *
 * Re-inserting blindly would duplicate the card if a reload finished while the
 * DELETE was failing, so a list that already has the id is returned untouched.
 */
export function rollbackRemove(listings: readonly Listing[], removal: Removal): Listing[] {
  if (listings.some((listing) => listing.id === removal.removed.id)) return listings.slice();
  const next = listings.slice();
  next.splice(Math.min(removal.index, next.length), 0, removal.removed);
  return next;
}

/* ------------------------------------------------------------ presentation */

/**
 * A listing the renter can no longer act on (AC8). The server already drops
 * `removed` listings from `GET /saved`, but `pending` and `inactive` come
 * through, and a saved card for one should say so rather than look bookable.
 */
export function isUnavailable(listing: Listing): boolean {
  return listing.status !== "active";
}

/** The chip text for an unavailable card, or null when it is bookable. */
export function unavailableLabel(listing: Listing): string | null {
  if (!isUnavailable(listing)) return null;
  return listing.status === "pending" ? "Pending" : "Unavailable";
}

/**
 * The photo to show, or null when there is none and the card should fall back
 * to the `.list-thumb` gradient (AC2). Photos are not guaranteed to arrive in
 * `sortOrder`, so the lowest one wins rather than the first in the array.
 */
export function primaryPhotoUrl(listing: Listing): string | null {
  let best: { url: string; order: number } | null = null;
  for (const photo of listing.photos) {
    if (!photo.fileUrl) continue;
    if (best === null || photo.sortOrder < best.order) {
      best = { url: photo.fileUrl, order: photo.sortOrder };
    }
  }
  return best?.url ?? null;
}

/**
 * Monthly rent as it appears on the card. `pricing` is null on a listing whose
 * composed records are missing (docs/api-contract.md), so this must not assume
 * a number is there.
 */
export function formatRent(listing: Listing): string {
  const rent = listing.pricing?.monthlyRent;
  if (typeof rent !== "number" || !Number.isFinite(rent)) return "Rent not listed";
  return `$${Math.round(rent).toLocaleString("en-US")}`;
}

/** The city/address line, skipping whichever half the listing is missing. */
export function formatLocation(listing: Listing): string {
  return [listing.address, listing.city].filter((part) => part && part.trim() !== "").join(", ");
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Formats a `YYYY-MM-DD` date by reading the string, not by building a `Date`.
 * `new Date("2026-05-15")` is midnight UTC, so rendering it in a timezone
 * behind UTC shows the 14th — and the tests would then pass in Syracuse and
 * fail elsewhere. Returns null for anything that is not a plain ISO date.
 */
export function formatDay(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return null;
  return `${name} ${Number(day)}, ${year}`;
}

/**
 * The availability window for the card (AC2) — "May 15, 2026 – Aug 15, 2026",
 * or a one-sided range when only one end is known.
 */
export function formatAvailability(listing: Listing): string {
  const from = formatDay(listing.pricing?.availableFrom);
  const to = formatDay(listing.pricing?.availableTo);
  if (from && to) return `${from} \u2013 ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "Dates not listed";
}
