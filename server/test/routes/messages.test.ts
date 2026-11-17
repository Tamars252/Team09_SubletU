/**
 * Messages: conversations, threads and per-user archive.
 *
 * One block per acceptance criterion:
 *   1. Start a conversation from a listing (FR-7.1), and both parties can
 *      read the thread and reply (FR-7.2).
 *   2. The unread badge: GET /messages/unread-count, which the web app polls
 *      every 20 s (FR-7.3). The polling itself is tested in web/test.
 *   3. Archiving hides the thread only for the person who archived it
 *      (FR-7.4, FR-7.5, usability finding F-4).
 *
 * Every test makes its own users and listing, so they never share a thread.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, seedListing, seedUser, startTestServer } from "../helpers/http.ts";
import type { TestServer } from "../helpers/http.ts";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

type User = { id: string; token: string };
type Thread = {
  id: string;
  listingId: string;
  listingStatus: string;
  role: string;
  archived: boolean;
  lastMessage: string | null;
  unread: number;
  other: { name: string };
};

/** A host, a renter and a listing of the host's, all new. */
function cast(): { host: User; renter: User; listingId: string } {
  const host = seedUser("Host");
  const renter = seedUser("Renter");
  return { host, renter, listingId: seedListing(host.id) };
}

function start(renter: User, listingId: string, body?: Record<string, unknown>) {
  return api(server, "POST", "/api/messages/conversations", {
    token: renter.token,
    body: { listingId, ...body },
  });
}

async function inbox(user: User, archived = false): Promise<Thread[]> {
  const res = await api(server, "GET", `/api/messages/conversations?archived=${archived}`, {
    token: user.token,
  });
  assert.equal(res.status, 200);
  return res.body.results as Thread[];
}

async function inboxIds(user: User, archived = false): Promise<string[]> {
  return (await inbox(user, archived)).map((t) => t.id);
}

function send(user: User, conversationId: string, body: string) {
  return api(server, "POST", `/api/messages/conversations/${conversationId}/messages`, {
    token: user.token,
    body: { body },
  });
}

function read(user: User, conversationId: string) {
  return api(server, "GET", `/api/messages/conversations/${conversationId}/messages`, {
    token: user.token,
  });
}

function archive(user: User, conversationId: string, archived = true) {
  return api(server, "POST", `/api/messages/conversations/${conversationId}/archive`, {
    token: user.token,
    body: { archived },
  });
}

async function unread(user: User): Promise<number> {
  const res = await api(server, "GET", "/api/messages/unread-count", { token: user.token });
  assert.equal(res.status, 200);
  return res.body.unread as number;
}

/* ------------------------------------------------------------ criterion 1 */

describe("starting a conversation from a listing", () => {
  it("creates the thread with the first message, using the contract's `body` field", async () => {
    const { host, renter, listingId } = cast();

    const res = await start(renter, listingId, { body: "Hi! Is this still free in June?" });

    assert.equal(res.status, 201);
    const id = res.body.conversationId as string;
    assert.match(id, /^cnv_/);

    const [mine] = await inbox(renter);
    assert.equal(mine.id, id);
    assert.equal(mine.role, "guest");
    assert.equal(mine.listingId, listingId);
    assert.equal(mine.lastMessage, "Hi! Is this still free in June?");
    assert.equal(mine.other.name, "Host");

    const [theirs] = await inbox(host);
    assert.equal(theirs.id, id);
    assert.equal(theirs.role, "host");
    assert.equal(theirs.unread, 1);
    assert.equal(theirs.other.name, "Renter");
  });

  it("still accepts the older `message` field", async () => {
    const { renter, listingId } = cast();
    const res = await start(renter, listingId, { message: "Sent the old way" });
    const thread = await read(renter, res.body.conversationId as string);
    const messages = thread.body.results as Array<{ body: string }>;
    assert.deepEqual(messages.map((m) => m.body), ["Sent the old way"]);
  });

  it("reuses the same thread when the renter writes about the same listing again", async () => {
    const { host, renter, listingId } = cast();
    const first = await start(renter, listingId, { body: "First" });
    const second = await start(renter, listingId, { body: "Second" });

    assert.equal(second.status, 200);
    assert.equal(second.body.conversationId, first.body.conversationId);
    assert.equal((await inbox(host)).length, 1);
    const messages = (await read(host, first.body.conversationId as string)).body.results as Array<{
      body: string;
    }>;
    assert.deepEqual(messages.map((m) => m.body), ["First", "Second"]);
  });

  it("does not show the host a thread that has no messages in it yet", async () => {
    const { host, renter, listingId } = cast();
    const res = await start(renter, listingId);

    assert.ok((await inboxIds(renter)).includes(res.body.conversationId as string));
    assert.deepEqual(await inboxIds(host), [], "no empty thread in the host's inbox");

    await send(renter, res.body.conversationId as string, "Now there is a message");
    assert.deepEqual(await inboxIds(host), [res.body.conversationId]);
  });

  it("refuses your own listing, an unknown or removed listing, and no token", async () => {
    const { host, renter, listingId } = cast();
    const removed = seedListing(host.id);
    db.prepare("UPDATE listings SET status = 'removed' WHERE id = ?").run(removed);

    assert.equal((await start(host, listingId, { body: "Hi" })).status, 400);
    assert.equal((await start(renter, "lst_does-not-exist", { body: "Hi" })).status, 404);
    assert.equal((await start(renter, removed, { body: "Hi" })).status, 404);
    const anonymous = await api(server, "POST", "/api/messages/conversations", {
      body: { listingId, body: "Hi" },
    });
    assert.equal(anonymous.status, 401);
  });
});

