import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makePricing } from "../helpers/factories.ts";

describe("PricingData.validateData", () => {
  it("accepts a normal sublet price and window", () => {
    assert.deepEqual(makePricing().validateData(), []);
  });

  it("rejects a rent of zero or less", () => {
    for (const monthlyRent of [0, -1, -900]) {
      const problems = makePricing({ monthlyRent }).validateData();
      assert.ok(
        problems.some((p) => p.includes("Monthly rent must be greater than $0")),
        `rent ${monthlyRent} should be rejected`,
      );
    }
  });

  it("rejects a rent that is not a finite number", () => {
    assert.ok(makePricing({ monthlyRent: Number.NaN }).validateData().length > 0);
    assert.ok(makePricing({ monthlyRent: Number.POSITIVE_INFINITY }).validateData().length > 0);
  });

  it("flags an unrealistic rent above $20,000", () => {
    const problems = makePricing({ monthlyRent: 25_000 }).validateData();
    assert.ok(problems.some((p) => p.includes("unrealistic")));
  });

  it("accepts a rent exactly at the $20,000 boundary", () => {
    assert.deepEqual(makePricing({ monthlyRent: 20_000 }).validateData(), []);
  });

  it("rejects unparseable dates", () => {
    const problems = makePricing({ availableFrom: "not-a-date" }).validateData();
    assert.ok(problems.some((p) => p.includes("Available-from is not a valid date")));
  });

  it("requires the end of the window to be after the start", () => {
    const problems = makePricing({
      availableFrom: "2026-08-01",
      availableTo: "2026-01-01",
    }).validateData();
    assert.ok(problems.some((p) => p.includes("Available-to must be after available-from")));
  });

  it("rejects a zero-length window", () => {
    const problems = makePricing({
      availableFrom: "2026-01-01",
      availableTo: "2026-01-01",
    }).validateData();
    assert.ok(problems.some((p) => p.includes("Available-to must be after available-from")));
  });

  it("rejects a negative deposit but allows no deposit at all", () => {
    assert.ok(
      makePricing({ deposit: -100 }).validateData().some((p) => p.includes("Deposit cannot be negative")),
    );
    assert.deepEqual(makePricing({ deposit: 0 }).validateData(), []);
  });

  it("does not report a date-ordering problem when a date is already invalid", () => {
    // Two problems for one bad field would be noise in the UI.
    const problems = makePricing({ availableTo: "garbage" }).validateData();
    assert.equal(problems.length, 1);
    assert.ok(problems[0].includes("Available-to is not a valid date"));
  });
});
