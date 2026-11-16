/**
 * TM09-114: RoomDetails, the Data subclass behind the `room_details` table.
 *
 *   1. validateData() at every boundary of every rule.
 *   2. storeData() is an upsert: one row per listing, last write wins.
 *   3. retrieveData() / retrieveForListing() / retrieveForListings().
 *   4. toJSON() and fromJSON() are inverses.
 *
 * The shape of this file deliberately mirrors pricingData.test.ts: the two
 * classes are the same kind of thing hanging off the same listing, and a
 * reader who has read one should not have to learn a second layout.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";
import { ValidationError } from "../../src/domain/Data.ts";
import { RoomDetails } from "../../src/domain/RoomDetails.ts";
import type { RoomDetailsFields } from "../../src/domain/RoomDetails.ts";

function addUser(name: string): string {
  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at)
     VALUES (?, ?, ?, 'x', ?)`,
  ).run(id, `${id}@syr.edu`, name, nowIso());
  return id;
}

/** A listing row to hang room details off: room_details.listing_id is a FK. */
function addListing(ownerId: string): string {
  const id = newId("lst");
  const now = nowIso();
  db.prepare(
    `INSERT INTO listings (id, owner_id, title, address, description, created_at, updated_at)
     VALUES (?, ?, 'Room fixture', '2 Fixture Ave', 'A fixture listing.', ?, ?)`,
  ).run(id, ownerId, now, now);
  return id;
}

const BASE: Omit<RoomDetailsFields, "listingId"> = {
  bedrooms: 1,
  bathrooms: 1,
  maxRoommates: 0,
  petsAllowed: false,
  furnished: false,
  privateBath: false,
};

/** Room details that are valid apart from whatever the caller overrides. */
function room(over: Partial<RoomDetailsFields> = {}): RoomDetails {
  return new RoomDetails({ listingId: "lst_fixture", ...BASE, ...over });
}

const problemsOf = (over: Partial<RoomDetailsFields>) => room(over).validateData();

/**
 * The same, for a flag set to something that is not a boolean. TypeScript
 * forbids it, which is the point: the rule exists for callers that are not
 * TypeScript — a JSON body, a seed script, a row read back by hand.
 */
const problemsOfFlag = (field: "petsAllowed" | "furnished" | "privateBath", value: unknown) =>
  problemsOf({ [field]: value } as unknown as Partial<RoomDetailsFields>);

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

describe("validateData(): bedrooms", () => {
  const TOO_MANY = "Bedrooms must be a whole number between 0 and 12";

  it("accepts 0, which is how a studio is written", () => {
    assert.deepEqual(problemsOf({ bedrooms: 0 }), []);
  });

  it("accepts 12 and rejects 13", () => {
    assert.deepEqual(problemsOf({ bedrooms: 12 }), []);
    assert.deepEqual(problemsOf({ bedrooms: 13 }), [TOO_MANY]);
  });

  it("rejects a fraction of a bedroom, and anything that is not a number", () => {
    assert.deepEqual(problemsOf({ bedrooms: 1.5 }), [TOO_MANY]);
    assert.deepEqual(problemsOf({ bedrooms: -1 }), [TOO_MANY]);
    assert.deepEqual(problemsOf({ bedrooms: NaN }), [TOO_MANY]);
  });
});

describe("validateData(): bathrooms", () => {
  const OUT_OF_RANGE = "Bathrooms must be between 0.5 and 12";

  it("accepts a half bath and rejects anything smaller", () => {
    assert.deepEqual(problemsOf({ bathrooms: 0.5 }), []);
    assert.deepEqual(problemsOf({ bathrooms: 0.4 }), [OUT_OF_RANGE]);
    assert.deepEqual(problemsOf({ bathrooms: 0 }), [OUT_OF_RANGE]);
  });

  it("accepts 12 and rejects 12.5", () => {
    assert.deepEqual(problemsOf({ bathrooms: 12 }), []);
    assert.deepEqual(problemsOf({ bathrooms: 12.5 }), [OUT_OF_RANGE]);
  });

  it("allows halves in between, unlike bedrooms", () => {
    assert.deepEqual(problemsOf({ bathrooms: 1.5 }), []);
    assert.deepEqual(problemsOf({ bathrooms: 2.5 }), []);
  });

  it("rejects a bathroom count that is not a number", () => {
    assert.deepEqual(problemsOf({ bathrooms: NaN }), [OUT_OF_RANGE]);
  });
});

describe("validateData(): max roommates", () => {
  const OUT_OF_RANGE = "Max roommates must be a whole number between 0 and 20";

  it("accepts 0, which means the renter would live alone", () => {
    assert.deepEqual(problemsOf({ maxRoommates: 0 }), []);
  });

  it("accepts 20 and rejects 21", () => {
    assert.deepEqual(problemsOf({ maxRoommates: 20 }), []);
    assert.deepEqual(problemsOf({ maxRoommates: 21 }), [OUT_OF_RANGE]);
  });

  it("rejects half a roommate", () => {
    assert.deepEqual(problemsOf({ maxRoommates: 2.5 }), [OUT_OF_RANGE]);
    assert.deepEqual(problemsOf({ maxRoommates: -1 }), [OUT_OF_RANGE]);
  });
});

