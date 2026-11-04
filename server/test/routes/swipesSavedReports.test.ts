/**
 * Swipes, saved and reports endpoints.
 *
 * One block per acceptance criterion:
 *   1. POST /swipes, POST /swipes/undo, DELETE /swipes and GET /swipes/stats
 *      behave as docs/api-contract.md describes. Right-swipe = save, with
 *      undo and reset.
 *   2. The Saved tab and the deck read the same tables, so they never
 *      disagree about a listing (FR-6.4).
 *   3. POST /reports stores a report with the listing, the reporter and the
 *      reason (FR-8.2).
 *
 * Every test makes its own renter and listings. The suite shares one database,
 * so assertions about the deck compare counts before and after rather than
 * against a fixed number.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, seedListing, seedUser, startTestServer } from "../helpers/http.ts";
import type { TestServer } from "../helpers/http.ts";
import { db } from "../../src/db.ts";

let server: TestServer;
let host: { id: string; token: string };

before(async () => {
  server = await startTestServer();
  host = seedUser("Host");
});

after(async () => {
  await server.close();
});

type Renter = { id: string; token: string };

/** Listing ids currently in the renter's deck. */
async function deckIds(renter: Renter): Promise<string[]> {
  const res = await api(server, "GET", "/api/listings/deck?limit=60", { token: renter.token });
  assert.equal(res.status, 200);
  return (res.body.results as Array<{ id: string }>).map((l) => l.id);
}

async function deckRemaining(renter: Renter): Promise<number> {
  const res = await api(server, "GET", "/api/listings/deck?limit=1", { token: renter.token });
  return res.body.remaining as number;
}

/** Listing ids on the renter's Saved tab. */
async function savedIds(renter: Renter): Promise<string[]> {
  const res = await api(server, "GET", "/api/saved", { token: renter.token });
  assert.equal(res.status, 200);
  return (res.body.results as Array<{ id: string }>).map((l) => l.id);
}

function swipe(renter: Renter, listingId: string, direction: string) {
  return api(server, "POST", "/api/swipes", {
    token: renter.token,
    body: { listingId, direction },
  });
}

function removeListing(listingId: string): void {
  db.prepare("UPDATE listings SET status = 'removed' WHERE id = ?").run(listingId);
}

/* ------------------------------------------------------------ criterion 1 */

describe("POST /api/swipes", () => {
  it("a right swipe saves the listing and takes it out of the deck", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    const before = await deckRemaining(renter);

    const res = await swipe(renter, listingId, "right");

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.direction, "right");
    assert.equal(res.body.saved, true);
    assert.equal(res.body.remaining, before - 1);
    assert.ok((await savedIds(renter)).includes(listingId));
    assert.ok(!(await deckIds(renter)).includes(listingId));
  });

  it("a left swipe passes without saving", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);

    const res = await swipe(renter, listingId, "left");

    assert.equal(res.status, 201);
    assert.equal(res.body.saved, false);
    assert.ok(!(await savedIds(renter)).includes(listingId));
    assert.ok(!(await deckIds(renter)).includes(listingId));
  });

  it("re-swiping updates the verdict instead of adding a second row", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);

    await swipe(renter, listingId, "right");
    await swipe(renter, listingId, "left");

    const rows = db
      .prepare("SELECT direction FROM swipes WHERE user_id = ? AND listing_id = ?")
      .all(renter.id, listingId) as Array<{ direction: string }>;
    assert.deepEqual(rows.map((r) => r.direction), ["left"]);
    assert.ok(!(await savedIds(renter)).includes(listingId), "changing to left unsaves it");
  });

  it("rejects a bad direction, an unknown or removed listing, your own listing, and no token", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    const removed = seedListing(host.id);
    removeListing(removed);

    assert.equal((await swipe(renter, listingId, "up")).status, 400);
    assert.equal((await swipe(renter, "lst_does-not-exist", "right")).status, 404);
    assert.equal((await swipe(renter, removed, "right")).status, 404);
    assert.equal((await swipe(host, listingId, "right")).status, 400);

    const anonymous = await api(server, "POST", "/api/swipes", {
      body: { listingId, direction: "right" },
    });
    assert.equal(anonymous.status, 401);
  });
});

