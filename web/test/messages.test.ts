/**
 * TM09-104: the decisions behind the Messages screens — the 20-second unread
 * poll (AC2), composing, and the optimistic archive the inbox uses (AC3).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { Listing, Message } from "../src/api/types.ts";
import {
  MAX_MESSAGE_LENGTH,
  UNREAD_POLL_MS,
  canSend,
  formatMessageTime,
  isSendShortcut,
  otherPartyName,
  removeThread,
  restoreThread,
  startUnreadPoller,
  suggestedFirstMessage,
  threadPath,
  unreadLabel,
} from "../src/lib/messages.ts";

// Syracuse, so "today" and "yesterday" are deterministic wherever this runs.
process.env.TZ = "America/New_York";

/** Lets resolved promises run their callbacks. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/* ----------------------------------------------------- AC2: unread polling */

describe("the unread poller", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval"] }));
  afterEach(() => mock.timers.reset());

  it("polls every 20 seconds", () => {
    assert.equal(UNREAD_POLL_MS, 20_000);
  });

  it("asks once straight away, then again on every 20-second tick", async () => {
    const fetchCount = mock.fn(async () => 2);
    const seen: number[] = [];
    const poller = startUnreadPoller(fetchCount, (n) => seen.push(n));

    assert.equal(fetchCount.mock.callCount(), 1, "first request at start, not after 20 s");
    await settle();

    mock.timers.tick(19_999);
    assert.equal(fetchCount.mock.callCount(), 1, "nothing before 20 s");
    mock.timers.tick(1);
    assert.equal(fetchCount.mock.callCount(), 2);
    await settle();
    mock.timers.tick(20_000);
    assert.equal(fetchCount.mock.callCount(), 3);
    await settle();

    assert.deepEqual(seen, [2, 2, 2]);
    poller.stop();
  });

  it("stops polling when stopped, and ignores an answer that lands afterwards", async () => {
    let answer: (n: number) => void = () => undefined;
    const fetchCount = mock.fn(() => new Promise<number>((resolve) => (answer = resolve)));
    const seen: number[] = [];
    const poller = startUnreadPoller(fetchCount, (n) => seen.push(n));

    poller.stop();
    answer(5);
    await settle();
    mock.timers.tick(60_000);

    assert.equal(fetchCount.mock.callCount(), 1);
    assert.deepEqual(seen, [], "a signed-out shell must not set a badge");
  });

  it("never runs two requests at once", async () => {
    let answer: (n: number) => void = () => undefined;
    const fetchCount = mock.fn(() => new Promise<number>((resolve) => (answer = resolve)));
    const poller = startUnreadPoller(fetchCount, () => undefined);

    mock.timers.tick(20_000);
    void poller.refresh();
    assert.equal(fetchCount.mock.callCount(), 1, "the slow first request is reused");

    answer(1);
    await settle();
    void poller.refresh();
    assert.equal(fetchCount.mock.callCount(), 2, "a new one starts once it has landed");
    poller.stop();
  });

  it("keeps the last count when a request fails", async () => {
    const answers = [3, new Error("offline"), 1];
    const fetchCount = mock.fn(async () => {
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next as number;
    });
    const seen: number[] = [];
    const poller = startUnreadPoller(fetchCount, (n) => seen.push(n));

    await settle();
    mock.timers.tick(20_000);
    await settle();
    mock.timers.tick(20_000);
    await settle();

    assert.deepEqual(seen, [3, 1], "the failure did not reset the badge to 0");
    poller.stop();
  });

  it("refresh() asks immediately, between ticks", async () => {
    const fetchCount = mock.fn(async () => 0);
    const poller = startUnreadPoller(fetchCount, () => undefined);
    await settle();

    await poller.refresh();

    assert.equal(fetchCount.mock.callCount(), 2);
    poller.stop();
  });

  it("labels the badge for screen readers", () => {
    assert.equal(unreadLabel(0), null);
    assert.equal(unreadLabel(1), "1 unread message");
    assert.equal(unreadLabel(4), "4 unread messages");
  });
});

/* ------------------------------------------------------------- composing */

const listing = {
  id: "lst_1",
  title: "Sunny room on Ackerman",
  address: "910 Ackerman Ave",
  pricing: { availableFrom: "2026-05-15", availableTo: "2026-08-15" },
  owner: { name: "Daniel R." },
} as unknown as Listing;

