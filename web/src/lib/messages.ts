/**
 * TM09-104: every decision the Messages screens make, kept apart from the
 * components that render them so it can be tested without a DOM — the same
 * split as lib/saved.ts.
 *
 * Nothing here touches React or `fetch`. The poller uses the global timers,
 * which the tests replace with node:test's mock timers.
 */
import type { Listing, Message } from "../api/types.ts";
import { MESSAGES_PATH } from "../auth/guard.ts";
import { formatDay } from "./saved.ts";

/** One thread. */
export function threadPath(conversationId: string): string {
  return `${MESSAGES_PATH}/${encodeURIComponent(conversationId)}`;
}

/** The query value that switches the inbox to the archived list. */
export const ARCHIVED_VIEW = "archived";

/** Matches the server's limit on POST /messages/conversations/:id/messages. */
export const MAX_MESSAGE_LENGTH = 2000;

/* ------------------------------------------------------------ unread badge */

/** AC2: how often the Messages tab asks for the unread count. */
export const UNREAD_POLL_MS = 20_000;

export type UnreadPoller = {
  /** Ask now, e.g. after a thread was opened and its messages marked read. */
  refresh: () => Promise<void>;
  /** Stop polling. A request already in flight is ignored when it lands. */
  stop: () => void;
};

/**
 * Polls the unread count: once straight away, then every UNREAD_POLL_MS.
 *
 * - A request still in flight is reused, not doubled. On a slow connection a
 *   tick and a refresh() would otherwise race and could land out of order.
 * - A failed request keeps the last count. One dropped request must not make
 *   the badge flicker off; a 401 signs the person out anyway, which unmounts
 *   the shell and stops the poller.
 */
export function startUnreadPoller(
  fetchCount: () => Promise<number>,
  onCount: (count: number) => void,
  intervalMs: number = UNREAD_POLL_MS,
): UnreadPoller {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = fetchCount()
      .then((count) => {
        if (!stopped && Number.isInteger(count) && count >= 0) onCount(count);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const timer = setInterval(() => void refresh(), intervalMs);
  void refresh();

  return {
    refresh,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/** What a screen reader hears on the Messages tab, or null when nothing is unread. */
export function unreadLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 unread message" : `${count} unread messages`;
}

/* --------------------------------------------------------------- composing */

/** A message the server will accept: something other than whitespace, within the limit. */
export function canSend(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH;
}

/**
 * Enter sends, Shift+Enter starts a new line. Enter while an input method is
 * composing (Chinese, Japanese, Korean…) is confirming a character, not
 * sending, so it is left alone.
 */
export function isSendShortcut(event: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false;
  // Safari reports keyCode 229 instead of isComposing for the confirming Enter.
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}

/**
 * The text the "Message host" sheet starts with, so a renter can send in one
 * tap. It asks the question every renter asks first: the exact dates.
 */
export function suggestedFirstMessage(listing: Listing): string {
  const place = listing.address?.trim() || listing.title;
  const from = formatDay(listing.pricing?.availableFrom);
  const to = formatDay(listing.pricing?.availableTo);
  if (from && to) return `Hi! Is ${place} still available from ${from} to ${to}?`;
  return `Hi! Is ${place} still available?`;
}

/**
 * Who the thread is with, for its header. The messages endpoint does not name
 * the other party, so this reads it from their messages, then from the
 * listing's owner when the caller is the renter.
 */
export function otherPartyName(
  role: string,
  listing: Listing | null,
  messages: readonly Message[],
): string {
  const fromThem = messages.find((m) => !m.mine && m.senderName);
  if (fromThem?.senderName) return fromThem.senderName;
  if (role === "guest" && listing?.owner?.name) return listing.owner.name;
  return role === "guest" ? "Host" : "Renter";
}

/* ------------------------------------------------------------------- times */

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A message's time the way a phone inbox shows it: "3:42 PM" today,
 * "Yesterday", the weekday within the last week, then the date. Local time,
 * because "today" means the reader's today.
 */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);

  if (days <= 0) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/* --------------------------------------------------- optimistic archiving */

export type ThreadRemoval<T> = { next: T[]; removed: T; index: number };

/** Takes a thread out of the list straight away, before the server answers. */
export function removeThread<T extends { id: string }>(
  list: readonly T[],
  id: string,
): ThreadRemoval<T> | null {
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const next = list.slice();
  const [removed] = next.splice(index, 1);
  return { next, removed, index };
}

/** Puts it back where it was if the archive request failed. */
export function restoreThread<T extends { id: string }>(
  list: readonly T[],
  removal: ThreadRemoval<T>,
): T[] {
  if (list.some((item) => item.id === removal.removed.id)) return list.slice();
  const next = list.slice();
  next.splice(Math.min(removal.index, next.length), 0, removal.removed);
  return next;
}