describe("POST /api/swipes/undo", () => {
  it("reverses the most recent swipe and returns the card with its distance", async () => {
    const renter = seedUser("Renter");
    const first = seedListing(host.id);
    const second = seedListing(host.id);
    await swipe(renter, first, "left");
    await swipe(renter, second, "left");

    const res = await api(server, "POST", "/api/swipes/undo", { token: renter.token });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const listing = res.body.listing as { id: string; distanceMiles: number | null };
    assert.equal(listing.id, second, "the newest swipe is the one undone");
    assert.equal(typeof listing.distanceMiles, "number", "the restored card can show its distance");
    const deck = await deckIds(renter);
    assert.ok(deck.includes(second));
    assert.ok(!deck.includes(first), "older swipes are left alone");
  });

  it("unsaves a listing when the swipe being undone was a right swipe", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    await swipe(renter, listingId, "right");

    await api(server, "POST", "/api/swipes/undo", { token: renter.token });

    assert.ok(!(await savedIds(renter)).includes(listingId));
    assert.ok((await deckIds(renter)).includes(listingId));
  });

  it("never unsaves a listing that was saved after it was passed", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    await swipe(renter, listingId, "left");
    // Saved later from the detail view or the map, not from the deck.
    await api(server, "POST", "/api/saved", { token: renter.token, body: { listingId } });

    await api(server, "POST", "/api/swipes/undo", { token: renter.token });

    assert.ok((await savedIds(renter)).includes(listingId));
  });

  it("skips a listing that has been removed since, rather than restoring it", async () => {
    const renter = seedUser("Renter");
    const kept = seedListing(host.id);
    const gone = seedListing(host.id);
    await swipe(renter, kept, "left");
    await swipe(renter, gone, "left");
    removeListing(gone);

    const res = await api(server, "POST", "/api/swipes/undo", { token: renter.token });

    assert.equal((res.body.listing as { id: string }).id, kept);
  });

  it("says so when there is nothing to undo", async () => {
    const renter = seedUser("Renter");
    const res = await api(server, "POST", "/api/swipes/undo", { token: renter.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: false, message: "Nothing to undo" });
  });
});

describe("DELETE /api/swipes", () => {
  it("with no query, resets everything: every swipe and every save", async () => {
    const renter = seedUser("Renter");
    const liked = seedListing(host.id);
    const passed = seedListing(host.id);
    const full = await deckRemaining(renter);
    await swipe(renter, liked, "right");
    await swipe(renter, passed, "left");

    const res = await api(server, "DELETE", "/api/swipes", { token: renter.token });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, keptSaved: false });
    assert.deepEqual(await savedIds(renter), []);
    assert.equal(await deckRemaining(renter), full, "the whole deck is back");
  });

  it("with ?keepSaved=true, brings passes back but keeps saves saved and out of the deck", async () => {
    const renter = seedUser("Renter");
    const liked = seedListing(host.id);
    const passed = seedListing(host.id);
    await swipe(renter, liked, "right");
    await swipe(renter, passed, "left");

    const res = await api(server, "DELETE", "/api/swipes?keepSaved=true", { token: renter.token });

    assert.deepEqual(res.body, { ok: true, keptSaved: true });
    const deck = await deckIds(renter);
    assert.ok(deck.includes(passed), "the pass is cleared");
    assert.ok(!deck.includes(liked), "a saved listing does not reappear in the deck");
    assert.deepEqual(await savedIds(renter), [liked]);
  });
});

describe("GET /api/swipes/stats", () => {
  it("counts likes and passes, and agrees with the deck on what is left", async () => {
    const renter = seedUser("Renter");
    const a = seedListing(host.id);
    const b = seedListing(host.id);
    const c = seedListing(host.id);
    await swipe(renter, a, "right");
    await swipe(renter, b, "left");
    await swipe(renter, c, "left");

    const res = await api(server, "GET", "/api/swipes/stats", { token: renter.token });

    assert.equal(res.status, 200);
    assert.equal(res.body.likes, 1);
    assert.equal(res.body.passes, 2);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.remaining, await deckRemaining(renter));
  });

  it("starts at zero for a new account", async () => {
    const renter = seedUser("Renter");
    const res = await api(server, "GET", "/api/swipes/stats", { token: renter.token });
    assert.equal(res.body.likes, 0);
    assert.equal(res.body.passes, 0);
    assert.equal(res.body.total, 0);
  });
});

/* ------------------------------------------------------------ criterion 2 */

