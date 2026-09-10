import { config } from "../config.ts";
import { db, nowIso } from "../db.ts";

export type GeoPoint = { lat: number; lng: number; displayName: string | null };

/** Nominatim's usage policy is 1 request/second. Serialize every call. */
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, 1100 - (Date.now() - lastCallAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  };
  const next = queue.then(run, run);
  // Keep the chain alive even if a call rejects.
  queue = next.catch(() => undefined);
  return next;
}

const selectCache = db.prepare("SELECT lat, lng, display_name FROM geocache WHERE query = ?");
const upsertCache = db.prepare(`
  INSERT INTO geocache (query, lat, lng, display_name, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng,
    display_name = excluded.display_name, created_at = excluded.created_at
`);

function readCache(key: string): GeoPoint | null | undefined {
  const row = selectCache.get(key) as
    | { lat: number | null; lng: number | null; display_name: string | null }
    | undefined;
  if (!row) return undefined; // never looked up
  if (row.lat === null || row.lng === null) return null; // looked up, no result
  return { lat: row.lat, lng: row.lng, displayName: row.display_name };
}

async function nominatim(pathAndQuery: string): Promise<unknown> {
  const res = await throttle(() =>
    fetch(`${config.nominatimUrl}${pathAndQuery}`, {
      headers: { "User-Agent": config.nominatimUserAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    }),
  );
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  return res.json();
}

/** Forward-geocode a street address. Cached in SQLite; null when unresolvable. */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
): Promise<GeoPoint | null> {
  const key = `fwd:${address}, ${city}, ${state}`.toLowerCase();
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const q = encodeURIComponent(`${address}, ${city}, ${state}, USA`);
  let point: GeoPoint | null = null;
  try {
    const data = (await nominatim(`/search?q=${q}&format=jsonv2&limit=1&addressdetails=0`)) as
      | Array<{ lat: string; lon: string; display_name?: string }>
      | undefined;
    const hit = data?.[0];
    if (hit) {
      point = {
        lat: Number.parseFloat(hit.lat),
        lng: Number.parseFloat(hit.lon),
        displayName: hit.display_name ?? null,
      };
    }
  } catch (err) {
    // Network failure: don't poison the cache, let the next request retry.
    console.warn(`[geocode] lookup failed for "${key}":`, (err as Error).message);
    return null;
  }

  upsertCache.run(key, point?.lat ?? null, point?.lng ?? null, point?.displayName ?? null, nowIso());
  return point;
}

/** Free-text place search used by the map's search box. */
export async function searchPlaces(
  query: string,
  limit = 6,
): Promise<Array<GeoPoint & { name: string }>> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const q = encodeURIComponent(trimmed);
  const data = (await nominatim(
    `/search?q=${q}&format=jsonv2&limit=${limit}&countrycodes=us`,
  )) as Array<{ lat: string; lon: string; display_name: string; name?: string }>;
  return (data ?? []).map((hit) => ({
    lat: Number.parseFloat(hit.lat),
    lng: Number.parseFloat(hit.lon),
    displayName: hit.display_name,
    name: hit.name || hit.display_name.split(",")[0],
  }));
}

/** Great-circle distance in miles — powers "distance from campus" and radius filters. */
export function haversineMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Campus anchors used for the "distance from campus" badge. */
export const CAMPUS_ANCHORS: Record<string, { lat: number; lng: number }> = {
  "Syracuse University": { lat: 43.0392, lng: -76.1351 },
  "Boston University": { lat: 42.3505, lng: -71.1054 },
  NYU: { lat: 40.7295, lng: -73.9965 },
  "Columbia University": { lat: 40.8075, lng: -73.9626 },
  "Cornell University": { lat: 42.4534, lng: -76.4735 },
  "University of Michigan": { lat: 42.278, lng: -83.7382 },
  UCLA: { lat: 34.0689, lng: -118.4452 },
  USC: { lat: 34.0224, lng: -118.2851 },
  "Georgetown University": { lat: 38.9076, lng: -77.0723 },
  "Northeastern University": { lat: 42.3398, lng: -71.0892 },
  "Emory University": { lat: 33.7925, lng: -84.3240 },
  "University of Wisconsin-Madison": { lat: 43.0766, lng: -89.4125 },
  "Purdue University": { lat: 40.4237, lng: -86.9212 },
};
