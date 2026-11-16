/**
 * TM09-98: Post a listing with photo compression.
 *
 *   AC1  The form validates like ListingManager (validateDraft).
 *   AC2  Photos are downscaled to a 1600px long edge before upload.
 *   AC3  The pin is placed from the typed address.
 *
 * The server-side half of AC1 (that a draft passing here is accepted by
 * POST /api/listings, and one failing here is refused) is in
 * server/test/routes/postListingParity.test.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_DRAFT,
  MAX_LONG_EDGE,
  MAX_PHOTOS,
  addressQuery,
  dataUrlBytes,
  draftToBody,
  isCalendarDate,
  pinEmbedUrl,
  scaleToLongEdge,
  validateDraft,
} from "../src/lib/postListing.ts";
import type { ListingDraft } from "../src/lib/postListing.ts";

export const VALID: ListingDraft = {
  ...EMPTY_DRAFT,
  title: "Sunny room on Ackerman",
  address: "910 Ackerman Ave",
  zip: "13210",
  description: "Bright furnished room two blocks from the quad, shared kitchen.",
  monthlyRent: "575",
  deposit: "575",
  availableFrom: "2027-05-15",
  availableTo: "2027-08-15",
  bedrooms: "1",
  bathrooms: "1",
  maxRoommates: "2",
};

const fieldsWithErrors = (d: Partial<ListingDraft>, photos = 0) =>
  Object.keys(validateDraft({ ...VALID, ...d }, photos)).sort();

describe("AC1: validateDraft mirrors ListingManager's rules", () => {
  it("a complete draft has no problems", () => {
    assert.deepEqual(validateDraft(VALID), {});
  });

  it("the empty form flags every required field at once", () => {
    assert.deepEqual(Object.keys(validateDraft(EMPTY_DRAFT)).sort(), [
      "address",
      "availableFrom",
      "availableTo",
      "description",
      "monthlyRent",
      "title",
    ]);
  });

  it("title: 4 to 120 characters, ignoring surrounding spaces", () => {
    assert.deepEqual(fieldsWithErrors({ title: "  Abc  " }), ["title"]);
    assert.deepEqual(fieldsWithErrors({ title: "Abcd" }), []);
    assert.deepEqual(fieldsWithErrors({ title: "x".repeat(121) }), ["title"]);
  });

  it("address, city and a 2-letter state", () => {
    assert.deepEqual(fieldsWithErrors({ address: "1 A" }), ["address"]);
    assert.deepEqual(fieldsWithErrors({ city: " " }), ["city"]);
    assert.deepEqual(fieldsWithErrors({ state: "New York" }), ["state"]);
    assert.deepEqual(fieldsWithErrors({ state: "ny" }), []);
  });

  it("description: at least 20 characters", () => {
    const errors = validateDraft({ ...VALID, description: "Nice room." });
    assert.match(errors.description ?? "", /at least 20 characters/);
  });

  it("rent: above $0 and at most $20,000 (PricingData)", () => {
    assert.deepEqual(fieldsWithErrors({ monthlyRent: "0" }), ["monthlyRent"]);
    assert.deepEqual(fieldsWithErrors({ monthlyRent: "abc" }), ["monthlyRent"]);
    assert.deepEqual(fieldsWithErrors({ monthlyRent: "20001" }), ["monthlyRent"]);
    assert.deepEqual(fieldsWithErrors({ monthlyRent: "20000" }), []);
  });

  it("deposit: optional, never negative, at most $20,000 (PricingData)", () => {
    assert.deepEqual(fieldsWithErrors({ deposit: "" }), []);
    assert.deepEqual(fieldsWithErrors({ deposit: "0" }), []);
    assert.deepEqual(fieldsWithErrors({ deposit: "-1" }), ["deposit"]);
    assert.deepEqual(fieldsWithErrors({ deposit: "20000" }), []);
    assert.deepEqual(fieldsWithErrors({ deposit: "20001" }), ["deposit"]);
    assert.equal(
      validateDraft({ ...VALID, deposit: "20001" }).deposit,
      "Deposit looks unrealistic (over $20,000)",
    );
  });

  it("dates: real calendar days, and the window must end after it starts", () => {
    assert.deepEqual(fieldsWithErrors({ availableFrom: "2027-02-31" }), ["availableFrom"]);
    assert.deepEqual(fieldsWithErrors({ availableTo: "2027-05-15" }), ["availableTo"]);
    assert.match(
      validateDraft({ ...VALID, availableTo: "2027-05-01" }).availableTo ?? "",
      /after available-from/,
    );
  });

  it("room details: whole bedrooms 0-12, bathrooms 0.5-12, roommates 0-20 (RoomDetails)", () => {
    assert.deepEqual(fieldsWithErrors({ bedrooms: "1.5" }), ["bedrooms"]);
    assert.deepEqual(fieldsWithErrors({ bedrooms: "0" }), []);
    assert.deepEqual(fieldsWithErrors({ bathrooms: "0" }), ["bathrooms"]);
    assert.deepEqual(fieldsWithErrors({ bathrooms: "1.5" }), []);
    assert.deepEqual(fieldsWithErrors({ maxRoommates: "21" }), ["maxRoommates"]);
  });

  it("photos: at most 10 (MAX_PHOTOS_PER_LISTING)", () => {
    assert.deepEqual(fieldsWithErrors({}, MAX_PHOTOS), []);
    assert.deepEqual(fieldsWithErrors({}, MAX_PHOTOS + 1), ["photos"]);
  });

  it("isCalendarDate rejects rollover dates and other formats", () => {
    assert.equal(isCalendarDate("2028-02-29"), true);
    assert.equal(isCalendarDate("2027-02-29"), false);
    assert.equal(isCalendarDate("05/15/2027"), false);
  });

  it("draftToBody sends the flat shape routes/listings.ts reads, with numbers", () => {
    const body = draftToBody({ ...VALID, state: "ny", deposit: "" }, ["data:image/jpeg;base64,AAAA"]);
    assert.equal(body.monthlyRent, 575);
    assert.equal(body.bedrooms, 1);
    assert.equal(body.deposit, 0);
    assert.equal(body.state, "NY");
    assert.deepEqual(body.photos, ["data:image/jpeg;base64,AAAA"]);
    assert.equal("lat" in body || "lng" in body, false, "the client never sends coordinates");
  });
});

describe("AC2: photos are downscaled to a 1600px long edge", () => {
  it("caps the long edge at 1600 and keeps the aspect ratio", () => {
    assert.deepEqual(scaleToLongEdge(4032, 3024), { width: 1600, height: 1200, scaled: true });
    assert.deepEqual(scaleToLongEdge(3024, 4032), { width: 1200, height: 1600, scaled: true });
    assert.equal(MAX_LONG_EDGE, 1600);
  });

  it("never upscales a photo that is already small enough", () => {
    assert.deepEqual(scaleToLongEdge(1600, 900), { width: 1600, height: 900, scaled: false });
    assert.deepEqual(scaleToLongEdge(800, 600), { width: 800, height: 600, scaled: false });
  });

  it("handles extreme panoramas without collapsing to 0px", () => {
    const pano = scaleToLongEdge(20000, 10);
    assert.equal(pano.width, 1600);
    assert.equal(pano.height, 1);
  });

  it("dataUrlBytes measures the decoded payload", () => {
    const bytes = Buffer.from("hello world");
    assert.equal(dataUrlBytes(`data:image/jpeg;base64,${bytes.toString("base64")}`), bytes.length);
  });
});

describe("AC3: the pin comes from the typed address", () => {
  it("asks the geocoder for the same address string the server uses", () => {
    assert.equal(addressQuery({ address: " 910 Ackerman Ave ", city: "Syracuse", state: "ny" }), "910 Ackerman Ave, Syracuse, NY");
  });

  it("builds an OpenStreetMap embed with a marker at the pin, no API key", () => {
    const url = new URL(pinEmbedUrl(43.0412, -76.1225));
    assert.equal(url.hostname, "www.openstreetmap.org");
    assert.equal(url.searchParams.get("marker"), "43.041200,-76.122500");
    const [minLng, minLat, maxLng, maxLat] = url.searchParams.get("bbox")!.split(",").map(Number);
    assert.ok(minLat < 43.0412 && maxLat > 43.0412 && minLng < -76.1225 && maxLng > -76.1225);
    assert.equal(url.search.includes("key"), false);
  });
});
