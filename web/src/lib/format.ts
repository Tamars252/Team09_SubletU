import type { Listing } from "../api/types.ts";

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** "May 15 – Aug 15, 2026" */
export function dateRange(from: string, to: string): string {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${from} – ${to}`;
  const short = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const year = b.getFullYear();
  return `${short(a)} – ${short(b)}, ${year}`;
}

export function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.4)));
}

export function distanceLabel(miles: number | null): string {
  if (miles === null) return "Distance unknown";
  if (miles < 0.1) return "On campus";
  return `${miles.toFixed(1)} mi to campus`;
}

/** Rough walking time at 3 mph. */
export function walkLabel(miles: number | null): string | null {
  if (miles === null || miles > 2.5) return null;
  const minutes = Math.max(1, Math.round((miles / 3) * 60));
  return `${minutes} min walk`;
}

export function bedLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio" : `${bedrooms} bed`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function heroPhoto(listing: Listing): string | null {
  return listing.photos[0]?.fileUrl ?? null;
}

/** A stable, listing-specific gradient for cards with no photo. */
export function fallbackGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  const pairs = [
    "linear-gradient(135deg, #D4603A 0%, #E8956E 55%, #F2D4C7 100%)",
    "linear-gradient(135deg, #B84E2C 0%, #D4603A 55%, #E8956E 100%)",
    "linear-gradient(135deg, #D4A03A 0%, #E8C96E 55%, #FFF3D4 100%)",
    "linear-gradient(135deg, #3A8D5C 0%, #7BB894 55%, #D4EDDF 100%)",
    "linear-gradient(135deg, #636E72 0%, #B2BEC3 55%, #DFE6E9 100%)",
  ];
  return pairs[hash % pairs.length];
}

export function photoStyle(listing: Listing): React.CSSProperties {
  const url = heroPhoto(listing);
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: fallbackGradient(listing.id) };
}
