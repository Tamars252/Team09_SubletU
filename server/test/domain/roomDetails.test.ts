import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeRoomDetails } from "../helpers/factories.ts";

describe("RoomDetails.validateData", () => {
  it("accepts a normal 2-bed, 1-bath unit", () => {
    assert.deepEqual(makeRoomDetails().validateData(), []);
  });

  it("allows a studio (zero bedrooms)", () => {
    assert.deepEqual(makeRoomDetails({ bedrooms: 0 }).validateData(), []);
  });

  it("rejects fractional bedrooms", () => {
    const problems = makeRoomDetails({ bedrooms: 1.5 }).validateData();
    assert.ok(problems.some((p) => p.includes("Bedrooms must be a whole number")));
  });

  it("rejects negative bedrooms and more than 12", () => {
    assert.ok(makeRoomDetails({ bedrooms: -1 }).validateData().length > 0);
    assert.ok(makeRoomDetails({ bedrooms: 13 }).validateData().length > 0);
    assert.deepEqual(makeRoomDetails({ bedrooms: 12 }).validateData(), []);
  });

  it("allows half baths", () => {
    assert.deepEqual(makeRoomDetails({ bathrooms: 1.5 }).validateData(), []);
  });

  it("rejects zero bathrooms", () => {
    const problems = makeRoomDetails({ bathrooms: 0 }).validateData();
    assert.ok(problems.some((p) => p.includes("Bathrooms must be")));
  });

  it("rejects fractional roommate counts", () => {
    const problems = makeRoomDetails({ maxRoommates: 2.5 }).validateData();
    assert.ok(problems.some((p) => p.includes("Max roommates must be a whole number")));
  });

  it("allows living alone and caps the roommate count at 20", () => {
    assert.deepEqual(makeRoomDetails({ maxRoommates: 0 }).validateData(), []);
    assert.deepEqual(makeRoomDetails({ maxRoommates: 20 }).validateData(), []);
    assert.ok(makeRoomDetails({ maxRoommates: 21 }).validateData().length > 0);
  });

  it("treats the boolean amenities as free-form", () => {
    // pets / furnished / privateBath carry no validation rules; any combination
    // is a legitimate listing.
    assert.deepEqual(
      makeRoomDetails({ petsAllowed: true, furnished: false, privateBath: true }).validateData(),
      [],
    );
  });
});
