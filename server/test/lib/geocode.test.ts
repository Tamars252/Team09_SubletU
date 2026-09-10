import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAMPUS_ANCHORS, haversineMiles } from "../../src/lib/geocode.ts";

/**
 * The distance math behind "0.4 mi to campus" and the radius filter. Pure
 * function, no network — the Nominatim calls around it are deliberately not
 * exercised here (see the note in test/README).
 */
describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    assert.equal(haversineMiles(43.0392, -76.1351, 43.0392, -76.1351), 0);
  });

  it("matches the known length of one degree of latitude", () => {
    // One degree of latitude is ~69.1 miles anywhere on the globe.
    assert.ok(Math.abs(haversineMiles(0, 0, 1, 0) - 69.09) < 0.05);
    assert.ok(Math.abs(haversineMiles(43, -76, 44, -76) - 69.09) < 0.05);
  });

  it("is symmetric", () => {
    const there = haversineMiles(43.0392, -76.1351, 42.4534, -76.4735);
    const back = haversineMiles(42.4534, -76.4735, 43.0392, -76.1351);
    assert.ok(Math.abs(there - back) < 1e-9);
  });

  it("shrinks a degree of longitude as latitude increases", () => {
    const atEquator = haversineMiles(0, 0, 0, 1);
    const atSyracuse = haversineMiles(43, 0, 43, 1);
    assert.ok(atSyracuse < atEquator);
  });

  it("gets the Syracuse-to-Cornell distance about right", () => {
    // ~44 miles as the crow flies between the two campuses.
    const miles = haversineMiles(
      CAMPUS_ANCHORS["Syracuse University"].lat,
      CAMPUS_ANCHORS["Syracuse University"].lng,
      CAMPUS_ANCHORS["Cornell University"].lat,
      CAMPUS_ANCHORS["Cornell University"].lng,
    );
    assert.ok(miles > 35 && miles < 55, `expected roughly 44 miles, got ${miles}`);
  });

  it("puts a block from campus under half a mile", () => {
    const campus = CAMPUS_ANCHORS["Syracuse University"];
    assert.ok(haversineMiles(campus.lat, campus.lng, 43.0402, -76.1372) < 0.5);
  });
});

describe("CAMPUS_ANCHORS", () => {
  it("includes Syracuse, which everything falls back to", () => {
    assert.ok(CAMPUS_ANCHORS["Syracuse University"]);
  });

  it("has plausible US coordinates for every campus", () => {
    for (const [name, { lat, lng }] of Object.entries(CAMPUS_ANCHORS)) {
      assert.ok(lat > 24 && lat < 50, `${name} latitude ${lat} is not in the continental US`);
      assert.ok(lng > -125 && lng < -66, `${name} longitude ${lng} is not in the continental US`);
    }
  });
});
