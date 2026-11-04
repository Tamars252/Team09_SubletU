/**
 * Listing detail view: the formatting behind the price, dates, room details
 * and host on the detail screen and the listing cards.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bathroomsLabel,
  bedroomsLabel,
  dateRange,
  distanceLabel,
  formatDay,
  hostRatingLabel,
  listingPath,
  money,
  sortedPhotos,
  stepPhoto,
} from "../src/lib/listing.ts";

// Syracuse's timezone, where midnight UTC is still the previous evening.
process.env.TZ = "America/New_York";

describe("availability dates", () => {
  it("shows the day the host entered, not the day before", () => {
    assert.equal(formatDay("2026-05-15"), "May 15, 2026");
    assert.equal(formatDay("2026-01-01"), "Jan 1, 2026");
  });

  it("writes the year once when both dates share it", () => {
    assert.equal(dateRange("2026-05-15", "2026-08-15"), "May 15 – Aug 15, 2026");
  });

  it("writes both years across a year boundary", () => {
    assert.equal(dateRange("2026-12-20", "2027-01-10"), "Dec 20, 2026 – Jan 10, 2027");
  });

  it("passes through a value that is not YYYY-MM-DD rather than inventing a date", () => {
    assert.equal(formatDay("summer"), "summer");
  });
});

describe("price and room details", () => {
  it("formats rent in whole dollars", () => {
    assert.equal(money(495), "$495");
    assert.equal(money(1240), "$1,240");
  });

  it("calls zero bedrooms a studio and pluralises the rest", () => {
    assert.equal(bedroomsLabel(0), "Studio");
    assert.equal(bedroomsLabel(1), "1 bedroom");
    assert.equal(bedroomsLabel(5), "5 bedrooms");
  });

  it("keeps half bathrooms", () => {
    assert.equal(bathroomsLabel(1), "1 bath");
    assert.equal(bathroomsLabel(1.5), "1.5 baths");
  });

  it("shows no distance for a listing that has not been geocoded", () => {
    assert.equal(distanceLabel(null, "Syracuse University"), null);
    assert.equal(distanceLabel(0.62, "Syracuse University"), "0.6 mi from Syracuse University");
  });
});

describe("host", () => {
  it("does not show a rating for a host with no reviews", () => {
    assert.equal(hostRatingLabel(0, 0), "No reviews yet");
    assert.equal(hostRatingLabel(4.9, 1), "4.9 from 1 review");
    assert.equal(hostRatingLabel(4.86, 12), "4.9 from 12 reviews");
  });
});

describe("photo gallery", () => {
  it("wraps from the last photo to the first and back", () => {
    assert.equal(stepPhoto(2, 1, 3), 0);
    assert.equal(stepPhoto(0, -1, 3), 2);
    assert.equal(stepPhoto(1, 1, 3), 2);
  });

  it("puts the host's first photo first, whatever order the array arrives in", () => {
    const photos = [{ sortOrder: 2, id: "c" }, { sortOrder: 0, id: "a" }, { sortOrder: 1, id: "b" }];
    assert.deepEqual(sortedPhotos(photos).map((p) => p.id), ["a", "b", "c"]);
    assert.equal(photos[0].id, "c", "the original array is left alone");
  });

  it("stays at 0 when there are no photos", () => {
    assert.equal(stepPhoto(0, 1, 0), 0);
  });
});

describe("listingPath", () => {
  it("escapes the id so it cannot change the route", () => {
    assert.equal(listingPath("lst_abc"), "/listings/lst_abc");
    assert.equal(listingPath("a/b?c"), "/listings/a%2Fb%3Fc");
  });
});
