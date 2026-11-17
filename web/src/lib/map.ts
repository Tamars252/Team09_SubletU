/**
 * TM09-163: the decisions the Map tab makes, kept apart from MapCanvas and
 * MapScreen so they can be tested without a DOM or a WebGL context — the same
 * split as lib/saved.ts and components/ProtectedRoute.tsx.
 *
 * Nothing here touches React, `fetch`, or the clock. MapLibre is imported as a
 * type only, so this file loads in the plain-Node test runner.
 */
import type { StyleSpecification } from "maplibre-gl";
import type { Listing } from "../api/types.ts";
import { formatRent, hasRent } from "./saved.ts";

/** Syracuse University — used until the campus list arrives, or if it fails. */
export const FALLBACK_CENTER = { lat: 43.0392, lng: -76.1351 };

/** Keeps the auto-fit camera in a range where individual pins stay readable. */
export const MIN_NEIGHBORHOOD_ZOOM = 13.4;
export const MAX_FIT_ZOOM = 15.5;

/**
 * Raster style backed by OpenStreetMap's standard tiles. No API key and no
 * account required, which keeps the map genuinely live out of the box.
 *
 * This has to be a factory, not a shared constant: MapLibre takes ownership of
 * the style object and mutates it, so handing the same object to a second Map
 * (a remount, or StrictMode's double mount in dev) leaves the second one with
 * no raster source and a blank basemap.
 */
export function createOsmStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
  };
}

/** A listing that can be drawn: both coordinates are real, finite numbers. */
export function hasCoordinates(listing: Listing): boolean {
  return (
    typeof listing.lat === "number" &&
    typeof listing.lng === "number" &&
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng)
  );
}

/** Listings that get a pin. Ones the geocoder could not place are left off. */
export function pinnedListings(listings: readonly Listing[]): Listing[] {
  return listings.filter(hasCoordinates);
}

/** Text on a pin: "$850", or "—" when the listing has no rent to show. */
export function pinLabel(listing: Listing): string {
  return hasRent(listing) ? formatRent(listing) : "—";
}

/** "3 listings on the map" / "1 listing on the map". */
export function countLabel(count: number): string {
  return `${count} listing${count === 1 ? "" : "s"} on the map`;
}

/**
 * Clamps a fit-to-pins zoom. Left alone, a single far-off listing pulls the
 * camera out to the whole metro area and every pin collapses into one cluster.
 */
export function clampFitZoom(zoom: number): number {
  return Math.min(MAX_FIT_ZOOM, Math.max(MIN_NEIGHBORHOOD_ZOOM, zoom));
}

export type Campus = { name: string; lat: number; lng: number };

/** The signed-in person's campus if it is known, else the first one listed. */
export function pickCampus(campuses: readonly Campus[], university: string | undefined): Campus | null {
  return campuses.find((c) => c.name === university) ?? campuses[0] ?? null;
}
