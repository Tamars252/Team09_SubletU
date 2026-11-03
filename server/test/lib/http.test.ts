import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requireDate } from "../../src/lib/http.ts";

describe("requireDate", () => {
  it("zero-pads month and day", () => {
    // Stored unpadded, SQLite's date() returns NULL and the listing drops out
    // of every availability filter.
    assert.equal(requireDate({ d: "2026-1-5" }, "d"), "2026-01-05");
    assert.equal(requireDate({ d: "2026-01-05" }, "d"), "2026-01-05");
  });

  it("rejects impossible calendar dates", () => {
    assert.throws(() => requireDate({ d: "2026-13-45" }, "d"), /not a valid date/);
    assert.throws(() => requireDate({ d: "2026-02-30" }, "d"), /not a valid date/);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    assert.throws(() => requireDate({ d: "March 3rd 2026" }, "d"), /YYYY-MM-DD/);
    assert.throws(() => requireDate({ d: "2026/01/05" }, "d"), /YYYY-MM-DD/);
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    assert.equal(requireDate({ d: "2028-2-29" }, "d"), "2028-02-29");
    assert.throws(() => requireDate({ d: "2027-02-29" }, "d"), /not a valid date/);
  });
});
