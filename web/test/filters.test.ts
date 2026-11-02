/**
 * TM09-157: the filter sheet's state maps onto the query parameters the API
 * reads (docs/api-contract.md), and clearing it sends no filters at all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_FILTERS, activeFilterCount, filtersToQuery } from "../src/api/types.ts";
import type { Filters } from "../src/api/types.ts";

const FULL: Filters = {
  q: "Westcott",
  maxPrice: 900,
  minBedrooms: 2,
  minBathrooms: 1.5,
  petsAllowed: true,
  furnished: true,
  utilitiesIncluded: true,
  amenities: ["Laundry", "Parking"],
  availableFrom: "2027-01-01",
  availableTo: "2027-05-31",
  radiusMiles: 2,
  sort: "price_asc",
};

describe("filtersToQuery", () => {
  it("maps every filter to the parameter name the API reads", () => {
    const params = Object.fromEntries(filtersToQuery(FULL));
    assert.deepEqual(params, {
      q: "Westcott",
      maxPrice: "900",
      minBedrooms: "2",
      minBathrooms: "1.5",
      petsAllowed: "1",
      furnished: "1",
      utilitiesIncluded: "1",
      amenities: "Laundry,Parking",
      availableFrom: "2027-01-01",
      availableTo: "2027-05-31",
      radiusMiles: "2",
      sort: "price_asc",
    });
  });

  it("sends a studio (0 bedrooms) instead of dropping it", () => {
    const params = filtersToQuery({ ...EMPTY_FILTERS, minBedrooms: 0 });
    assert.equal(params.get("minBedrooms"), "0");
  });

  it("leaves out filters that are off", () => {
    const params = filtersToQuery({ ...EMPTY_FILTERS, petsAllowed: false, amenities: [] });
    assert.equal(params.has("petsAllowed"), false);
    assert.equal(params.has("amenities"), false);
  });
});

describe("clearing filters", () => {
  it("EMPTY_FILTERS sends only the sort, so the API returns the full deck", () => {
    assert.deepEqual([...filtersToQuery(EMPTY_FILTERS).keys()], ["sort"]);
  });

  it("counts no active filters once cleared", () => {
    assert.equal(activeFilterCount(FULL), 12);
    assert.equal(activeFilterCount(EMPTY_FILTERS), 0);
  });
});
