/**
 * TM09-114: PricingData, the Data subclass behind the `pricing` table.
 *
 *   1. validateData() at every boundary of every rule.
 *   2. storeData() is an upsert: one row per listing, last write wins.
 *   3. retrieveData() / retrieveForListing() / retrieveForListings().
 *   4. toJSON() and fromJSON() are inverses.
 *
 * The ListingData tests (TM09-111) check that a listing asks its pricing for
 * problems; this file checks what the answers actually are.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";
import { ValidationError } from "../../src/domain/Data.ts";
import { PricingData } from "../../src/domain/PricingData.ts";
import type { PricingFields } from "../../src/domain/PricingData.ts";

function addUser(name: string): string {
  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at)
     VALUES (?, ?, ?, 'x', ?)`,
  ).run(id, `${id}@syr.edu`, name, nowIso());
  return id;
}

/** A listing row to hang pricing off: pricing.listing_id is a foreign key. */
function addListing(ownerId: string): string {
  const id = newId("lst");
  const now = nowIso();
  db.prepare(
    `INSERT INTO listings (id, owner_id, title, address, description, created_at, updated_at)
     VALUES (?, ?, 'Pricing fixture', '1 Fixture Ave', 'A fixture listing.', ?, ?)`,
  ).run(id, ownerId, now, now);
  return id;
}

const BASE: Omit<PricingFields, "listingId"> = {
  monthlyRent: 800,
  availableFrom: "2027-01-01",
  availableTo: "2027-05-31",
  utilitiesIncluded: false,
  deposit: 0,
};

/** Pricing that is valid apart from whatever the caller overrides. */
function pricing(over: Partial<PricingFields> = {}): PricingData {
  return new PricingData({ listingId: "lst_fixture", ...BASE, ...over });
}

const problemsOf = (over: Partial<PricingFields>) => pricing(over).validateData();

/** The problem list carried by the ValidationError `fn` is expected to throw. */
function problemsThrownBy(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ValidationError, `expected a ValidationError, got ${err}`);
    return err.problems;
  }
  assert.fail("expected a ValidationError, but nothing was thrown");
}

/* --------------------------------------------------------------------- 1 */

describe("validateData(): monthly rent", () => {
  it("accepts a cent and rejects nothing at all", () => {
    assert.deepEqual(problemsOf({ monthlyRent: 0.01 }), []);
    assert.deepEqual(problemsOf({ monthlyRent: 0 }), ["Monthly rent must be greater than $0"]);
    assert.deepEqual(problemsOf({ monthlyRent: -1 }), ["Monthly rent must be greater than $0"]);
  });

  it("accepts the $20,000 ceiling and rejects a cent over it", () => {
    assert.deepEqual(problemsOf({ monthlyRent: 20_000 }), []);
    assert.deepEqual(problemsOf({ monthlyRent: 20_000.01 }), [
      "Monthly rent looks unrealistic (over $20,000)",
    ]);
  });

  it("rejects a rent that is not a number", () => {
    assert.deepEqual(problemsOf({ monthlyRent: NaN }), ["Monthly rent must be greater than $0"]);
    // Infinity trips both rules: it is not a finite amount, and it is over the
    // ceiling. Saying so twice is better than picking one and hiding the other.
    assert.deepEqual(problemsOf({ monthlyRent: Infinity }), [
      "Monthly rent must be greater than $0",
      "Monthly rent looks unrealistic (over $20,000)",
    ]);
  });
});

describe("validateData(): deposit", () => {
  it("accepts no deposit and rejects a negative one", () => {
    assert.deepEqual(problemsOf({ deposit: 0 }), []);
    assert.deepEqual(problemsOf({ deposit: -1 }), ["Deposit cannot be negative"]);
  });

  it("accepts the $20,000 ceiling and rejects a dollar over it", () => {
    assert.deepEqual(problemsOf({ deposit: 20_000 }), []);
    assert.deepEqual(problemsOf({ deposit: 20_001 }), ["Deposit looks unrealistic (over $20,000)"]);
  });

  it("rejects a deposit that is not a number", () => {
    assert.deepEqual(problemsOf({ deposit: NaN }), ["Deposit cannot be negative"]);
  });
});

