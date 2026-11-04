import { Router } from "express";
import { db, nowIso, transaction } from "../db.ts";
import { DECK_EXCLUSIONS_SQL, ListingData } from "../domain/ListingData.ts";
import { newId } from "../lib/crypto.ts";
import { asyncHandler, badRequest, notFound, requireString } from "../lib/http.ts";
import { currentUser, requireAuth } from "../middleware/auth.ts";

export const swipesRouter = Router();

swipesRouter.use(requireAuth);

const countDeck = db.prepare(
  `SELECT COUNT(*) AS n FROM listings l WHERE l.status = 'active' AND ${DECK_EXCLUSIONS_SQL}`,
);

/** How many listings are left in this renter's deck, counted the way the deck is built. */
function deckRemaining(userId: string): number {
  return (countDeck.get(userId, userId, userId) as { n: number }).n;
}

/**
 * Record a swipe. Right also saves the listing, which is what makes the deck
 * and the Saved tab agree with each other.
 */
swipesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const listingId = requireString(body, "listingId", { min: 3, max: 64 });
    const direction = requireString(body, "direction", { min: 4, max: 5 });
    if (direction !== "left" && direction !== "right") {
      throw badRequest('direction must be "left" or "right"');
    }

    const listing = ListingData.retrieveById(listingId);
    if (!listing || listing.status === "removed") throw notFound("Listing not found");
    if (listing.ownerId === user.id) throw badRequest("You cannot swipe on your own listing");

    const at = nowIso();
    transaction(() => {
      db.prepare(
        `INSERT INTO swipes (id, user_id, listing_id, direction, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, listing_id) DO UPDATE SET
           direction = excluded.direction, created_at = excluded.created_at`,
      ).run(newId("swp"), user.id, listingId, direction, at);

      if (direction === "right") {
        db.prepare(
          `INSERT OR IGNORE INTO saved_listings (id, user_id, listing_id, created_at)
           VALUES (?, ?, ?, ?)`,
        ).run(newId("sav"), user.id, listingId, at);
      } else {
        db.prepare("DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?").run(
          user.id,
          listingId,
        );
      }
    });

    res.status(201).json({
      ok: true,
      direction,
      saved: direction === "right",
      remaining: deckRemaining(user.id),
    });
  }),
);

/** Undo the most recent swipe — the "rewind" button on the deck. */
swipesRouter.post(
  "/undo",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    // Only a swipe on a listing that is still active can be undone: anything
    // else could not go back into the deck, so the card would be a dead end.
    const last = db
      .prepare(
        `SELECT s.id, s.listing_id, s.direction FROM swipes s
         JOIN listings l ON l.id = s.listing_id
         WHERE s.user_id = ? AND l.status = 'active'
         ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1`,
      )
      .get(user.id) as { id: string; listing_id: string; direction: string } | undefined;
    if (!last) {
      res.json({ ok: false, message: "Nothing to undo" });
      return;
    }

    transaction(() => {
      db.prepare("DELETE FROM swipes WHERE id = ?").run(last.id);
      // Undoing a right swipe takes back the save it made. Undoing a pass must
      // not touch the Saved tab.
      if (last.direction === "right") {
        db.prepare("DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?").run(
          user.id,
          last.listing_id,
        );
      }
    });

    const listing = ListingData.retrieveById(last.listing_id);
    listing?.setDistanceFromCampus(user.university);
    res.json({ ok: true, listing: listing?.toJSON() ?? null });
  }),
);

/** "Reset browsing" — clears swipe history so the whole deck comes back. */
swipesRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    // Per docs/api-contract.md: no query is a full reset, and ?keepSaved=true
    // clears only the passes. Right swipes stay with their saves, so a saved
    // listing keeps its like and stays out of the deck.
    const keepSaved = req.query.keepSaved === "true";
    transaction(() => {
      if (keepSaved) {
        db.prepare("DELETE FROM swipes WHERE user_id = ? AND direction = 'left'").run(user.id);
      } else {
        db.prepare("DELETE FROM swipes WHERE user_id = ?").run(user.id);
        db.prepare("DELETE FROM saved_listings WHERE user_id = ?").run(user.id);
      }
    });
    res.json({ ok: true, keptSaved: keepSaved });
  }),
);

swipesRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN direction = 'right' THEN 1 ELSE 0 END) AS likes,
           SUM(CASE WHEN direction = 'left'  THEN 1 ELSE 0 END) AS passes,
           COUNT(*) AS total
         FROM swipes WHERE user_id = ?`,
      )
      .get(user.id) as { likes: number | null; passes: number | null; total: number };
    res.json({
      likes: row.likes ?? 0,
      passes: row.passes ?? 0,
      total: row.total ?? 0,
      remaining: deckRemaining(user.id),
    });
  }),
);