function message(body: string, mine: boolean, senderName?: string): Message {
  return { id: body, senderId: mine ? "me" : "them", senderName, body, createdAt: "", readAt: null, mine };
}

describe("composing", () => {
  it("starts the first message with the listing and its exact dates", () => {
    assert.equal(
      suggestedFirstMessage(listing),
      "Hi! Is 910 Ackerman Ave still available from May 15, 2026 to Aug 15, 2026?",
    );
  });

  it("asks without dates when the listing has none, and uses the title without an address", () => {
    const bare = { ...listing, address: "", pricing: null } as unknown as Listing;
    assert.equal(suggestedFirstMessage(bare), "Hi! Is Sunny room on Ackerman still available?");
  });

  it("only sends something the server will accept", () => {
    assert.equal(canSend("   \n "), false);
    assert.equal(canSend(" hi "), true);
    assert.equal(canSend("x".repeat(MAX_MESSAGE_LENGTH)), true);
    assert.equal(canSend("x".repeat(MAX_MESSAGE_LENGTH + 1)), false);
  });

  it("sends on Enter, not on Shift+Enter, and not while an input method is composing", () => {
    assert.equal(isSendShortcut({ key: "Enter", shiftKey: false }), true);
    assert.equal(isSendShortcut({ key: "Enter", shiftKey: true }), false);
    assert.equal(isSendShortcut({ key: "Enter", shiftKey: false, isComposing: true }), false);
    assert.equal(isSendShortcut({ key: "Enter", shiftKey: false, keyCode: 229 }), false);
    assert.equal(isSendShortcut({ key: "a", shiftKey: false }), false);
  });

  it("names the other party from their messages, then from the listing owner", () => {
    assert.equal(otherPartyName("host", null, [message("hi", false, "Maya O.")]), "Maya O.");
    assert.equal(otherPartyName("guest", listing, [message("hi", true, "Me")]), "Daniel R.");
    assert.equal(otherPartyName("guest", null, []), "Host");
    assert.equal(otherPartyName("host", null, []), "Renter");
  });

  it("escapes the conversation id in its path", () => {
    assert.equal(threadPath("cnv_abc"), "/messages/cnv_abc");
    assert.equal(threadPath("a/b"), "/messages/a%2Fb");
  });
});

describe("message times", () => {
  const now = new Date("2026-11-17T21:00:00Z"); // 4:00 PM in Syracuse

  it("shows the time today, then Yesterday, then the weekday, then the date", () => {
    assert.equal(formatMessageTime("2026-11-17T14:05:00Z", now), "9:05 AM");
    assert.equal(formatMessageTime("2026-11-16T23:00:00Z", now), "Yesterday");
    assert.equal(formatMessageTime("2026-11-13T15:00:00Z", now), "Fri");
    assert.equal(formatMessageTime("2026-11-03T15:00:00Z", now), "Nov 3");
    assert.equal(formatMessageTime("2025-12-24T15:00:00Z", now), "Dec 24, 2025");
  });

  it("uses the reader's day, not UTC's", () => {
    // 03:30 UTC on the 17th is still the evening of the 16th in Syracuse.
    assert.equal(formatMessageTime("2026-11-17T03:30:00Z", now), "Yesterday");
  });

  it("shows nothing for a timestamp it cannot read", () => {
    assert.equal(formatMessageTime("not a date", now), "");
  });
});

/* --------------------------------------------------- AC3: archive in the UI */

describe("optimistic archiving", () => {
  const threads = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("takes the thread out straight away, and can put it back where it was", () => {
    const removal = removeThread(threads, "b");
    assert.ok(removal);
    assert.deepEqual(removal.next.map((t) => t.id), ["a", "c"]);
    assert.deepEqual(restoreThread(removal.next, removal).map((t) => t.id), ["a", "b", "c"]);
  });

  it("does nothing for an id that is not there, and never duplicates on restore", () => {
    assert.equal(removeThread(threads, "zzz"), null);
    const removal = removeThread(threads, "b")!;
    assert.deepEqual(restoreThread(threads, removal).map((t) => t.id), ["a", "b", "c"]);
  });
});