describe("validateData(): the availability window", () => {
  it("rejects a from-date it cannot parse", () => {
    assert.deepEqual(problemsOf({ availableFrom: "soon" }), [
      "Available-from is not a valid date",
    ]);
    assert.deepEqual(problemsOf({ availableFrom: "" }), ["Available-from is not a valid date"]);
  });

  it("rejects a to-date it cannot parse", () => {
    assert.deepEqual(problemsOf({ availableTo: "whenever" }), [
      "Available-to is not a valid date",
    ]);
  });

  it("does not also complain about the order when a date is unreadable", () => {
    // There is no order to check, and two messages about one typo is noise.
    assert.deepEqual(problemsOf({ availableFrom: "soon", availableTo: "whenever" }), [
      "Available-from is not a valid date",
      "Available-to is not a valid date",
    ]);
  });

  it("rejects a window that ends when it starts", () => {
    assert.deepEqual(problemsOf({ availableFrom: "2027-03-01", availableTo: "2027-03-01" }), [
      "Available-to must be after available-from",
    ]);
  });

  it("accepts a window one day long", () => {
    assert.deepEqual(problemsOf({ availableFrom: "2027-03-01", availableTo: "2027-03-02" }), []);
  });
});

describe("validateData(): the listing id", () => {
  it("requires one, and does not count whitespace", () => {
    assert.deepEqual(problemsOf({ listingId: "" }), ["Listing id is required"]);
    assert.deepEqual(problemsOf({ listingId: "   " }), ["Listing id is required"]);
  });

  it("reports every broken rule at once, not just the first", () => {
    assert.deepEqual(problemsOf({ listingId: "", monthlyRent: 0, deposit: -1 }), [
      "Listing id is required",
      "Monthly rent must be greater than $0",
      "Deposit cannot be negative",
    ]);
  });
});

/* --------------------------------------------------------------------- 2 */

describe("storeData(): one row per listing, last write wins", () => {
  let listingId: string;
  before(() => {
    listingId = addListing(addUser("Pricing Upsert Owner"));
  });

  const rowCount = () =>
    (
      db.prepare("SELECT COUNT(*) AS n FROM pricing WHERE listing_id = ?").get(listingId) as {
        n: number;
      }
    ).n;

  it("inserts, then updates in place rather than inserting again", () => {
    pricing({ listingId, monthlyRent: 700 }).storeData();
    assert.equal(rowCount(), 1);
    assert.equal(PricingData.retrieveForListing(listingId)!.monthlyRent, 700);

    pricing({ listingId, monthlyRent: 925, utilitiesIncluded: true, deposit: 150 }).storeData();
    assert.equal(rowCount(), 1);

    const stored = PricingData.retrieveForListing(listingId)!;
    assert.equal(stored.monthlyRent, 925);
    assert.equal(stored.utilitiesIncluded, true);
    assert.equal(stored.deposit, 150);
  });

  it("round-trips the boolean as a boolean, not as 1", () => {
    pricing({ listingId, utilitiesIncluded: false }).storeData();
    assert.equal(PricingData.retrieveForListing(listingId)!.utilitiesIncluded, false);
  });
});

/* --------------------------------------------------------------------- 3 */

describe("retrieveData(): refreshing an object already in hand", () => {
  let listingId: string;
  before(() => {
    listingId = addListing(addUser("Pricing Refresh Owner"));
  });

  it("picks up a row that changed underneath it", () => {
    const mine = pricing({ listingId, monthlyRent: 600 });
    mine.storeData();

    db.prepare("UPDATE pricing SET monthly_rent = 1234, deposit = 99 WHERE listing_id = ?").run(
      listingId,
    );

    assert.equal(mine.monthlyRent, 600, "not refreshed yet");
    assert.equal(mine.retrieveData(), true);
    assert.equal(mine.monthlyRent, 1234);
    assert.equal(mine.deposit, 99);
  });

  it("returns false once the row is gone, and leaves the object alone", () => {
    const mine = pricing({ listingId, monthlyRent: 600 });
    mine.storeData();
    db.prepare("DELETE FROM pricing WHERE listing_id = ?").run(listingId);

    assert.equal(mine.retrieveData(), false);
    assert.equal(mine.monthlyRent, 600);
  });
});

