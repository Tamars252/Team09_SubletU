import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { TestApi, listingPayload, seedDefaultGeocodes } from "../helpers/api.ts";

type Listing = { id: string; title: string };
type Deck = { remaining: number; results: Listing[] };
type Saved = { results: Array<{ id: string }> };

let api: TestApi;
/** A second account that owns listings, so the first can swipe on them. */
let hostToken: string;

before(async () => {
  api = await TestApi.start();
  seedDefaultGeocodes();
  hostToken = (await api.registerUser({ name: "Host Student" })).token;
});
after(async () => {
  await api.close();
});

async function postListing(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api.post<{ listing: Listing }>(
    "/api/listings",
    listingPayload(overrides),
    hostToken,
  );
  assert.equal(res.status, 201, `listing create failed: ${JSON.stringify(res.body)}`);
  return res.body.listing.id;
}

const savedIds = async (token: string) =>
  (await api.get<Saved>("/api/saved", token)).body.results.map((l) => l.id);
const deckIds = async (token: string) =>
  (await api.get<Deck>("/api/listings/deck", token)).body.results.map((l) => l.id);

/**
 * The invariant the README claims: "the deck, the Saved tab and the map's saved
 * state all read from the same swipes / saved_listings tables, so they can't
 * disagree." These tests are what hold that claim to account.
 */
describe("swiping right saves", () => {
  it("adds the listing to Saved and removes it from the deck", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    assert.ok((await deckIds(renter.token)).includes(listingId));

    const swipe = await api.post<{ saved: boolean }>(
      "/api/swipes",
      { listingId, direction: "right" },
      renter.token,
    );
    assert.equal(swipe.status, 201);
    assert.equal(swipe.body.saved, true);

    assert.ok((await savedIds(renter.token)).includes(listingId));
    assert.ok(!(await deckIds(renter.token)).includes(listingId));
  });

  it("is idempotent — swiping right twice saves once", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);
    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);

    const saved = await savedIds(renter.token);
    assert.equal(saved.filter((id) => id === listingId).length, 1);
  });
});

describe("swiping left passes", () => {
  it("removes the listing from the deck without saving it", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "left" }, renter.token);

    assert.ok(!(await savedIds(renter.token)).includes(listingId));
    assert.ok(!(await deckIds(renter.token)).includes(listingId));
  });

  it("un-saves a listing that had been swiped right", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);
    assert.ok((await savedIds(renter.token)).includes(listingId));

    await api.post("/api/swipes", { listingId, direction: "left" }, renter.token);
    assert.ok(!(await savedIds(renter.token)).includes(listingId));
  });
});

describe("unsaving from the Saved tab", () => {
  it("clears the right-swipe so the listing returns to the deck", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);
    assert.ok(!(await deckIds(renter.token)).includes(listingId));

    const res = await api.delete(`/api/saved/${listingId}`, renter.token);
    assert.equal(res.status, 200);

    assert.ok(!(await savedIds(renter.token)).includes(listingId));
    assert.ok((await deckIds(renter.token)).includes(listingId), "should come back around");
  });
});

describe("undo", () => {
  it("restores the listing to the deck and drops the save", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);
    const undo = await api.post<{ ok: boolean }>("/api/swipes/undo", {}, renter.token);
    assert.equal(undo.body.ok, true);

    assert.ok(!(await savedIds(renter.token)).includes(listingId));
    assert.ok((await deckIds(renter.token)).includes(listingId));
  });

  it("reports nothing to undo on a fresh account", async () => {
    const renter = await api.registerUser();
    const undo = await api.post<{ ok: boolean }>("/api/swipes/undo", {}, renter.token);
    assert.equal(undo.body.ok, false);
  });
});

describe("reset browsing", () => {
  it("restores the deck and keeps saves by default", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);
    await api.delete("/api/swipes", renter.token);

    assert.ok((await deckIds(renter.token)).includes(listingId));
    assert.ok((await savedIds(renter.token)).includes(listingId), "saves survive a reset");
  });

  it("drops saves too when asked", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, renter.token);
    await api.delete("/api/swipes?keepSaved=false", renter.token);

    assert.ok(!(await savedIds(renter.token)).includes(listingId));
  });
});