describe("reading and replying", () => {
  it("both sides read the thread oldest first, with their own messages marked", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Is it furnished?" })).body
      .conversationId as string;

    const reply = await send(host, id, "Yes, fully.");
    assert.equal(reply.status, 201);

    const forRenter = (await read(renter, id)).body.results as Array<{ body: string; mine: boolean }>;
    assert.deepEqual(
      forRenter.map((m) => [m.body, m.mine]),
      [
        ["Is it furnished?", true],
        ["Yes, fully.", false],
      ],
    );
    const forHost = (await read(host, id)).body;
    assert.equal((forHost.conversation as { role: string }).role, "host");
  });

  it("previews the newest message, even when two share a timestamp", async () => {
    const { renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "older" })).body.conversationId as string;
    const at = nowIso();
    for (const body of ["second", "newest"]) {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(newId("msg"), id, renter.id, body, at);
    }

    const [thread] = await inbox(renter);
    assert.equal(thread.lastMessage, "newest");
  });

  it("keeps working after the host removes the listing (FR-5.6)", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    db.prepare("UPDATE listings SET status = 'removed' WHERE id = ?").run(listingId);

    const [thread] = await inbox(renter);
    assert.equal(thread.listingStatus, "removed");
    assert.equal((await send(host, id, "Sorry, it's taken")).status, 201);
  });

  it("keeps other people out of the thread", async () => {
    const { renter, listingId } = cast();
    const stranger = seedUser("Stranger");
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;

    assert.equal((await read(stranger, id)).status, 403);
    assert.equal((await send(stranger, id, "Let me in")).status, 403);
    assert.equal((await archive(stranger, id)).status, 403);
    assert.equal((await read(renter, "cnv_does-not-exist")).status, 404);
  });

  it("refuses an empty reply", async () => {
    const { renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    assert.equal((await send(renter, id, "")).status, 400);
  });
});

/* ------------------------------------------------------------ criterion 2 */

describe("the unread count behind the badge", () => {
  it("counts the other party's unread messages and never your own", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "One" })).body.conversationId as string;
    await send(renter, id, "Two");

    assert.equal(await unread(host), 2);
    assert.equal(await unread(renter), 0);
  });

  it("drops to zero once the thread is opened", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "One" })).body.conversationId as string;

    await read(host, id);

    assert.equal(await unread(host), 0);
    const [thread] = await inbox(host);
    assert.equal(thread.unread, 0);
  });

  it("adds up across threads", async () => {
    const host = seedUser("Host");
    for (const name of ["A", "B"]) {
      const renter = seedUser(name);
      await start(renter, seedListing(host.id), { body: `From ${name}` });
    }
    assert.equal(await unread(host), 2);
  });

  it("matches the inbox: a thread you archived unread stops counting", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "One" })).body.conversationId as string;

    await archive(host, id);
    assert.equal(await unread(host), 0, "nothing to click in the inbox, so no badge");

    await archive(host, id, false);
    assert.equal(await unread(host), 1, "it counts again once it is back in the inbox");
  });

  it("requires a token", async () => {
    assert.equal((await api(server, "GET", "/api/messages/unread-count")).status, 401);
  });
});

/* ------------------------------------------------------------ criterion 3 */

describe("archiving hides the thread only for me", () => {
  it("moves the thread to my archive and leaves it in the other inbox", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;

    const res = await archive(renter, id);

    assert.deepEqual(res.body, { ok: true, archived: true });
    assert.ok(!(await inboxIds(renter)).includes(id));
    assert.ok((await inboxIds(renter, true)).includes(id));
    assert.ok((await inboxIds(host)).includes(id), "the host still sees it");
    assert.deepEqual(await inboxIds(host, true), []);
    assert.equal((await inbox(renter, true))[0].archived, true);
  });

  it("unarchiving puts it back in my inbox", async () => {
    const { renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    await archive(renter, id);

    const res = await archive(renter, id, false);

    assert.deepEqual(res.body, { ok: true, archived: false });
    assert.ok((await inboxIds(renter)).includes(id));
    assert.deepEqual(await inboxIds(renter, true), []);
  });

  it("archiving twice is harmless", async () => {
    const { renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    await archive(renter, id);
    assert.equal((await archive(renter, id)).status, 200);
    assert.deepEqual(await inboxIds(renter, true), [id]);
  });

  it("a reply from the other side brings it back to my inbox, but not a reply of my own", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    await archive(host, id);

    await send(host, id, "Writing from my archive");
    assert.ok(!(await inboxIds(host)).includes(id), "my own message leaves my archive alone");

    await send(renter, id, "Any update?");
    assert.ok((await inboxIds(host)).includes(id), "their new message is something to see");
  });

  it("opening the listing's thread again without writing does not touch the host's archive", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    await archive(host, id);
    await archive(renter, id);

    const again = await start(renter, listingId);

    assert.equal(again.body.conversationId, id);
    assert.ok((await inboxIds(renter)).includes(id), "the renter reached out, so it is back for them");
    assert.ok(!(await inboxIds(host)).includes(id), "nothing new arrived for the host");
    assert.ok((await inboxIds(host, true)).includes(id));
  });

  it("writing about the listing again does bring it back for the host", async () => {
    const { host, renter, listingId } = cast();
    const id = (await start(renter, listingId, { body: "Hello" })).body.conversationId as string;
    await archive(host, id);

    await start(renter, listingId, { body: "Still interested!" });

    assert.ok((await inboxIds(host)).includes(id));
  });
});
