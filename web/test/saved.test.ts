/**
 * TM09-101: the Saved screen's logic, tested without a DOM.
 *
 * There is no DOM testing library in this repo by design, so the screen's
 * decisions live in web/src/lib/saved.ts and are exercised here directly:
 *   AC2  newest save first, photo/rent/location/date fallbacks
 *   AC3  optimistic removal and rollback
 *   AC8  unavailable listings are marked, not crashed on
 *   AC9  the detail path the card links to
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginRemove,
  formatAvailability,
  formatDay,
  formatLocation,
  formatRent,
  hasRent,
  isUnavailable,
  listingDetailPath,
  primaryPhotoUrl,
  rollbackRemove,
  savedAtTime,
  sortBySavedAt,
  unavailableLabel,
} from "../src/lib/saved.ts";
import type { Listing, Photo } from "../src/api/types.ts";

/** A listing with only the fields these helpers read; the rest is filler. */
function listing(over: Partial<Listing> & { id: string }): Listing {
  return {
    ownerId: "usr_host",
    title: "Sunny room near campus",
    address: "123 Marshall St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "",
    lat: null,
    lng: null,
    geocodeSource: "pending",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    photos: [],
    pricing: {
      monthlyRent: 795,
      availableFrom: "2026-05-15",
      availableTo: "2026-08-15",
      utilitiesIncluded: true,
      deposit: 795,
    },
    roomDetails: null,
    amenities: [],
    owner: null,
    distanceMiles: null,
    ...over,
  };
}

function photo(over: Partial<Photo> & { photoId: string }): Photo {
  return {
    fileUrl: `/uploads/${over.photoId}.jpg`,
    fileSize: 1024,
    uploadTimestamp: "2026-10-01T00:00:00.000Z",
    sortOrder: 0,
    ...over,
  };
}

const ids = (list: readonly Listing[]) => list.map((l) => l.id);

/* -------------------------------------------------------------- AC2 order */

describe("sortBySavedAt: newest save first", () => {
  it("orders by savedAt descending, whatever order the API sent", () => {
    const sorted = sortBySavedAt([
      listing({ id: "b", savedAt: "2026-11-02T12:00:00.000Z" }),
      listing({ id: "c", savedAt: "2026-11-03T12:00:00.000Z" }),
      listing({ id: "a", savedAt: "2026-11-01T12:00:00.000Z" }),
    ]);
    assert.deepEqual(ids(sorted), ["c", "b", "a"]);
  });

  it("does not mutate the list it is given", () => {
    const input = [
      listing({ id: "a", savedAt: "2026-11-01T12:00:00.000Z" }),
      listing({ id: "b", savedAt: "2026-11-02T12:00:00.000Z" }),
    ];
    sortBySavedAt(input);
    assert.deepEqual(ids(input), ["a", "b"]);
  });

  it("puts entries with no savedAt last, in arrival order", () => {
    const sorted = sortBySavedAt([
      listing({ id: "no-field" }),
      listing({ id: "dated", savedAt: "2026-11-01T12:00:00.000Z" }),
      listing({ id: "unparseable", savedAt: "not a date" }),
    ]);
    assert.deepEqual(ids(sorted), ["dated", "no-field", "unparseable"]);
  });

  it("is stable when two saves share a timestamp", () => {
    const same = "2026-11-02T12:00:00.000Z";
    const sorted = sortBySavedAt([
      listing({ id: "first", savedAt: same }),
      listing({ id: "second", savedAt: same }),
      listing({ id: "third", savedAt: same }),
    ]);
    assert.deepEqual(ids(sorted), ["first", "second", "third"]);
  });

  it("handles the empty list", () => {
    assert.deepEqual(sortBySavedAt([]), []);
  });

  it("reads savedAt as a timestamp, or null when it cannot", () => {
    assert.equal(
      savedAtTime(listing({ id: "a", savedAt: "2026-11-01T12:00:00.000Z" })),
      Date.parse("2026-11-01T12:00:00.000Z"),
    );
    assert.equal(savedAtTime(listing({ id: "a" })), null);
    assert.equal(savedAtTime(listing({ id: "a", savedAt: "" })), null);
    assert.equal(savedAtTime(listing({ id: "a", savedAt: "whenever" })), null);
  });
});

/* ------------------------------------------------- AC3 optimistic removal */

