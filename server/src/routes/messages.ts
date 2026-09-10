import { Router } from "express";
import { db, nowIso, transaction } from "../db.ts";
import { ListingData } from "../domain/ListingData.ts";
import { newId } from "../lib/crypto.ts";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  optionalString,
  requireString,
  toBool,
} from "../lib/http.ts";
import { currentUser, requireAuth } from "../middleware/auth.ts";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

type ConversationRow = {
  id: string;
  listing_id: string;
  guest_id: string;
  host_id: string;
  created_at: string;
  last_message_at: string;
};

function loadConversation(id: string, userId: string): ConversationRow {
  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | ConversationRow
    | undefined;
  if (!row) throw notFound("Conversation not found");
  if (row.guest_id !== userId && row.host_id !== userId) {
    throw forbidden("You are not part of this conversation");
  }
  return row;
}

function otherParty(row: ConversationRow, userId: string): string {
  return row.guest_id === userId ? row.host_id : row.guest_id;
}

/** Start (or reopen) a thread with a listing's host. */
messagesRouter.post(
  "/conversations",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const listingId = requireString(body, "listingId", { min: 3, max: 64 });
    const firstMessage = optionalString(body, "message", "", 2000);

    const listing = ListingData.retrieveById(listingId);
    if (!listing || listing.status === "removed") throw notFound("Listing not found");
    if (listing.ownerId === user.id) throw badRequest("This is your own listing");

    const at = nowIso();
    const existing = db
      .prepare("SELECT * FROM conversations WHERE listing_id = ? AND guest_id = ?")
      .get(listingId, user.id) as ConversationRow | undefined;

    const conversationId = existing?.id ?? newId("cnv");

    transaction(() => {
      if (!existing) {
        db.prepare(
          `INSERT INTO conversations (id, listing_id, guest_id, host_id, created_at, last_message_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(conversationId, listingId, user.id, listing.ownerId, at, at);
      }
      if (firstMessage) {
        db.prepare(
          `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(newId("msg"), conversationId, user.id, firstMessage, at);
        db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(
          at,
          conversationId,
        );
      }
      // Reaching out un-archives the thread for both sides.
      db.prepare("DELETE FROM conversation_state WHERE conversation_id = ?").run(conversationId);
    });

    res.status(existing ? 200 : 201).json({ conversationId });
  }),
);

messagesRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const archived = toBool(req.query.archived, false);

    const rows = db
      .prepare(
        `SELECT c.id, c.listing_id, c.guest_id, c.host_id, c.created_at, c.last_message_at,
                COALESCE(cs.archived, 0) AS archived,
                l.title AS listing_title, l.status AS listing_status,
                (SELECT file_url FROM photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1)
                  AS listing_photo,
                (SELECT monthly_rent FROM pricing WHERE listing_id = l.id) AS monthly_rent,
                u.name AS other_name, u.avatar_initials AS other_initials,
                u.verified AS other_verified, u.university AS other_university,
                (SELECT body FROM messages WHERE conversation_id = c.id
                  ORDER BY created_at DESC LIMIT 1) AS last_body,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id
                  AND sender_id <> ? AND read_at IS NULL) AS unread
         FROM conversations c
         JOIN listings l ON l.id = c.listing_id
         JOIN users u ON u.id = CASE WHEN c.guest_id = ? THEN c.host_id ELSE c.guest_id END
         LEFT JOIN conversation_state cs ON cs.conversation_id = c.id AND cs.user_id = ?
         WHERE (c.guest_id = ? OR c.host_id = ?)
           AND COALESCE(cs.archived, 0) = ?
         ORDER BY c.last_message_at DESC`,
      )
      .all(user.id, user.id, user.id, user.id, user.id, archived ? 1 : 0) as Array<
      Record<string, unknown>
    >;

    res.json({
      results: rows.map((row) => ({
        id: row.id,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        listingStatus: row.listing_status,
        listingPhoto: row.listing_photo,
        monthlyRent: row.monthly_rent,
        role: row.guest_id === user.id ? "guest" : "host",
        archived: row.archived === 1,
        lastMessage: row.last_body ?? null,
        lastMessageAt: row.last_message_at,
        unread: row.unread,
        other: {
          name: row.other_name,
          initials: row.other_initials,
          verified: row.other_verified === 1,
          university: row.other_university,
        },
      })),
    });
  }),
);

messagesRouter.get(
  "/conversations/:id/messages",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const convo = loadConversation(req.params.id, user.id);

    // Opening the thread marks the other side's messages read.
    db.prepare(
      `UPDATE messages SET read_at = ?
       WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`,
    ).run(nowIso(), convo.id, user.id);

    const rows = db
      .prepare(
        `SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at, u.name AS sender_name
         FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? ORDER BY m.created_at, m.rowid`,
      )
      .all(convo.id) as Array<Record<string, unknown>>;

    const listing = ListingData.retrieveById(convo.listing_id);

    res.json({
      conversation: {
        id: convo.id,
        listingId: convo.listing_id,
        role: convo.guest_id === user.id ? "guest" : "host",
        listing: listing ? listing.toJSON() : null,
      },
      results: rows.map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        body: row.body,
        createdAt: row.created_at,
        readAt: row.read_at,
        mine: row.sender_id === user.id,
      })),
    });
  }),
);

messagesRouter.post(
  "/conversations/:id/messages",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const convo = loadConversation(req.params.id, user.id);
    const body = requireString(req.body as Record<string, unknown>, "body", {
      min: 1,
      max: 2000,
    });

    const at = nowIso();
    const id = newId("msg");
    transaction(() => {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, convo.id, user.id, body, at);
      db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(at, convo.id);
      // A new message pulls the thread out of the recipient's archive.
      db.prepare(
        "DELETE FROM conversation_state WHERE conversation_id = ? AND user_id = ?",
      ).run(convo.id, otherParty(convo, user.id));
    });

    res.status(201).json({
      message: { id, senderId: user.id, body, createdAt: at, mine: true, readAt: null },
    });
  }),
);

/** Archive / unarchive is per-user, matching the swipe-to-archive UI. */
messagesRouter.post(
  "/conversations/:id/archive",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const convo = loadConversation(req.params.id, user.id);
    const archived = toBool((req.body as Record<string, unknown>).archived, true);

    if (archived) {
      db.prepare(
        `INSERT INTO conversation_state (conversation_id, user_id, archived)
         VALUES (?, ?, 1)
         ON CONFLICT(conversation_id, user_id) DO UPDATE SET archived = 1`,
      ).run(convo.id, user.id);
    } else {
      db.prepare(
        "DELETE FROM conversation_state WHERE conversation_id = ? AND user_id = ?",
      ).run(convo.id, user.id);
    }

    res.json({ ok: true, archived });
  }),
);

messagesRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE (c.guest_id = ? OR c.host_id = ?) AND m.sender_id <> ? AND m.read_at IS NULL`,
      )
      .get(user.id, user.id, user.id) as { n: number };
    res.json({ unread: row.n });
  }),
);
