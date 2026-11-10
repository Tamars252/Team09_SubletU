/**
 * TM09-111: ListingData with sort and filter.
 *
 * One block per acceptance criterion:
 *   1. validateData() calls each composed object's validateData().
 *   2. sortData() and filterData() are implemented.
 *   3. The availability filter is an overlap test.
 *
 * These drive ListingData directly. The ListingManager tests (TM09-130) cover
 * the same filters through the manager; this file pins down the class-diagram
 * contract itself, including the edge cases the manager tests don't reach.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";
import { ListingData } from "../../src/domain/ListingData.ts";
import type { ListingFields, ListingFilter } from "../../src/domain/ListingData.ts";
import { PhotoData } from "../../src/domain/PhotoData.ts";
import { PricingData } from "../../src/domain/PricingData.ts";
import { RoomDetails } from "../../src/domain/RoomDetails.ts";

function addUser(name: string): string {
  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at)
     VALUES (?, ?, ?, 'x', ?)`,
  ).run(id, `${id}@syr.edu`, name, nowIso());
  return id;
}

type Over = Partial<Omit<ListingFields, "pricingData" | "roomDetails">> & {
  rent?: number;
  from?: string;
  to?: string;
  pricing?: PricingData | null;
  room?: RoomDetails | null;
};

/** A valid listing in memory. Nothing touches the database until storeData(). */
function make(ownerId: string, over: Over = {}): ListingData {
  const listingId = over.listingId ?? newId("lst");
  const now = nowIso();
  const pricing =
    over.pricing !== undefined
      ? over.pricing
      : new PricingData({
          listingId,
          monthlyRent: over.rent ?? 800,
          availableFrom: over.from ?? "2027-01-01",
          availableTo: over.to ?? "2027-05-31",
          utilitiesIncluded: false,
          deposit: 0,
        });
  const room =
    over.room !== undefined
      ? over.room
      : new RoomDetails({
          listingId,
          bedrooms: 1,
          bathrooms: 1,
          maxRoommates: 1,
          petsAllowed: false,
          furnished: false,
          privateBath: false,
        });
  return new ListingData({
    listingId,
    ownerId,
    title: "Sunny room near campus",
    address: "100 Default St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "Bright furnished room, five minutes from the quad.",
    lat: 43.039,
    lng: -76.135,
    geocodeSource: "fallback",
    status: "active",
    createdAt: now,
    updatedAt: now,
    photoData: [],
    amenities: [],
    ...over,
    pricingData: pricing,
    roomDetails: room,
  });
}

/** Wraps an object's validateData() so the test can see it was called. */
function spyOn<T extends { validateData(): string[] }>(target: T, problem?: string): { calls: number } {
  const seen = { calls: 0 };
  const original = target.validateData.bind(target);
  target.validateData = () => {
    seen.calls += 1;
    return problem ? [...original(), problem] : original();
  };
  return seen;
}

/* ------------------------------------------------------------------- AC1 */

describe("AC1: validateData() cascades into every composed object", () => {
  let owner: string;
  before(() => {
    owner = addUser("Cascade Owner");
  });

  it("calls PricingData, RoomDetails and every PhotoData exactly once", () => {
    const listing = make(owner);
    listing.photoData = ["a", "b"].map(
      (name, sortOrder) =>
        new PhotoData({
          photoId: newId("pho"),
          listingId: listing.listingId,
          fileUrl: `https://example.com/${name}.jpg`,
          fileSize: 0,
          uploadTimestamp: nowIso(),
          sortOrder,
        }),
    );
    const pricing = spyOn(listing.pricingData!);
    const room = spyOn(listing.roomDetails!);
    const photos = listing.photoData.map((p) => spyOn(p));

    listing.validateData();

    assert.equal(pricing.calls, 1);
    assert.equal(room.calls, 1);
    assert.deepEqual(
      photos.map((p) => p.calls),
      [1, 1],
    );
  });

  it("returns the composed objects' problems alongside its own", () => {
    const listing = make(owner, { title: "x" });
    spyOn(listing.pricingData!, "pricing says no");
    spyOn(listing.roomDetails!, "room says no");

    const problems = listing.validateData();

    assert.ok(problems.includes("Title must be at least 4 characters"));
    assert.ok(problems.includes("pricing says no"));
    assert.ok(problems.includes("room says no"));
  });

  it("surfaces a real PricingData rule (end before start) through the listing", () => {
    const problems = make(owner, { from: "2027-05-01", to: "2027-04-01" }).validateData();
    assert.ok(problems.includes("Available-to must be after available-from"));
  });

  it("surfaces a real RoomDetails rule (fractional bedrooms) through the listing", () => {
    const listing = make(owner);
    listing.roomDetails!.bedrooms = 1.5;
    assert.ok(listing.validateData().includes("Bedrooms must be a whole number between 0 and 12"));
  });

  it("reports missing pricing and room details instead of skipping them", () => {
    const problems = make(owner, { pricing: null, room: null }).validateData();
    assert.ok(problems.includes("Pricing is required"));
    assert.ok(problems.includes("Room details are required"));
  });

  it("a valid listing has no problems, and storeData() refuses an invalid one", () => {
    assert.deepEqual(make(owner).validateData(), []);
    assert.throws(() => make(owner, { rent: 0 }).storeData(), /Monthly rent must be greater than \$0/);
  });
});

/* ------------------------------------------------------------------- AC2 */

