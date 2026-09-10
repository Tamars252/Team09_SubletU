import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListingData } from "../../src/domain/ListingData.ts";
import { makeListing, makePhoto, makePricing, makeRoomDetails } from "../helpers/factories.ts";

describe("ListingData.validateData", () => {
  it("accepts a complete listing", () => {
    assert.deepEqual(makeListing().validateData(), []);
  });

  it("rejects a title shorter than 4 characters", () => {
    const problems = makeListing({ title: "Rm" }).validateData();
    assert.ok(problems.some((p) => p.includes("Title must be at least 4 characters")));
  });

  it("rejects a description shorter than 20 characters", () => {
    const problems = makeListing({ description: "Nice room" }).validateData();
    assert.ok(problems.some((p) => p.includes("Description must be at least 20 characters")));
  });

  it("requires a 2-letter state code", () => {
    assert.ok(makeListing({ state: "New York" }).validateData().length > 0);
    assert.deepEqual(makeListing({ state: "ny" }).validateData(), []);
  });

  it("rejects an unknown status", () => {
    const problems = makeListing({ status: "sold" }).validateData();
    assert.ok(problems.some((p) => p.includes('Unknown status "sold"')));
  });

  it("accepts the three real statuses", () => {
    for (const status of ["active", "paused", "removed"]) {
      assert.deepEqual(makeListing({ status }).validateData(), [], `${status} should be valid`);
    }
  });
});

/**
 * The composition relationships from the class diagram: ListingData composes
 * PhotoData, PricingData and RoomDetails, and validation cascades into each.
 * These tests are what make that claim checkable rather than just documented.
 */
describe("ListingData validation cascades into composed objects", () => {
  it("surfaces a PricingData problem through the parent", () => {
    const listing = makeListing({ pricingData: makePricing({ monthlyRent: 0 }) });
    const problems = listing.validateData();

    assert.ok(problems.some((p) => p.includes("Monthly rent must be greater than $0")));
    // Same problem the child reports on its own — the parent adds, not rewrites.
    assert.ok(makePricing({ monthlyRent: 0 }).validateData().every((p) => problems.includes(p)));
  });

  it("surfaces a RoomDetails problem through the parent", () => {
    const listing = makeListing({ roomDetails: makeRoomDetails({ bedrooms: 99 }) });
    assert.ok(
      listing.validateData().some((p) => p.includes("Bedrooms must be a whole number")),
    );
  });

  it("surfaces a PhotoData problem through the parent", () => {
    const listing = makeListing({ photoData: [makePhoto({ fileUrl: "javascript:alert(1)" })] });
    assert.ok(listing.validateData().some((p) => p.includes("Photo URL must be")));
  });

  it("collects problems from every composed object at once", () => {
    const listing = makeListing({
      title: "No",
      pricingData: makePricing({ monthlyRent: -5 }),
      roomDetails: makeRoomDetails({ maxRoommates: 999 }),
      photoData: [makePhoto({ fileSize: -1 })],
    });
    const problems = listing.validateData();

    assert.ok(problems.some((p) => p.includes("Title")));
    assert.ok(problems.some((p) => p.includes("Monthly rent")));
    assert.ok(problems.some((p) => p.includes("Max roommates")));
    assert.ok(problems.some((p) => p.includes("file size")));
  });

  it("requires both pricing and room details to be present", () => {
    const problems = makeListing({ pricingData: null, roomDetails: null }).validateData();
    assert.ok(problems.includes("Pricing is required"));
    assert.ok(problems.includes("Room details are required"));
  });

  it("does not throw when composed objects are missing", () => {
    // The ?? [] guards matter: a half-built listing must report problems,
    // not crash the request that is trying to tell the user what is wrong.
    assert.doesNotThrow(() => makeListing({ pricingData: null, roomDetails: null }).validateData());
  });
});

describe("ListingData.sortData", () => {
  const cheap = makeListing({
    listingId: "cheap",
    createdAt: "2026-01-01T00:00:00.000Z",
    pricingData: makePricing({ monthlyRent: 600, availableFrom: "2026-09-01" }),
  });
  const mid = makeListing({
    listingId: "mid",
    createdAt: "2026-03-01T00:00:00.000Z",
    pricingData: makePricing({ monthlyRent: 900, availableFrom: "2026-06-01" }),
  });
  const pricey = makeListing({
    listingId: "pricey",
    createdAt: "2026-02-01T00:00:00.000Z",
    pricingData: makePricing({ monthlyRent: 1400, availableFrom: "2026-07-01" }),
  });
  const all = [mid, pricey, cheap];
  const ids = (list: ListingData[]) => list.map((l) => l.listingId);

  it("sorts by price ascending and descending", () => {
    assert.deepEqual(ids(ListingData.sortData(all, "price_asc")), ["cheap", "mid", "pricey"]);
    assert.deepEqual(ids(ListingData.sortData(all, "price_desc")), ["pricey", "mid", "cheap"]);
  });

  it("sorts newest first", () => {
    assert.deepEqual(ids(ListingData.sortData(all, "newest")), ["mid", "pricey", "cheap"]);
  });

  it("sorts by soonest availability", () => {
    assert.deepEqual(ids(ListingData.sortData(all, "available_soonest")), [
      "mid",
      "pricey",
      "cheap",
    ]);
  });

  it("puts listings with no distance last", () => {
    const near = makeListing({ listingId: "near" });
    const far = makeListing({ listingId: "far" });
    const unknown = makeListing({ listingId: "unknown" });
    near.distanceMiles = 0.3;
    far.distanceMiles = 2.5;
    unknown.distanceMiles = null;

    assert.deepEqual(ids(ListingData.sortData([far, unknown, near], "distance")), [
      "near",
      "far",
      "unknown",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const input = [mid, pricey, cheap];
    ListingData.sortData(input, "price_asc");
    assert.deepEqual(ids(input), ["mid", "pricey", "cheap"]);
  });
});

describe("ListingData.setDistanceFromCampus", () => {
  it("computes a real distance from the Syracuse anchor", () => {
    const listing = makeListing({ lat: 43.0402, lng: -76.1372 });
    listing.setDistanceFromCampus("Syracuse University");
    assert.ok(listing.distanceMiles !== null);
    assert.ok(listing.distanceMiles < 0.5, `expected a short walk, got ${listing.distanceMiles}`);
  });

  it("is null when the listing has no coordinates", () => {
    const listing = makeListing({ lat: null, lng: null });
    listing.setDistanceFromCampus("Syracuse University");
    assert.equal(listing.distanceMiles, null);
  });

  it("falls back to Syracuse for an unknown university", () => {
    const known = makeListing();
    const unknown = makeListing();
    known.setDistanceFromCampus("Syracuse University");
    unknown.setDistanceFromCampus("Hogwarts");
    assert.equal(known.distanceMiles, unknown.distanceMiles);
  });
});
