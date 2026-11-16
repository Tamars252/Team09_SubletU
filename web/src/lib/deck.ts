/**
 * The decisions the swipe deck and the Saved tab make, kept apart from the
 * components so they can be tested without a DOM (same pattern as
 * auth/guard.ts).
 */
import type { Listing } from "../api/types.ts";

export type Direction = "left" | "right";

/** How far a card must travel, as a share of its width, before it counts. */
export const SWIPE_THRESHOLD = 0.28;

/** Ask the server for more cards once this few are left on the client. */
export const REFILL_AT = 3;

/**
 * What a released drag means. Anything short of the threshold is not a
 * decision: the card snaps back. A width of 0 (not measured yet) is never a
 * decision either, rather than dividing by zero.
 */
export function swipeDecision(dx: number, cardWidth: number): Direction | null {
  if (!Number.isFinite(dx) || cardWidth <= 0) return null;
  const share = dx / cardWidth;
  if (share >= SWIPE_THRESHOLD) return "right";
  if (share <= -SWIPE_THRESHOLD) return "left";
  return null;
}

/** Tilt while dragging: up to 12 degrees, in the direction of travel. */
export function dragRotation(dx: number, cardWidth: number): number {
  if (cardWidth <= 0) return 0;
  const tilt = (dx / cardWidth) * 18;
  return Math.max(-12, Math.min(12, tilt));
}

/** 0..1 — how visible the SAVE / PASS stamp is during a drag. */
export function stampOpacity(dx: number, cardWidth: number): number {
  if (cardWidth <= 0) return 0;
  return Math.min(1, Math.abs(dx) / (cardWidth * SWIPE_THRESHOLD));
}

/**
 * The pointer events that end a drag. `pointercancel` is listed on purpose:
 * the browser fires it when it takes the gesture over (on touch, a vertical
 * scroll under `touch-action: pan-y`), and Chrome reports it at clientX 0.
 * Reading that as a release made a vertical drag pass the listing (TM09-131).
 * A cancel is never a decision.
 */
export function releaseDecision(
  type: "pointerup" | "pointercancel",
  dx: number,
  cardWidth: number,
): Direction | null {
  if (type === "pointercancel") return null;
  return swipeDecision(dx, cardWidth);
}

/** Drop one listing by id, leaving the rest in order. */
export function withoutListing<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((l) => l.id !== id);
}

/**
 * Append freshly fetched deck cards without repeating ones already queued.
 * The server leaves out swiped listings, but a swipe still in flight is not
 * swiped yet as far as the server knows.
 */
export function mergeDeck(current: Listing[], incoming: Listing[], skip: Set<string>): Listing[] {
  const seen = new Set([...current.map((l) => l.id), ...skip]);
  return [...current, ...incoming.filter((l) => !seen.has(l.id))];
}

/** True once the deck should ask the server for more. */
export function needsRefill(queued: number, remaining: number): boolean {
  return queued <= REFILL_AT && remaining > queued;
}

export type EmptyDeck = { title: string; body: string; showClear: boolean };

/**
 * What the empty deck says. Reset browsing is always offered (TM09-158): it
 * is the only way back to listings the renter passed. With filters on, the
 * usual reason is that nothing else matches, so clearing them is offered too.
 */
export function emptyDeckState(filterCount: number): EmptyDeck {
  if (filterCount > 0) {
    return {
      title: "No more listings match",
      body: "Loosen your filters, or reset browsing to see listings you already passed.",
      showClear: true,
    };
  }
  return {
    title: "You've seen every listing",
    body: "Reset browsing to bring back the ones you passed. Your saved listings stay saved.",
    showClear: false,
  };
}

/* --------------------------------------------------------------- display */

export function rentLabel(listing: Pick<Listing, "pricing">): string {
  const rent = listing.pricing?.monthlyRent;
  if (rent === undefined || rent === null) return "Price on request";
  return `$${Math.round(rent).toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jan 1 – May 31, 2027". Dates are YYYY-MM-DD and read as calendar days, not instants. */
export function availabilityLabel(listing: Pick<Listing, "pricing">): string {
  const p = listing.pricing;
  if (!p) return "";
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
  };
  const from = parse(p.availableFrom);
  const to = parse(p.availableTo);
  if (!from || !to) return "";
  const fromText = `${MONTHS[from.m]} ${from.d}${from.y === to.y ? "" : `, ${from.y}`}`;
  return `${fromText} – ${MONTHS[to.m]} ${to.d}, ${to.y}`;
}

export function roomLabel(listing: Pick<Listing, "roomDetails">): string {
  const r = listing.roomDetails;
  if (!r) return "";
  const beds = r.bedrooms === 0 ? "Studio" : `${r.bedrooms} bd`;
  return `${beds} · ${r.bathrooms} ba`;
}

export function distanceLabel(listing: Pick<Listing, "distanceMiles">): string {
  const d = listing.distanceMiles;
  if (d === null || d === undefined) return "";
  return d < 0.1 ? "On campus" : `${d.toFixed(1)} mi from campus`;
}

export function coverPhoto(listing: Pick<Listing, "photos">): string | null {
  const first = [...listing.photos].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return first?.fileUrl ?? null;
}