describe("validateData(): the three flags are booleans", () => {
  it("names the flag that is not one", () => {
    assert.deepEqual(problemsOfFlag("petsAllowed", "yes"), ["Pets allowed must be true or false"]);
    assert.deepEqual(problemsOfFlag("furnished", 1), ["Furnished must be true or false"]);
    assert.deepEqual(problemsOfFlag("privateBath", null), ["Private bath must be true or false"]);
  });

  it("rejects the 1 and 0 the column actually stores", () => {
    // Reading a row by hand and passing the raw column through is the way
    // this goes wrong, and 0 is falsy, so a truthiness check would miss it.
    assert.deepEqual(problemsOfFlag("furnished", 0), ["Furnished must be true or false"]);
    assert.deepEqual(problemsOfFlag("petsAllowed", undefined), [
      "Pets allowed must be true or false",
    ]);
  });

  it("accepts both booleans", () => {
    assert.deepEqual(
      problemsOf({ petsAllowed: true, furnished: true, privateBath: true }),
      [],
    );
    assert.deepEqual(
      problemsOf({ petsAllowed: false, furnished: false, privateBath: false }),
      [],
    );
  });
});

describe("validateData(): the listing id", () => {
  it("requires one, and does not count whitespace", () => {
    assert.deepEqual(problemsOf({ listingId: "" }), ["Listing id is required"]);
    assert.deepEqual(problemsOf({ listingId: "   " }), ["Listing id is required"]);
  });

  it("reports every broken rule at once, not just the first", () => {
    assert.deepEqual(
      problemsOf({
        listingId: "",
        bedrooms: 13,
        bathrooms: 0,
        maxRoommates: 21,
        petsAllowed: "yes" as unknown as boolean,
      }),
      [
        "Listing id is required",
        "Bedrooms must be a whole number between 0 and 12",
        "Bathrooms must be between 0.5 and 12",
        "Max roommates must be a whole number between 0 and 20",
        "Pets allowed must be true or false",
      ],
    );
  });
});

/* --------------------------------------------------------------------- 2 */

describe("storeData(): one row per listing, last write wins", () => {
  let listingId: string;
  before(() => {
    listingId = addListing(addUser("Room Upsert Owner"));
  });

  const rowCount = () =>
    (
      db.prepare("SELECT COUNT(*) AS n FROM room_details WHERE listing_id = ?").get(listingId) as {
        n: number;
      }
    ).n;

  it("inserts, then updates in place rather than inserting again", () => {
    room({ listingId, bedrooms: 1, bathrooms: 1 }).storeData();
    assert.equal(rowCount(), 1);
    assert.equal(RoomDetails.retrieveForListing(listingId)!.bedrooms, 1);

    room({ listingId, bedrooms: 4, bathrooms: 2.5, maxRoommates: 3 }).storeData();
    assert.equal(rowCount(), 1);

    const stored = RoomDetails.retrieveForListing(listingId)!;
    assert.equal(stored.bedrooms, 4);
    assert.equal(stored.bathrooms, 2.5);
    assert.equal(stored.maxRoommates, 3);
  });

  it("round-trips the three flags as booleans, not as 1 and 0", () => {
    room({ listingId, petsAllowed: true, furnished: false, privateBath: true }).storeData();

    const stored = RoomDetails.retrieveForListing(listingId)!;
    assert.equal(stored.petsAllowed, true);
    assert.equal(stored.furnished, false);
    assert.equal(stored.privateBath, true);
    assert.deepEqual(stored.validateData(), [], "a row read back is still valid");
  });

  it("turns a flag back off again", () => {
    room({ listingId, petsAllowed: false }).storeData();
    assert.equal(RoomDetails.retrieveForListing(listingId)!.petsAllowed, false);
  });
});

/* --------------------------------------------------------------------- 3 */

describe("retrieveData(): refreshing an object already in hand", () => {
  let listingId: string;
  before(() => {
    listingId = addListing(addUser("Room Refresh Owner"));
  });

  it("picks up a row that changed underneath it", () => {
    const mine = room({ listingId, bedrooms: 2 });
    mine.storeData();

    db.prepare(
      "UPDATE room_details SET bedrooms = 5, furnished = 1 WHERE listing_id = ?",
    ).run(listingId);

    assert.equal(mine.bedrooms, 2, "not refreshed yet");
    assert.equal(mine.retrieveData(), true);
    assert.equal(mine.bedrooms, 5);
    assert.equal(mine.furnished, true);
  });

  it("returns false once the row is gone, and leaves the object alone", () => {
    const mine = room({ listingId, bedrooms: 2 });
    mine.storeData();
    db.prepare("DELETE FROM room_details WHERE listing_id = ?").run(listingId);

    assert.equal(mine.retrieveData(), false);
    assert.equal(mine.bedrooms, 2);
  });
});