describe("AC2: sortData() orders listings for every documented sort", () => {
  const owner = "usr_sort_only"; // sortData is pure, nothing is stored

  const a = make(owner, { listingId: "a", rent: 900, from: "2027-03-01", createdAt: "2026-11-01T00:00:00Z" });
  const b = make(owner, { listingId: "b", rent: 500, from: "2027-01-15", createdAt: "2026-11-03T00:00:00Z" });
  const c = make(owner, { listingId: "c", rent: 700, from: "2027-02-01", createdAt: "2026-11-02T00:00:00Z" });
  a.distanceMiles = 2.5;
  b.distanceMiles = 0.4;
  c.distanceMiles = null; // no coordinates
  const all = [a, b, c];
  const order = (list: ListingData[]) => list.map((l) => l.listingId);

  it("newest puts the most recently created first (and is the default)", () => {
    assert.deepEqual(order(ListingData.sortData(all, "newest")), ["b", "c", "a"]);
    assert.deepEqual(order(ListingData.sortData(all, "bogus" as never)), ["b", "c", "a"]);
  });

  it("price_asc and price_desc order by monthly rent", () => {
    assert.deepEqual(order(ListingData.sortData(all, "price_asc")), ["b", "c", "a"]);
    assert.deepEqual(order(ListingData.sortData(all, "price_desc")), ["a", "c", "b"]);
  });

  it("distance puts the closest first and listings without coordinates last", () => {
    assert.deepEqual(order(ListingData.sortData(all, "distance")), ["b", "a", "c"]);
  });

  it("available_soonest orders by move-in date", () => {
    assert.deepEqual(order(ListingData.sortData(all, "available_soonest")), ["b", "c", "a"]);
  });

  it("listings without pricing go last in both price orders", () => {
    const unpriced = make(owner, { listingId: "u", pricing: null });
    const list = [unpriced, ...all];
    assert.equal(ListingData.sortData(list, "price_asc").at(-1)!.listingId, "u");
    assert.equal(ListingData.sortData(list, "price_desc").at(-1)!.listingId, "u");
    assert.equal(ListingData.sortData(list, "available_soonest").at(-1)!.listingId, "u");
  });

  it("returns a new array and leaves the input order alone", () => {
    const input = [...all];
    const sorted = ListingData.sortData(input, "price_asc");
    assert.notEqual(sorted, input);
    assert.deepEqual(order(input), ["a", "b", "c"]);
  });
});

describe("AC2: filterData() reads stored listings back as ListingData", () => {
  let owner: string;
  let kept: ListingData;
  let paused: ListingData;

  before(() => {
    owner = addUser("Filter Owner");
    kept = make(owner, { title: "Filter fixture: Ostrom loft", rent: 640 });
    kept.amenities = ["Laundry"];
    kept.storeData();
    paused = make(owner, { title: "Filter fixture: paused room", status: "paused" });
    paused.storeData();
  });

  const titles = (filter: ListingFilter) =>
    ListingData.filterData({ ownerId: owner, ...filter }).map((l) => l.title);

  it("hydrates the composed objects", () => {
    const [found] = ListingData.filterData({ ownerId: owner, q: "Ostrom" });
    assert.ok(found instanceof ListingData);
    assert.ok(found.pricingData instanceof PricingData);
    assert.ok(found.roomDetails instanceof RoomDetails);
    assert.equal(found.pricingData!.monthlyRent, 640);
    assert.deepEqual(found.amenities, ["Laundry"]);
    assert.equal(found.owner?.name, "Filter Owner");
  });

  it("only returns active listings unless a status is asked for", () => {
    assert.deepEqual(titles({}), ["Filter fixture: Ostrom loft"]);
    assert.deepEqual(titles({ status: "paused" }), ["Filter fixture: paused room"]);
  });

  it("combines filters with AND", () => {
    assert.equal(titles({ q: "Ostrom", maxPrice: 600 }).length, 0);
    assert.equal(titles({ q: "Ostrom", maxPrice: 700 }).length, 1);
  });
});

/* ------------------------------------------------------------------- AC3 */

describe("AC3: the availability filter is an overlap test", () => {
  // The stored listing is available Feb 1 – Apr 30, 2027.
  let owner: string;
  before(() => {
    owner = addUser("Window Owner");
    make(owner, { title: "Window fixture", from: "2027-02-01", to: "2027-04-30" }).storeData();
  });

  const matches = (availableFrom?: string, availableTo?: string) =>
    ListingData.filterData({ ownerId: owner, availableFrom, availableTo }).length === 1;

  it("matches a request that starts before and ends inside the window", () => {
    assert.ok(matches("2027-01-01", "2027-02-15"));
  });

  it("matches a request that starts inside and ends after the window", () => {
    assert.ok(matches("2027-04-01", "2027-06-30"));
  });

  it("matches a request inside the window, and one that contains it", () => {
    assert.ok(matches("2027-03-01", "2027-03-15"));
    assert.ok(matches("2027-01-01", "2027-12-31"));
  });

  it("counts a shared boundary day as overlap", () => {
    assert.ok(matches("2027-04-30", "2027-05-31"));
    assert.ok(matches("2027-01-01", "2027-02-01"));
  });

  it("rejects a request entirely before or entirely after the window", () => {
    assert.ok(!matches("2026-12-01", "2027-01-31"));
    assert.ok(!matches("2027-05-01", "2027-08-31"));
  });

  it("an open-ended request only checks the bound it was given", () => {
    assert.ok(matches("2027-04-30", undefined));
    assert.ok(!matches("2027-05-01", undefined));
    assert.ok(matches(undefined, "2027-02-01"));
    assert.ok(!matches(undefined, "2027-01-31"));
  });

  it("is not a containment test: a partial overlap is enough", () => {
    // A containment test ("listing covers the whole request") would reject this.
    assert.ok(matches("2027-04-15", "2027-07-15"));
  });
});
