/**
 * TM09-149: Persist saved listings.
 *
 * One block per acceptance criterion:
 *   1. A right-swipe writes a saved row.
 *   2. Saving twice does not create duplicates.
 *   3. The Saved tab loads from the database.
 *
 * These cover the server half of the story. The web Saved tab (TM09-101) is
 * not on main yet; when it lands, it reads GET /api/saved, which is what AC3
 * pins down here.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { api, seedListing, seedUser, startTestServer } from "../helpers/http.ts";
import type { TestServer } from "../helpers/http.ts";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";

let server: TestServer;
let host: { id: string; token: string };
let renter: { id: string; token: string };
let listing: string;

before(async () => {
  server = await startTestServer();
  host = seedUser("Hannah Host");
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  // A fresh renter and listing per test, so no test sees another's saves.
  renter = seedUser("Riley Renter");
  listing = seedListing(host.id);
});

function savedRows(userId: string, listingId?: string): number {
  const sql = listingId
    ? "SELECT COUNT(*) AS n FROM saved_listings WHERE user_id = ? AND listing_id = ?"
    : "SELECT COUNT(*) AS n FROM saved_listings WHERE user_id = ?";
  const args = listingId ? [userId, listingId] : [userId];
  return (db.prepare(sql).get(...args) as { n: number }).n;
}

const swipe = (direction: "left" | "right", listingId = listing, token = renter.token) =>
  api(server, "POST", "/api/swipes", { token, body: { listingId, direction } });

const save = (listingId = listing, token = renter.token) =>
  api(server, "POST", "/api/saved", { token, body: { listingId } });

const savedTab = (token = renter.token) => api(server, "GET", "/api/saved", { token });

/* ------------------------------------------------------------------- AC1 */

describe("AC1: a right-swipe writes a saved row", () => {
  it("POST /api/swipes right adds a saved_listings row and says so", async () => {
    assert.equal(savedRows(renter.id, listing), 0);

    const res = await swipe("right");

    assert.equal(res.status, 201);
    assert.equal(res.body.saved, true);
    assert.equal(savedRows(renter.id, listing), 1);
  });

  it("a left swipe does not save", async () => {
    const res = await swipe("left");
    assert.equal(res.status, 201);
    assert.equal(res.body.saved, false);
    assert.equal(savedRows(renter.id), 0);
  });

  it("changing a right swipe to left removes the saved row", async () => {
    await swipe("right");
    await swipe("left");
    assert.equal(savedRows(renter.id, listing), 0);
  });

  it("requires a signed-in renter and an existing listing", async () => {
    const anon = await api(server, "POST", "/api/swipes", {
      body: { listingId: listing, direction: "right" },
    });
    assert.equal(anon.status, 401);

    const missing = await swipe("right", "lst_does_not_exist");
    assert.equal(missing.status, 404);
    assert.equal(savedRows(renter.id), 0);
  });

  it("a host cannot save their own listing by swiping it", async () => {
    const res = await swipe("right", listing, host.token);
    assert.equal(res.status, 400);
    assert.equal(savedRows(host.id), 0);
  });
});

/* ------------------------------------------------------------------- AC2 */

describe("AC2: saving twice does not create duplicates", () => {
  it("two right swipes on the same listing leave one row", async () => {
    await swipe("right");
    await swipe("right");
    assert.equal(savedRows(renter.id, listing), 1);
  });

  it("POST /api/saved twice leaves one row, and both calls succeed", async () => {
    const first = await save();
    const second = await save();
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(savedRows(renter.id, listing), 1);
  });

  it("a right swipe plus a save from elsewhere leaves one row", async () => {
    await swipe("right");
    await save();
    assert.equal(savedRows(renter.id, listing), 1);
  });

  it("the Saved tab lists the listing once", async () => {
    await swipe("right");
    await save();
    const res = await savedTab();
    const ids = (res.body.results as Array<{ id: string }>).map((l) => l.id);
    assert.deepEqual(ids, [listing]);
  });

  it("the database itself rejects a duplicate, not just the route", () => {
    const insert = db.prepare(
      "INSERT INTO saved_listings (id, user_id, listing_id, created_at) VALUES (?, ?, ?, ?)",
    );
    insert.run(newId("sav"), renter.id, listing, nowIso());
    assert.throws(
      () => insert.run(newId("sav"), renter.id, listing, nowIso()),
      /UNIQUE constraint failed/,
    );
  });
});

/* ------------------------------------------------------------------- AC3 */

describe("AC3: the Saved tab loads from the database", () => {
  it("returns a row written straight to the table, with no swipe in this session", async () => {
    db.prepare(
      "INSERT INTO saved_listings (id, user_id, listing_id, created_at) VALUES (?, ?, ?, ?)",
    ).run(newId("sav"), renter.id, listing, nowIso());

    const res = await savedTab();

    assert.equal(res.status, 200);
    const [entry] = res.body.results as Array<Record<string, unknown>>;
    assert.equal(entry.id, listing);
    assert.equal(entry.saved, true);
    assert.equal(entry.title, "Sunny room near campus");
    assert.equal(typeof entry.savedAt, "string");
  });

  it("survives a server restart (it is not held in memory)", async () => {
    await swipe("right");
    await server.close();
    server = await startTestServer();

    const res = await savedTab();
    const ids = (res.body.results as Array<{ id: string }>).map((l) => l.id);
    assert.deepEqual(ids, [listing]);
  });

  it("lists the most recently saved first", async () => {
    const older = listing;
    const newer = seedListing(host.id);
    const insert = db.prepare(
      "INSERT INTO saved_listings (id, user_id, listing_id, created_at) VALUES (?, ?, ?, ?)",
    );
    insert.run(newId("sav"), renter.id, older, "2026-11-01T12:00:00.000Z");
    insert.run(newId("sav"), renter.id, newer, "2026-11-02T12:00:00.000Z");

    const res = await savedTab();
    const ids = (res.body.results as Array<{ id: string }>).map((l) => l.id);
    assert.deepEqual(ids, [newer, older]);
  });

  it("only shows the signed-in renter's saves", async () => {
    await swipe("right");
    const someoneElse = seedUser("Sam Someone");
    const res = await savedTab(someoneElse.token);
    assert.deepEqual(res.body.results, []);
  });

  it("leaves out a listing the host has removed", async () => {
    await swipe("right");
    db.prepare("UPDATE listings SET status = 'removed' WHERE id = ?").run(listing);
    const res = await savedTab();
    assert.deepEqual(res.body.results, []);
  });

  it("DELETE /api/saved/:id removes the row, and the tab reflects it", async () => {
    await swipe("right");
    const res = await api(server, "DELETE", `/api/saved/${listing}`, { token: renter.token });
    assert.equal(res.status, 200);
    assert.equal(savedRows(renter.id, listing), 0);
    assert.deepEqual((await savedTab()).body.results, []);
  });

  it("requires sign-in", async () => {
    const res = await api(server, "GET", "/api/saved");
    assert.equal(res.status, 401);
  });
});