describe("swipe guards", () => {
  it("refuses a swipe on your own listing", async () => {
    const listingId = await postListing();
    const res = await api.post<{ error: string }>(
      "/api/swipes",
      { listingId, direction: "right" },
      hostToken,
    );
    assert.equal(res.status, 400);
    assert.match(res.body.error, /your own listing/i);
  });

  it("never puts your own listing in your deck", async () => {
    const listingId = await postListing();
    assert.ok(!(await deckIds(hostToken)).includes(listingId));
  });

  it("rejects an unknown listing and an invalid direction", async () => {
    const renter = await api.registerUser();
    const listingId = await postListing();

    assert.equal(
      (await api.post("/api/swipes", { listingId: "lst_nope", direction: "right" }, renter.token))
        .status,
      404,
    );
    assert.equal(
      (await api.post("/api/swipes", { listingId, direction: "sideways" }, renter.token)).status,
      400,
    );
  });

  it("keeps swipe state separate per user", async () => {
    const a = await api.registerUser();
    const b = await api.registerUser();
    const listingId = await postListing();

    await api.post("/api/swipes", { listingId, direction: "right" }, a.token);

    assert.ok((await savedIds(a.token)).includes(listingId));
    assert.ok(!(await savedIds(b.token)).includes(listingId), "B must not see A's saves");
    assert.ok((await deckIds(b.token)).includes(listingId), "B's deck is unaffected");
  });
});

describe("swipe stats", () => {
  it("counts likes and passes", async () => {
    const renter = await api.registerUser();
    const liked = await postListing();
    const passed = await postListing({ title: "Passed listing" });

    await api.post("/api/swipes", { listingId: liked, direction: "right" }, renter.token);
    await api.post("/api/swipes", { listingId: passed, direction: "left" }, renter.token);

    const stats = await api.get<{ likes: number; passes: number; total: number }>(
      "/api/swipes/stats",
      renter.token,
    );
    assert.equal(stats.body.likes, 1);
    assert.equal(stats.body.passes, 1);
    assert.equal(stats.body.total, 2);
  });

  it("reports zeroes rather than nulls on a fresh account", async () => {
    const renter = await api.registerUser();
    const stats = await api.get<{ likes: number; passes: number; total: number }>(
      "/api/swipes/stats",
      renter.token,
    );
    assert.equal(stats.body.likes, 0);
    assert.equal(stats.body.passes, 0);
    assert.equal(stats.body.total, 0);
  });
});

/**
 * Saving from the listing detail screen goes through POST /api/saved, which
 * writes to saved_listings but records no swipe. The deck filters on the
 * swipes table alone, so the listing a user just saved stays in their deck —
 * and a later left-swipe silently deletes the save.
 *
 * These are marked `todo` because they describe the behaviour the README
 * promises, not the behaviour the code currently has. Flip them to real tests
 * with the fix.
 */
describe("saving from the listing detail screen", () => {
  it(
    "removes the listing from the deck, like a right-swipe does",
    { todo: "POST /api/saved records no swipe, so the deck still shows the listing" },
    async () => {
      const renter = await api.registerUser();
      const listingId = await postListing();

      await api.post("/api/saved", { listingId }, renter.token);

      assert.ok((await savedIds(renter.token)).includes(listingId));
      assert.ok(!(await deckIds(renter.token)).includes(listingId));
    },
  );

  it(
    "is not silently undone by a later left-swipe",
    { todo: "left-swipe deletes the saved_listings row written by POST /api/saved" },
    async () => {
      const renter = await api.registerUser();
      const listingId = await postListing();

      await api.post("/api/saved", { listingId }, renter.token);
      await api.post("/api/swipes", { listingId, direction: "left" }, renter.token);

      assert.ok((await savedIds(renter.token)).includes(listingId));
    },
  );
});