describe("retrieveForListing() / retrieveForListings()", () => {
  it("returns null for a listing id nothing was stored under", () => {
    assert.equal(PricingData.retrieveForListing("lst_does_not_exist"), null);
  });

  it("returns an empty map for no ids at all", () => {
    assert.equal(PricingData.retrieveForListings([]).size, 0);
  });

  it("loads exactly the stored ones out of more ids than one query can bind", () => {
    const owner = addUser("Pricing Batch Owner");
    // chunkIds() batches at 400, so 450 ids means two statements. The stored
    // ids sit either side of that boundary, so a loop that ran only once, or
    // one that dropped everything after the first chunk, fails here.
    const stored = new Map<string, number>();
    const ids: string[] = [];
    for (let i = 0; i < 450; i += 1) {
      if (i === 0 || i === 399 || i === 400 || i === 449) {
        const listingId = addListing(owner);
        const rent = 500 + i;
        pricing({ listingId, monthlyRent: rent }).storeData();
        stored.set(listingId, rent);
        ids.push(listingId);
      } else {
        ids.push(`lst_absent_${i}`);
      }
    }
    assert.equal(ids.length, 450);

    const found = PricingData.retrieveForListings(ids);

    assert.equal(found.size, stored.size);
    assert.deepEqual([...found.keys()].sort(), [...stored.keys()].sort());
    for (const [listingId, rent] of stored) {
      assert.ok(found.get(listingId) instanceof PricingData);
      assert.equal(found.get(listingId)!.monthlyRent, rent);
      assert.equal(found.get(listingId)!.listingId, listingId);
    }
  });
});

/* --------------------------------------------------------------------- 4 */

describe("toJSON() / fromJSON()", () => {
  it("toJSON() leaves out the listing id, which keys the row", () => {
    assert.deepEqual(Object.keys(pricing().toJSON()).sort(), [
      "availableFrom",
      "availableTo",
      "deposit",
      "monthlyRent",
      "utilitiesIncluded",
    ]);
  });

  it("fromJSON(toJSON()) gives back an equal object", () => {
    const original = pricing({
      listingId: "lst_round_trip",
      monthlyRent: 1375.5,
      utilitiesIncluded: true,
      deposit: 500,
    });
    const copy = PricingData.fromJSON("lst_round_trip", JSON.parse(JSON.stringify(original)));

    assert.ok(copy instanceof PricingData);
    assert.equal(copy.listingId, "lst_round_trip");
    assert.deepEqual(copy.toJSON(), original.toJSON());
  });

  it("takes the listing id from its argument, never from the payload", () => {
    const payload = { ...pricing().toJSON(), listingId: "lst_smuggled" };
    assert.equal(PricingData.fromJSON("lst_real", payload).listingId, "lst_real");
  });

  it("rejects a wrongly typed field, naming it", () => {
    const problems = problemsThrownBy(() =>
      PricingData.fromJSON("lst_x", { ...pricing().toJSON(), monthlyRent: "800" }),
    );
    assert.deepEqual(problems, ['PricingData JSON field "monthlyRent" must be a number']);
  });

  it("rejects a missing field", () => {
    const { monthlyRent, ...withoutRent } = pricing().toJSON();
    const problems = problemsThrownBy(() => PricingData.fromJSON("lst_x", withoutRent));
    assert.deepEqual(problems, ['PricingData JSON is missing "monthlyRent"']);
  });

  it("reports every bad field at once", () => {
    const problems = problemsThrownBy(() =>
      PricingData.fromJSON("lst_x", {
        monthlyRent: "800",
        availableFrom: 20270101,
        availableTo: "2027-05-31",
        utilitiesIncluded: "yes",
        deposit: null,
      }),
    );
    assert.deepEqual(problems, [
      'PricingData JSON field "monthlyRent" must be a number',
      'PricingData JSON field "availableFrom" must be a string',
      'PricingData JSON field "utilitiesIncluded" must be a boolean',
      'PricingData JSON is missing "deposit"',
    ]);
  });

  it("rejects anything that is not an object", () => {
    for (const bad of [null, "{}", 7, [], undefined]) {
      assert.throws(() => PricingData.fromJSON("lst_x", bad), ValidationError);
    }
  });

  it("does not run validateData(): a payload may be well-formed and unstorable", () => {
    const built = PricingData.fromJSON("lst_x", { ...pricing().toJSON(), monthlyRent: -5 });
    assert.equal(built.monthlyRent, -5);
    assert.deepEqual(built.validateData(), ["Monthly rent must be greater than $0"]);
  });
});
