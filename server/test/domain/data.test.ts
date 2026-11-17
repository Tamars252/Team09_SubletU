/**
 * TM09-109: the abstract Data class from the class diagram.
 *
 *   Data
 *   + validateData()
 *   + storeData()
 *   + retrieveData()
 *
 * The subclass tests check each class's own rules; this file checks the
 * contract they share — every value object is a Data and answers the three
 * operations — and the ValidationError the API turns into a 422.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Data, ValidationError } from "../../src/domain/Data.ts";
import { ListingData } from "../../src/domain/ListingData.ts";
import { PhotoData } from "../../src/domain/PhotoData.ts";
import { PricingData } from "../../src/domain/PricingData.ts";
import { RoomDetails } from "../../src/domain/RoomDetails.ts";
import { ScreenSettings } from "../../src/domain/ScreenSettings.ts";

describe("Data class hierarchy", () => {
  const subclasses = [ListingData, PhotoData, PricingData, RoomDetails, ScreenSettings];

  for (const cls of subclasses) {
    it(`${cls.name} extends Data and implements the three diagram operations`, () => {
      assert.ok(cls.prototype instanceof Data, `${cls.name} should extend Data`);
      for (const op of ["validateData", "storeData", "retrieveData"] as const) {
        assert.equal(typeof cls.prototype[op], "function", `${cls.name}.${op}()`);
      }
    });
  }

  it("a minimal subclass is a Data and can report problems", () => {
    class Probe extends Data {
      validateData(): string[] {
        return ["bad"];
      }
      storeData(): void {}
      retrieveData(): boolean {
        return false;
      }
    }
    const probe = new Probe();
    assert.ok(probe instanceof Data);
    assert.deepEqual(probe.validateData(), ["bad"]);
    assert.equal(probe.retrieveData(), false);
  });
});

describe("ValidationError", () => {
  it("is an Error that keeps every problem as a list", () => {
    const err = new ValidationError(["rent is missing", "dates are invalid"]);
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ValidationError");
    assert.deepEqual(err.problems, ["rent is missing", "dates are invalid"]);
  });

  it("joins the problems into the message", () => {
    assert.equal(new ValidationError(["a", "b"]).message, "a; b");
  });
});
