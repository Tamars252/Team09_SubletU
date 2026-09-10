import { Router } from "express";
import { db, nowIso } from "../db.ts";
import { ListingData } from "../domain/ListingData.ts";
import { newId } from "../lib/crypto.ts";
import { asyncHandler, notFound, requireString } from "../lib/http.ts";
import { currentUser, requireAuth } from "../middleware/auth.ts";

export const savedRouter = Router();

savedRouter.use(requireAuth);

savedRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const rows = db
      .prepare(
        `SELECT s.listing_id, s.created_at
         FROM saved_listings s
         JOIN listings l ON l.id = s.listing_id
         WHERE s.user_id = ? AND l.status <> 'removed'
         ORDER BY s.created_at DESC`,
      )
      .all(user.id) as Array<{ listing_id: string; created_at: string }>;

    const results = rows
      .map((row) => {
        const listing = ListingData.retrieveById(row.listing_id);
        if (!listing) return null;
        listing.setDistanceFromCampus(user.university);
        return { ...listing.toJSON(), saved: true, savedAt: row.created_at };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    res.json({ results });
  }),
);

savedRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const listingId = requireString(req.body as Record<string, unknown>, "listingId", {
      min: 3,
      max: 64,
    });
    const listing = ListingData.retrieveById(listingId);
    if (!listing || listing.status === "removed") throw notFound("Listing not found");

    db.prepare(
      `INSERT OR IGNORE INTO saved_listings (id, user_id, listing_id, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(newId("sav"), user.id, listingId, nowIso());

    res.status(201).json({ ok: true, saved: true });
  }),
);

savedRouter.delete(
  "/:listingId",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    db.prepare("DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?").run(
      user.id,
      req.params.listingId,
    );
    // Also clear the right-swipe so the listing can come back around in the deck.
    db.prepare(
      "DELETE FROM swipes WHERE user_id = ? AND listing_id = ? AND direction = 'right'",
    ).run(user.id, req.params.listingId);
    res.json({ ok: true, saved: false });
  }),
);