describe("the Saved tab and the deck read the same tables", () => {
  it("unsaving puts the listing back in the deck", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    await swipe(renter, listingId, "right");

    const res = await api(server, "DELETE", `/api/saved/${listingId}`, { token: renter.token });

    assert.deepEqual(res.body, { ok: true, saved: false });
    assert.ok(!(await savedIds(renter)).includes(listingId));
    assert.ok((await deckIds(renter)).includes(listingId));
  });

  it("saving outside the deck takes the listing out of the deck too", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    const before = await deckRemaining(renter);

    const res = await api(server, "POST", "/api/saved", { token: renter.token, body: { listingId } });

    assert.equal(res.status, 201);
    assert.ok((await savedIds(renter)).includes(listingId));
    assert.ok(!(await deckIds(renter)).includes(listingId));
    assert.equal(await deckRemaining(renter), before - 1);
  });

  it("saving twice does not create a duplicate (FR-6.3)", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    await api(server, "POST", "/api/saved", { token: renter.token, body: { listingId } });
    await api(server, "POST", "/api/saved", { token: renter.token, body: { listingId } });
    await swipe(renter, listingId, "right");

    const row = db
      .prepare("SELECT COUNT(*) AS n FROM saved_listings WHERE user_id = ? AND listing_id = ?")
      .get(renter.id, listingId) as { n: number };
    assert.equal(row.n, 1);
  });

  it("every endpoint reports the same number of listings left", async () => {
    const renter = seedUser("Renter");
    const swiped = seedListing(host.id);
    const savedElsewhere = seedListing(host.id);
    await api(server, "POST", "/api/saved", {
      token: renter.token,
      body: { listingId: savedElsewhere },
    });

    const fromSwipe = (await swipe(renter, swiped, "left")).body.remaining;
    const fromStats = (await api(server, "GET", "/api/swipes/stats", { token: renter.token })).body
      .remaining;
    const fromDeck = await deckRemaining(renter);

    assert.equal(fromSwipe, fromDeck);
    assert.equal(fromStats, fromDeck);
  });

  it("a removed listing drops off the Saved tab", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    await swipe(renter, listingId, "right");
    removeListing(listingId);

    assert.ok(!(await savedIds(renter)).includes(listingId));
  });
});

/* ------------------------------------------------------------ criterion 3 */

describe("POST /api/reports", () => {
  it("stores the listing, the reporter, the reason and the details", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);

    const res = await api(server, "POST", "/api/reports", {
      token: renter.token,
      body: { listingId, reason: "Suspected scam", details: "Asked for a deposit over Venmo." },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    const rows = db
      .prepare("SELECT reporter_id, reason, details, status FROM reports WHERE listing_id = ?")
      .all(listingId)
      // node:sqlite rows have a null prototype; copy them so deepEqual compares fields only.
      .map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      {
        reporter_id: renter.id,
        reason: "Suspected scam",
        details: "Asked for a deposit over Venmo.",
        status: "open",
      },
    ]);
  });

  it("treats details as optional", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);

    const res = await api(server, "POST", "/api/reports", {
      token: renter.token,
      body: { listingId, reason: "Already rented" },
    });

    assert.equal(res.status, 201);
    const row = db.prepare("SELECT details FROM reports WHERE listing_id = ?").get(listingId) as {
      details: string;
    };
    assert.equal(row.details, "");
  });

  it("stores nothing for an unknown reason, an unknown listing, or no token", async () => {
    const renter = seedUser("Renter");
    const listingId = seedListing(host.id);
    const count = () =>
      (db.prepare("SELECT COUNT(*) AS n FROM reports").get() as { n: number }).n;
    const before = count();

    const badReason = await api(server, "POST", "/api/reports", {
      token: renter.token,
      body: { listingId, reason: "I just don't like it" },
    });
    const badListing = await api(server, "POST", "/api/reports", {
      token: renter.token,
      body: { listingId: "lst_does-not-exist", reason: "Suspected scam" },
    });
    const anonymous = await api(server, "POST", "/api/reports", {
      body: { listingId, reason: "Suspected scam" },
    });

    assert.equal(badReason.status, 400);
    assert.equal(badListing.status, 404);
    assert.equal(anonymous.status, 401);
    assert.equal(count(), before);
  });

  it("GET /api/reports/reasons lists the reasons the API accepts", async () => {
    const res = await api(server, "GET", "/api/reports/reasons");
    assert.equal(res.status, 200);
    assert.ok((res.body.reasons as string[]).includes("Suspected scam"));
  });
});
