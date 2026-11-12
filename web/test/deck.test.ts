/**
 * TM09-149 / TM09-158: the decisions behind the swipe deck and the Saved tab.
 *
 * The screens themselves are thin; what they decide lives in lib/deck.ts so it
 * can be tested here without a DOM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Listing } from "../src/api/types.ts";
import {
  REFILL_AT,
  SWIPE_THRESHOLD,
  availabilityLabel,
  coverPhoto,
  distanceLabel,
  dragRotation,
  emptyDeckState,
  mergeDeck,
  needsRefill,
  releaseDecision,
  rentLabel,
  roomLabel,
  stampOpacity,
  swipeDecision,
  withoutListing,
} from "../src/lib/deck.ts";

function listing(id: string, over: Partial<Listing> = {}): Listing {
  return {
    id,
    ownerId: "usr_host",
    title: `Listing ${id}`,
    address: "100 Default St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "Bright furnished room.",
    lat: 43.04,
    lng: -76.13,
    geocodeSource: "fallback",
    status: "active",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    photos: [],
    pricing: {
      monthlyRent: 825,
      availableFrom: "2027-01-01",
      availableTo: "2027-05-31",
      utilitiesIncluded: false,
      deposit: 0,
    },
    roomDetails: {
      bedrooms: 1,
      bathrooms: 1,
      maxRoommates: 1,
      petsAllowed: false,
      furnished: false,
      privateBath: false,
    },
    amenities: [],
    owner: null,
    distanceMiles: 0.6,
    ...over,
  };
}

describe("swipeDecision: a drag only counts past the threshold", () => {
  const W = 343; // the card on a 375px-wide phone (16px gutters)

  it("right past the threshold saves, left past it passes", () => {
    assert.equal(swipeDecision(W * SWIPE_THRESHOLD, W), "right");
    assert.equal(swipeDecision(-W * SWIPE_THRESHOLD, W), "left");
  });

  it("a short drag either way snaps back", () => {
    assert.equal(swipeDecision(W * SWIPE_THRESHOLD - 1, W), null);
    assert.equal(swipeDecision(-(W * SWIPE_THRESHOLD - 1), W), null);
    assert.equal(swipeDecision(0, W), null);
  });

  it("an unmeasured card or a bad number is never a decision", () => {
    assert.equal(swipeDecision(500, 0), null);
    assert.equal(swipeDecision(Number.NaN, W), null);
  });
});

describe("releaseDecision: a pointer cancel is never a decision (TM09-131)", () => {
  it("pointerup past the threshold decides", () => {
    assert.equal(releaseDecision("pointerup", 200, 343), "right");
  });

  it("pointercancel does not, even at a far-left clientX (Chrome reports 0)", () => {
    assert.equal(releaseDecision("pointercancel", -400, 343), null);
    assert.equal(releaseDecision("pointercancel", 400, 343), null);
  });
});

describe("drag feedback", () => {
  it("tilts toward the drag, capped at 12 degrees", () => {
    assert.ok(dragRotation(50, 343) > 0);
    assert.ok(dragRotation(-50, 343) < 0);
    assert.equal(dragRotation(5000, 343), 12);
    assert.equal(dragRotation(-5000, 343), -12);
    assert.equal(dragRotation(50, 0), 0);
  });

  it("the stamp is fully shown at the threshold", () => {
    assert.equal(stampOpacity(343 * SWIPE_THRESHOLD, 343), 1);
    assert.ok(stampOpacity(20, 343) < 1);
  });
});

describe("deck queue", () => {
  it("withoutListing drops one card and keeps the order", () => {
    const deck = [listing("a"), listing("b"), listing("c")];
    assert.deepEqual(withoutListing(deck, "b").map((l) => l.id), ["a", "c"]);
  });

  it("mergeDeck skips cards already queued or with a swipe in flight", () => {
    const merged = mergeDeck([listing("a")], [listing("a"), listing("b"), listing("c")], new Set(["c"]));
    assert.deepEqual(merged.map((l) => l.id), ["a", "b"]);
  });

  it("refills when the queue is low and the server has more", () => {
    assert.equal(needsRefill(REFILL_AT, 10), true);
    assert.equal(needsRefill(REFILL_AT + 1, 10), false);
    assert.equal(needsRefill(2, 2), false); // everything left is already queued
  });
});

describe("TM09-158 AC2: the empty deck always offers Reset browsing", () => {
  it("with no filters it explains why and offers no Clear filters", () => {
    const state = emptyDeckState(0);
    assert.match(state.title, /seen every listing/);
    assert.equal(state.showClear, false);
  });

  it("with filters on it also offers Clear filters", () => {
    const state = emptyDeckState(2);
    assert.match(state.title, /match/);
    assert.equal(state.showClear, true);
  });

  it("tells the renter that resetting keeps their saves", () => {
    assert.match(emptyDeckState(0).body, /saved listings stay saved/);
  });
});

describe("card labels", () => {
  it("rent", () => {
    assert.equal(rentLabel(listing("a")), "$825");
    assert.equal(rentLabel(listing("a", { pricing: { ...listing("a").pricing!, monthlyRent: 1250 } })), "$1,250");
    assert.equal(rentLabel(listing("a", { pricing: null })), "Price on request");
  });

  it("availability reads dates as calendar days, not UTC instants", () => {
    assert.equal(availabilityLabel(listing("a")), "Jan 1 – May 31, 2027");
    const spansYears = listing("a", {
      pricing: { ...listing("a").pricing!, availableFrom: "2026-12-15", availableTo: "2027-05-31" },
    });
    assert.equal(availabilityLabel(spansYears), "Dec 15, 2026 – May 31, 2027");
    assert.equal(availabilityLabel(listing("a", { pricing: null })), "");
  });

  it("rooms, distance and cover photo", () => {
    assert.equal(roomLabel(listing("a")), "1 bd · 1 ba");
    assert.equal(
      roomLabel(listing("a", { roomDetails: { ...listing("a").roomDetails!, bedrooms: 0 } })),
      "Studio · 1 ba",
    );
    assert.equal(distanceLabel(listing("a")), "0.6 mi from campus");
    assert.equal(distanceLabel(listing("a", { distanceMiles: null })), "");
    const photos = [
      { photoId: "p2", fileUrl: "/uploads/b.jpg", fileSize: 1, uploadTimestamp: "", sortOrder: 1 },
      { photoId: "p1", fileUrl: "/uploads/a.jpg", fileSize: 1, uploadTimestamp: "", sortOrder: 0 },
    ];
    assert.equal(coverPhoto(listing("a", { photos })), "/uploads/a.jpg");
    assert.equal(coverPhoto(listing("a")), null);
  });
});
