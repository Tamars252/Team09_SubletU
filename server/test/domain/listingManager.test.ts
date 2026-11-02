/**
 * TM09-130: Listings CRUD, filters and deck.
 *
 * One test block per acceptance criterion:
 *   1. Every filter parameter in docs/api-contract.md narrows the results.
 *   2. The deck leaves out listings the viewer already swiped (and their own).
 *   3. Only the owner can edit or delete a listing.
 *
 * Runs against a throwaway SQLite file (see helpers/env.ts) and pre-fills the
 * geocache, so no test ever calls Nominatim.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";
import { ListingManager } from "../../src/domain/ListingManager.ts";
import type { SubmitListingInput } from "../../src/domain/ListingManager.ts";
import type { ListingFilter } from "../../src/domain/ListingData.ts";

// Syracuse University's main quad, the default distance anchor.
const CAMPUS = { lat: 43.0377, lng: -76.1341 };

function addUser(name: string): string {
  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at)
     VALUES (?, ?, ?, 'x', ?)`,
  ).run(id, `${id}@syr.edu`, name, nowIso());
  return id;
}

/** Pin an address in the geocache so submitListing never goes to the network. */
function pin(address: string, lat: number, lng: number): void {
  db.prepare(
    `INSERT OR REPLACE INTO geocache (query, lat, lng, display_name, created_at)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run(`fwd:${address}, syracuse, ny`.toLowerCase(), lat, lng, nowIso());
}

function input(ownerId: string, over: Partial<SubmitListingInput> = {}): SubmitListingInput {
  return {
    ownerId,
    title: "Sunny room near campus",
    address: "100 Default St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "Bright furnished room, five minutes from the quad.",
    monthlyRent: 800,
    availableFrom: "2027-01-01",
    availableTo: "2027-05-31",
    utilitiesIncluded: false,
    deposit: 500,
    bedrooms: 1,
    bathrooms: 1,
    maxRoommates: 2,
    petsAllowed: false,
    furnished: false,
    privateBath: false,
    amenities: [],
    photoDataUrls: [],
    photoUrls: ["https://example.com/photo.jpg"],
    ...over,
  };
}

async function submit(ownerId: string, over: Partial<SubmitListingInput> = {}): Promise<string> {
  const status = await new ListingManager().submitListing(input(ownerId, over));
  assert.ok(status.ok, `submit failed: ${status.problems.join("; ")}`);
  return status.listing!.listingId;
}

function ids(filter: ListingFilter): Set<string> {
  return new Set(new ListingManager().retrieveListings(filter).map((l) => l.listingId));
}

let host: string;
let other: string;
let renter: string;
const L: Record<string, string> = {};

before(async () => {
  host = addUser("Hannah Host");
  other = addUser("Omar Other");
  renter = addUser("Riley Renter");

  pin("100 Default St", 43.039, -76.135); // ~0.1 mi from campus
  pin("900 Far Rd", 43.1, -76.0); // ~8 mi away
  pin("200 Euclid Ave", 43.042, -76.128);

  L.cheap = await submit(host, { title: "Cheap studio on the Hill", monthlyRent: 450 });
  L.pricey = await submit(host, {
    title: "Luxury two bedroom",
    monthlyRent: 1600,
    bedrooms: 2,
    bathrooms: 2,
    furnished: true,
    utilitiesIncluded: true,
  });
  L.pets = await submit(other, {
    title: "Pet friendly Westcott flat",
    address: "200 Euclid Ave",
    petsAllowed: true,
    amenities: ["Laundry", "Parking"],
  });
  L.far = await submit(other, {
    title: "Quiet place out of town",
    address: "900 Far Rd",
    availableFrom: "2027-08-01",
    availableTo: "2027-12-31",
  });
});

describe("AC1: every filter parameter from the API contract works", () => {
  it("q matches title, address, description or city", () => {
    assert.deepEqual(ids({ q: "Westcott" }), new Set([L.pets]));
  });

  it("minPrice and maxPrice bound the monthly rent", () => {
    assert.deepEqual(ids({ minPrice: 1000 }), new Set([L.pricey]));
    assert.deepEqual(ids({ maxPrice: 500 }), new Set([L.cheap]));
  });

  it("minBedrooms and minBathrooms", () => {
    assert.deepEqual(ids({ minBedrooms: 2 }), new Set([L.pricey]));
    assert.deepEqual(ids({ minBathrooms: 2 }), new Set([L.pricey]));
  });

  it("petsAllowed, furnished and utilitiesIncluded", () => {
    assert.deepEqual(ids({ petsAllowed: true }), new Set([L.pets]));
    assert.deepEqual(ids({ furnished: true }), new Set([L.pricey]));
    assert.deepEqual(ids({ utilitiesIncluded: true }), new Set([L.pricey]));
  });

  it("amenities requires every amenity, case-insensitive", () => {
    assert.deepEqual(ids({ amenities: ["laundry", "parking"] }), new Set([L.pets]));
    assert.equal(ids({ amenities: ["laundry", "pool"] }).size, 0);
  });

  it("availableFrom / availableTo match overlapping windows", () => {
    assert.deepEqual(ids({ availableFrom: "2027-07-01" }), new Set([L.far]));
    assert.ok(!ids({ availableTo: "2027-06-30" }).has(L.far));
  });

  it("radiusMiles keeps listings within range of the anchor", () => {
    const near = ids({ near: CAMPUS, radiusMiles: 2 });
    assert.ok(near.has(L.cheap) && near.has(L.pets));
    assert.ok(!near.has(L.far));
  });

  it("bbox keeps listings inside the box", () => {
    const box = { minLat: 43.03, maxLat: 43.045, minLng: -76.14, maxLng: -76.12 };
    const inside = ids({ bbox: box });
    assert.ok(inside.has(L.pets));
    assert.ok(!inside.has(L.far));
  });

  it("sort=price_asc and price_desc order by rent", () => {
    const m = new ListingManager();
    const asc = m.retrieveListings({}, "price_asc").map((l) => l.pricingData!.monthlyRent);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = m.retrieveListings({}, "price_desc").map((l) => l.pricingData!.monthlyRent);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  });

  it("sort=distance puts the closest listing first", () => {
    const sorted = new ListingManager().retrieveListings({ near: CAMPUS }, "distance");
    assert.equal(sorted.at(-1)!.listingId, L.far);
  });
});

describe("AC2: the deck excludes listings the viewer already swiped", () => {
  it("drops a listing once the renter swipes it, in either direction", () => {
    const before = ids({ excludeSwipedBy: renter });
    assert.ok(before.has(L.cheap) && before.has(L.pets));

    const swipe = db.prepare(
      "INSERT INTO swipes (id, user_id, listing_id, direction, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    swipe.run(newId("swp"), renter, L.cheap, "right", nowIso());
    swipe.run(newId("swp"), renter, L.pets, "left", nowIso());

    const after = ids({ excludeSwipedBy: renter });
    assert.ok(!after.has(L.cheap));
    assert.ok(!after.has(L.pets));
    assert.ok(after.has(L.pricey));
  });

  it("never shows hosts their own listings", () => {
    const deck = ids({ excludeSwipedBy: host });
    assert.ok(!deck.has(L.cheap) && !deck.has(L.pricey));
    assert.ok(deck.has(L.pets));
  });

  it("one renter's swipes don't hide listings from another renter", () => {
    assert.ok(ids({ excludeSwipedBy: other }).has(L.cheap));
  });
});

describe("AC3: only the owner can edit or delete a listing", () => {
  it("rejects an edit from someone else and leaves the listing unchanged", async () => {
    const m = new ListingManager();
    const status = await m.updateListing(L.pricey, other, { title: "Hijacked title" });
    assert.equal(status.ok, false);
    assert.equal(m.operationStatus, "forbidden");
    assert.equal(m.retrieveListing(L.pricey)!.title, "Luxury two bedroom");
  });

  it("lets the owner edit", async () => {
    const m = new ListingManager();
    const status = await m.updateListing(L.pricey, host, { monthlyRent: 1500 });
    assert.ok(status.ok, status.problems.join("; "));
    assert.equal(m.retrieveListing(L.pricey)!.pricingData!.monthlyRent, 1500);
  });

  it("rejects a delete from someone else", () => {
    const m = new ListingManager();
    const status = m.deleteListing(L.cheap, renter);
    assert.equal(status.ok, false);
    assert.equal(m.operationStatus, "forbidden");
    assert.equal(m.retrieveListing(L.cheap)!.status, "active");
  });

  it("lets the owner delete, which hides it from browse", () => {
    const status = new ListingManager().deleteListing(L.cheap, host);
    assert.ok(status.ok);
    assert.ok(!ids({}).has(L.cheap));
  });

  it("reports not_found for a listing that doesn't exist", () => {
    const m = new ListingManager();
    assert.equal(m.deleteListing("lst_missing", host).ok, false);
    assert.equal(m.operationStatus, "not_found");
  });
});