describe("retrieveForListing() / retrieveForListings()", () => {
  it("returns null for a listing id nothing was stored under", () => {
    assert.equal(RoomDetails.retrieveForListing("lst_does_not_exist"), null);
  });

  it("returns an empty map for no ids at all", () => {
    assert.equal(RoomDetails.retrieveForListings([]).size, 0);
  });

  it("loads exactly the stored ones out of more ids than one query can bind", () => {
    const owner = addUser("Room Batch Owner");
    // chunkIds() batches at 400, so 450 ids means two statements. The stored
    // ids sit either side of that boundary, so a loop that ran only once, or
    // one that dropped everything after the first chunk, fails here.
    const stored = new Map<string, number>();
    const ids: string[] = [];
    for (let i = 0; i < 450; i += 1) {
      if (i === 0 || i === 399 || i === 400 || i === 449) {
        const listingId = addListing(owner);
        const bedrooms = (i % 12) + 1;
        room({ listingId, bedrooms }).storeData();
        stored.set(listingId, bedrooms);
        ids.push(listingId);
      } else {
        ids.push(`lst_absent_${i}`);
      }
    }
    assert.equal(ids.length, 450);

    const found = RoomDetails.retrieveForListings(ids);

    assert.equal(found.size, stored.size);
    assert.deepEqual([...found.keys()].sort(), [...stored.keys()].sort());
    for (const [listingId, bedrooms] of stored) {
      assert.ok(found.get(listingId) instanceof RoomDetails);
      assert.equal(found.get(listingId)!.bedrooms, bedrooms);
      assert.equal(found.get(listingId)!.listingId, listingId);
    }
  });
});

/* --------------------------------------------------------------------- 4 */

describe("toJSON() / fromJSON()", () => {
  it("toJSON() leaves out the listing id, which keys the row", () => {
    assert.deepEqual(Object.keys(room().toJSON()).sort(), [
      "bathrooms",
      "bedrooms",
      "furnished",
      "maxRoommates",
      "petsAllowed",
      "privateBath",
    ]);
  });

  it("fromJSON(toJSON()) gives back an equal object", () => {
    const original = room({
      listingId: "lst_round_trip",
      bedrooms: 3,
      bathrooms: 1.5,
      maxRoommates: 2,
      petsAllowed: true,
      furnished: false,
      privateBath: true,
    });
    const copy = RoomDetails.fromJSON("lst_round_trip", JSON.parse(JSON.stringify(original)));

    assert.ok(copy instanceof RoomDetails);
    assert.equal(copy.listingId, "lst_round_trip");
    assert.deepEqual(copy.toJSON(), original.toJSON());
  });

  it("takes the listing id from its argument, never from the payload", () => {
    const payload = { ...room().toJSON(), listingId: "lst_smuggled" };
    assert.equal(RoomDetails.fromJSON("lst_real", payload).listingId, "lst_real");
  });

  it("rejects a wrongly typed field, naming it", () => {
    assert.deepEqual(
      problemsThrownBy(() => RoomDetails.fromJSON("lst_x", { ...room().toJSON(), bedrooms: "3" })),
      ['RoomDetails JSON field "bedrooms" must be a number'],
    );
    assert.deepEqual(
      problemsThrownBy(() =>
        RoomDetails.fromJSON("lst_x", { ...room().toJSON(), petsAllowed: 1 }),
      ),
      ['RoomDetails JSON field "petsAllowed" must be a boolean'],
    );
  });

  it("rejects a missing field", () => {
    const { privateBath, ...withoutFlag } = room().toJSON();
    assert.deepEqual(problemsThrownBy(() => RoomDetails.fromJSON("lst_x", withoutFlag)), [
      'RoomDetails JSON is missing "privateBath"',
    ]);
  });

  it("reports every bad field at once", () => {
    assert.deepEqual(
      problemsThrownBy(() =>
        RoomDetails.fromJSON("lst_x", {
          bedrooms: "3",
          bathrooms: 1,
          maxRoommates: null,
          petsAllowed: false,
          furnished: "no",
        }),
      ),
      [
        'RoomDetails JSON field "bedrooms" must be a number',
        'RoomDetails JSON is missing "maxRoommates"',
        'RoomDetails JSON field "furnished" must be a boolean',
        'RoomDetails JSON is missing "privateBath"',
      ],
    );
  });

  it("rejects anything that is not an object", () => {
    for (const bad of [null, "{}", 7, [], undefined]) {
      assert.throws(() => RoomDetails.fromJSON("lst_x", bad), ValidationError);
    }
  });

  it("does not run validateData(): a payload may be well-formed and unstorable", () => {
    const built = RoomDetails.fromJSON("lst_x", { ...room().toJSON(), bedrooms: 99 });
    assert.equal(built.bedrooms, 99);
    assert.deepEqual(built.validateData(), ["Bedrooms must be a whole number between 0 and 12"]);
  });
});
