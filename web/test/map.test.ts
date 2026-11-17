/**
 * TM09-163: the Map tab's logic, tested without a DOM or a WebGL context.
 * Drawing is MapCanvas's job; what gets drawn, labelled and framed is here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Listing } from "../src/api/types.ts";
import {
  FALLBACK_CENTER,
  MAX_FIT_ZOOM,
  MIN_NEIGHBORHOOD_ZOOM,
  clampFitZoom,
  countLabel,
  createOsmStyle,
  hasCoordinates,
  pickCampus,
  pinLabel,
  pinnedListings,
} from "../src/lib/map.ts";

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "lst_1",
    ownerId: "usr_1",
    title: "Sunny room near campus",
    address: "100 Euclid Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "",
    lat: 43.04,
    lng: -76.13,
    geocodeSource: "nominatim",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    photos: [],
    pricing: {
      monthlyRent: 850,
      availableFrom: "2026-05-15",
      availableTo: "2026-08-15",
      utilitiesIncluded: false,
      deposit: 0,
    },
    roomDetails: null,
    amenities: [],
    owner: null,
    distanceMiles: null,
    ...overrides,
  };
}

describe("pins", () => {
  it("draws a listing that has both coordinates", () => {
    assert.equal(hasCoordinates(listing()), true);
  });

  it("leaves off listings the geocoder could not place", () => {
    assert.equal(hasCoordinates(listing({ lat: null })), false);
    assert.equal(hasCoordinates(listing({ lng: null })), false);
    assert.equal(hasCoordinates(listing({ lat: Number.NaN })), false);
  });

  it("keeps a coordinate of exactly 0 — that is a real place, not a missing one", () => {
    assert.equal(hasCoordinates(listing({ lat: 0, lng: 0 })), true);
  });

  it("pinnedListings keeps order and drops only the unplaced ones", () => {
    const a = listing({ id: "a" });
    const b = listing({ id: "b", lat: null });
    const c = listing({ id: "c" });
    assert.deepEqual(pinnedListings([a, b, c]).map((l) => l.id), ["a", "c"]);
  });

  it("labels a pin with the rent, or a dash when there is none", () => {
    assert.equal(pinLabel(listing()), "$850");
    assert.equal(pinLabel(listing({ pricing: null })), "—");
  });

  it("formats thousands in the pin label", () => {
    assert.equal(
      pinLabel(listing({ pricing: { ...listing().pricing!, monthlyRent: 1250 } })),
      "$1,250",
    );
  });
});

describe("count label", () => {
  it("pluralises", () => {
    assert.equal(countLabel(0), "0 listings on the map");
    assert.equal(countLabel(1), "1 listing on the map");
    assert.equal(countLabel(24), "24 listings on the map");
  });
});

describe("camera", () => {
  it("clamps a zoomed-out fit back to a readable neighbourhood", () => {
    assert.equal(clampFitZoom(9), MIN_NEIGHBORHOOD_ZOOM);
  });

  it("clamps a zoomed-in fit so a single pin is not hugged", () => {
    assert.equal(clampFitZoom(19), MAX_FIT_ZOOM);
  });

  it("leaves a zoom already in range alone", () => {
    assert.equal(clampFitZoom(14.5), 14.5);
  });

  it("falls back to Syracuse University before campuses load", () => {
    assert.ok(Math.abs(FALLBACK_CENTER.lat - 43.04) < 0.1);
    assert.ok(Math.abs(FALLBACK_CENTER.lng + 76.13) < 0.1);
  });
});

describe("campus choice", () => {
  const campuses = [
    { name: "Syracuse University", lat: 43.04, lng: -76.13 },
    { name: "Colgate University", lat: 42.82, lng: -75.54 },
  ];

  it("picks the person's own campus", () => {
    assert.equal(pickCampus(campuses, "Colgate University")?.name, "Colgate University");
  });

  it("falls back to the first campus for an unknown or missing university", () => {
    assert.equal(pickCampus(campuses, "Nowhere State")?.name, "Syracuse University");
    assert.equal(pickCampus(campuses, undefined)?.name, "Syracuse University");
  });

  it("is null when no campuses loaded", () => {
    assert.equal(pickCampus([], "Syracuse University"), null);
  });
});

describe("OSM basemap style", () => {
  it("needs no API key and credits OpenStreetMap", () => {
    const style = createOsmStyle();
    const source = style.sources.osm;
    assert.equal(source.type, "raster");
    assert.ok(source.type === "raster" && source.tiles?.[0]?.startsWith("https://tile.openstreetmap.org/"));
    assert.ok(source.type === "raster" && source.attribution?.includes("OpenStreetMap"));
  });

  it("returns a fresh object each call — MapLibre mutates the one it is given", () => {
    assert.notEqual(createOsmStyle(), createOsmStyle());
    assert.notEqual(createOsmStyle().sources, createOsmStyle().sources);
  });
});