describe("beginRemove / rollbackRemove: optimistic unsave", () => {
  const list = [listing({ id: "a" }), listing({ id: "b" }), listing({ id: "c" })];

  it("takes the card out straight away and remembers where it was", () => {
    const removal = beginRemove(list, "b");
    assert.ok(removal);
    assert.deepEqual(ids(removal.next), ["a", "c"]);
    assert.equal(removal.removed.id, "b");
    assert.equal(removal.index, 1);
  });

  it("leaves the original list alone", () => {
    beginRemove(list, "b");
    assert.deepEqual(ids(list), ["a", "b", "c"]);
  });

  it("returns null for an id that is not in the list, so no DELETE is sent", () => {
    assert.equal(beginRemove(list, "nope"), null);
    assert.equal(beginRemove([], "a"), null);
  });

  it("puts the card back in its old position when the DELETE fails", () => {
    const removal = beginRemove(list, "b");
    assert.ok(removal);
    assert.deepEqual(ids(rollbackRemove(removal.next, removal)), ["a", "b", "c"]);
  });

  it("restores a first and a last card to the right end", () => {
    const first = beginRemove(list, "a");
    const last = beginRemove(list, "c");
    assert.ok(first && last);
    assert.deepEqual(ids(rollbackRemove(first.next, first)), ["a", "b", "c"]);
    assert.deepEqual(ids(rollbackRemove(last.next, last)), ["a", "b", "c"]);
  });

  it("does not duplicate the card if a reload already put it back", () => {
    const removal = beginRemove(list, "b");
    assert.ok(removal);
    const reloaded = [listing({ id: "a" }), listing({ id: "b" }), listing({ id: "c" })];
    assert.deepEqual(ids(rollbackRemove(reloaded, removal)), ["a", "b", "c"]);
  });

  it("rolls back into a list that emptied out meanwhile", () => {
    const removal = beginRemove(list, "c");
    assert.ok(removal);
    assert.deepEqual(ids(rollbackRemove([], removal)), ["c"]);
  });

  it("two unsaves in a row each remove exactly one card", () => {
    const first = beginRemove(list, "a");
    assert.ok(first);
    const second = beginRemove(first.next, "c");
    assert.ok(second);
    assert.deepEqual(ids(second.next), ["b"]);
  });
});

/* ------------------------------------------------------- AC8 availability */

describe("availability", () => {
  it("treats only an active listing as available", () => {
    assert.equal(isUnavailable(listing({ id: "a", status: "active" })), false);
    assert.equal(isUnavailable(listing({ id: "a", status: "pending" })), true);
    assert.equal(isUnavailable(listing({ id: "a", status: "inactive" })), true);
  });

  it("labels a pending listing apart from an otherwise unavailable one", () => {
    assert.equal(unavailableLabel(listing({ id: "a", status: "active" })), null);
    assert.equal(unavailableLabel(listing({ id: "a", status: "pending" })), "Pending");
    assert.equal(unavailableLabel(listing({ id: "a", status: "inactive" })), "Unavailable");
  });
});

/* -------------------------------------------------------- AC2 card fields */

describe("card fields", () => {
  it("picks the lowest sortOrder photo, not the first in the array", () => {
    const l = listing({
      id: "a",
      photos: [
        photo({ photoId: "second", sortOrder: 2 }),
        photo({ photoId: "cover", sortOrder: 0 }),
        photo({ photoId: "third", sortOrder: 1 }),
      ],
    });
    assert.equal(primaryPhotoUrl(l), "/uploads/cover.jpg");
  });

  it("returns null when there is no photo, so the card falls back to the gradient", () => {
    assert.equal(primaryPhotoUrl(listing({ id: "a", photos: [] })), null);
    assert.equal(
      primaryPhotoUrl(listing({ id: "a", photos: [photo({ photoId: "x", fileUrl: "" })] })),
      null,
    );
  });

  it("formats rent, and says so when pricing is missing", () => {
    assert.equal(formatRent(listing({ id: "a" })), "$795");
    assert.equal(formatRent(listing({ id: "a", pricing: null })), "Rent not listed");
  });

  it("knows whether a /mo suffix would make sense", () => {
    assert.equal(hasRent(listing({ id: "a" })), true);
    assert.equal(hasRent(listing({ id: "a", pricing: null })), false);
  });

  it("groups the thousands in a high rent", () => {
    const l = listing({ id: "a" });
    assert.equal(formatRent({ ...l, pricing: { ...l.pricing!, monthlyRent: 1250 } }), "$1,250");
  });

  it("joins address and city, skipping a missing half", () => {
    assert.equal(formatLocation(listing({ id: "a" })), "123 Marshall St, Syracuse");
    assert.equal(formatLocation(listing({ id: "a", address: "" })), "Syracuse");
    assert.equal(formatLocation(listing({ id: "a", address: "", city: "" })), "");
  });

  it("formats a plain ISO day without going through a timezone", () => {
    // new Date("2026-05-15") is midnight UTC; anywhere behind UTC that renders
    // as the 14th. Reading the string keeps this test honest on any machine.
    assert.equal(formatDay("2026-05-15"), "May 15, 2026");
    assert.equal(formatDay("2026-01-01"), "Jan 1, 2026");
    assert.equal(formatDay("2026-12-31T00:00:00.000Z"), "Dec 31, 2026");
    assert.equal(formatDay(""), null);
    assert.equal(formatDay(undefined), null);
    assert.equal(formatDay("15/05/2026"), null);
    assert.equal(formatDay("2026-13-01"), null);
  });

  it("formats the availability window, and copes with one or no end", () => {
    const l = listing({ id: "a" });
    assert.equal(formatAvailability(l), "May 15, 2026 – Aug 15, 2026");
    assert.equal(
      formatAvailability({ ...l, pricing: { ...l.pricing!, availableTo: "" } }),
      "From May 15, 2026",
    );
    assert.equal(
      formatAvailability({ ...l, pricing: { ...l.pricing!, availableFrom: "" } }),
      "Until Aug 15, 2026",
    );
    assert.equal(formatAvailability({ ...l, pricing: null }), "Dates not listed");
  });
});

/* --------------------------------------------------------- AC9 detail link */

describe("listingDetailPath", () => {
  it("matches the GET /listings/:id pattern in docs/api-contract.md", () => {
    assert.equal(listingDetailPath("lst_abc123"), "/listings/lst_abc123");
  });
});
