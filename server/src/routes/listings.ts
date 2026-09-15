import { Router } from "express";
import type { Request } from "express";
import { db } from "../db.ts";
import { ListingData } from "../domain/ListingData.ts";
import type { ListingFilter, ListingSort } from "../domain/ListingData.ts";
import { ListingManager } from "../domain/ListingManager.ts";
import { PhotoData } from "../domain/PhotoData.ts";
import { CAMPUS_ANCHORS } from "../lib/geocode.ts";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  optionalNumber,
  optionalString,
  requireDate,
  requireNumber,
  requireString,
  toBool,
} from "../lib/http.ts";
import { currentUser, requireAuth, requireVerified } from "../middleware/auth.ts";

export const listingsRouter = Router();

const SORTS: ListingSort[] = [
  "newest",
  "price_asc",
  "price_desc",
  "distance",
  "available_soonest",
];

function num(value: unknown): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseFilter(req: Request): { filter: ListingFilter; sort: ListingSort } {
  const q = req.query as Record<string, string | undefined>;

  const filter: ListingFilter = {
    q: q.q?.trim() || undefined,
    minPrice: num(q.minPrice),
    maxPrice: num(q.maxPrice),
    minBedrooms: num(q.minBedrooms),
    minBathrooms: num(q.minBathrooms),
    petsAllowed: q.petsAllowed === undefined ? undefined : toBool(q.petsAllowed),
    furnished: q.furnished === undefined ? undefined : toBool(q.furnished),
    utilitiesIncluded:
      q.utilitiesIncluded === undefined ? undefined : toBool(q.utilitiesIncluded),
    amenities: q.amenities
      ? q.amenities.split(",").map((a) => a.trim()).filter(Boolean)
      : undefined,
    availableFrom: q.availableFrom || undefined,
    availableTo: q.availableTo || undefined,
    radiusMiles: num(q.radiusMiles),
  };

  if (q.bbox) {
    const parts = q.bbox.split(",").map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
      throw badRequest("bbox must be minLng,minLat,maxLng,maxLat");
    }
    const [minLng, minLat, maxLng, maxLat] = parts;
    filter.bbox = { minLng, minLat, maxLng, maxLat };
  }

  // Distance anchor: explicit lat/lng, else a named campus, else the viewer's campus.
  const lat = num(q.lat);
  const lng = num(q.lng);
  if (lat !== undefined && lng !== undefined) {
    filter.near = { lat, lng };
  } else {
    const campus = q.campus || req.user?.university || "Syracuse University";
    const anchor = CAMPUS_ANCHORS[campus];
    if (anchor) filter.near = anchor;
  }

  const sortParam = (q.sort ?? "newest") as ListingSort;
  const sort = SORTS.includes(sortParam) ? sortParam : "newest";
  return { filter, sort };
}

function readListingBody(body: Record<string, unknown>) {
  const photoDataUrls = Array.isArray(body.photos)
    ? (body.photos as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  if (photoDataUrls.length > 10) throw badRequest("A listing can have at most 10 photos");

  const amenities = Array.isArray(body.amenities)
    ? (body.amenities as unknown[])
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 30)
    : [];

  return {
    title: requireString(body, "title", { min: 4, max: 120 }),
    address: requireString(body, "address", { min: 5, max: 200 }),
    city: optionalString(body, "city", "Syracuse", 80),
    state: optionalString(body, "state", "NY", 2).toUpperCase(),
    zip: optionalString(body, "zip", "", 10),
    description: requireString(body, "description", { min: 20, max: 4000 }),
    monthlyRent: requireNumber(body, "monthlyRent", { min: 1, max: 20_000 }),
    availableFrom: requireDate(body, "availableFrom"),
    availableTo: requireDate(body, "availableTo"),
    utilitiesIncluded: toBool(body.utilitiesIncluded),
    deposit: optionalNumber(body, "deposit", 0, { min: 0, max: 50_000 }),
    bedrooms: requireNumber(body, "bedrooms", { min: 0, max: 12 }),
    bathrooms: requireNumber(body, "bathrooms", { min: 0.5, max: 12 }),
    maxRoommates: optionalNumber(body, "maxRoommates", 0, { min: 0, max: 20 }),
    petsAllowed: toBool(body.petsAllowed),
    furnished: toBool(body.furnished),
    privateBath: toBool(body.privateBath),
    amenities,
    photoDataUrls,
  };
}

/* ------------------------------------------------------------------ browse */

listingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { filter, sort } = parseFilter(req);
    const manager = new ListingManager();
    const listings = manager.retrieveListings(filter, sort);

    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const savedIds = req.user ? savedIdSet(req.user.id) : new Set<string>();

    res.json({
      total: listings.length,
      results: listings.slice(offset, offset + limit).map((l) => ({
        ...l.toJSON(),
        saved: savedIds.has(l.listingId),
      })),
    });
  }),
);

/** The swipe deck: active listings the signed-in user has not judged yet. */
listingsRouter.get(
  "/deck",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { filter, sort } = parseFilter(req);
    filter.excludeSwipedBy = user.id;

    const manager = new ListingManager();
    const listings = manager.retrieveListings(filter, sort === "newest" ? "distance" : sort);
    const limit = Math.min(Number(req.query.limit) || 25, 60);

    res.json({
      remaining: listings.length,
      results: listings.slice(0, limit).map((l) => l.toJSON()),
    });
  }),
);

listingsRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const manager = new ListingManager();
    const active = manager.retrieveListings({ ownerId: user.id, status: "active" }, "newest");
    const paused = manager.retrieveListings({ ownerId: user.id, status: "paused" }, "newest");

    const withStats = [...active, ...paused].map((l) => {
      const saves = db
        .prepare("SELECT COUNT(*) AS n FROM saved_listings WHERE listing_id = ?")
        .get(l.listingId) as { n: number };
      const rights = db
        .prepare(
          "SELECT COUNT(*) AS n FROM swipes WHERE listing_id = ? AND direction = 'right'",
        )
        .get(l.listingId) as { n: number };
      const inquiries = db
        .prepare("SELECT COUNT(*) AS n FROM conversations WHERE listing_id = ?")
        .get(l.listingId) as { n: number };
      return { ...l.toJSON(), stats: { saves: saves.n, likes: rights.n, inquiries: inquiries.n } };
    });

    res.json({ results: withStats });
  }),
);

listingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const manager = new ListingManager();
    const listing = manager.retrieveListing(req.params.id);
    if (!listing || listing.status === "removed") throw notFound("Listing not found");

    listing.setDistanceFromCampus(req.user?.university ?? "Syracuse University");
    const saved = req.user ? savedIdSet(req.user.id).has(listing.listingId) : false;
    res.json({ listing: { ...listing.toJSON(), saved } });
  }),
);

/* ------------------------------------------------------------------ create */

listingsRouter.post(
  "/",
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = readListingBody(req.body as Record<string, unknown>);
    const manager = new ListingManager();
    const status = await manager.submitListing({ ...input, ownerId: user.id });

    if (!status.ok) {
      res.status(422).json({ error: status.message, problems: status.problems });
      return;
    }
    res.status(201).json({ message: status.message, listing: status.listing?.toJSON() });
  }),
);

listingsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;

    // Only forward keys the caller actually sent, so PATCH stays a partial update.
    const patch: Record<string, unknown> = {};
    const passthrough = [
      "title",
      "address",
      "city",
      "state",
      "zip",
      "description",
      "monthlyRent",
      "availableFrom",
      "availableTo",
      "deposit",
      "bedrooms",
      "bathrooms",
      "maxRoommates",
    ];
    for (const key of passthrough) if (body[key] !== undefined) patch[key] = body[key];
    for (const key of ["utilitiesIncluded", "petsAllowed", "furnished", "privateBath"]) {
      if (body[key] !== undefined) patch[key] = toBool(body[key]);
    }
    if (Array.isArray(body.amenities)) patch.amenities = body.amenities;
    if (Array.isArray(body.photos)) patch.photoDataUrls = body.photos;
    if (typeof body.status === "string") {
      if (!["active", "paused"].includes(body.status)) {
        throw badRequest('status must be "active" or "paused"');
      }
      patch.status = body.status;
    }

    const manager = new ListingManager();
    const status = await manager.updateListing(req.params.id, user.id, patch);

    if (!status.ok) {
      if (manager.operationStatus === "not_found") throw notFound(status.message);
      if (manager.operationStatus === "forbidden") throw forbidden(status.message);
      res.status(422).json({ error: status.message, problems: status.problems });
      return;
    }
    res.json({ message: status.message, listing: status.listing?.toJSON() });
  }),
);

listingsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const manager = new ListingManager();
    const status = manager.deleteListing(req.params.id, user.id);
    if (!status.ok) {
      if (manager.operationStatus === "not_found") throw notFound(status.message);
      throw forbidden(status.message);
    }
    res.json({ message: status.message });
  }),
);

/* ------------------------------------------------------------------ photos */

listingsRouter.post(
  "/:id/photos",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const listing = ListingData.retrieveById(req.params.id);
    if (!listing) throw notFound("Listing not found");
    if (listing.ownerId !== user.id) throw forbidden("You can only add photos to your own listing");

    const dataUrl = requireString(req.body as Record<string, unknown>, "photo", {
      min: 32,
      max: 12_000_000,
    });
    if (listing.photoData.length >= 10) throw badRequest("A listing can have at most 10 photos");

    let photo: PhotoData;
    try {
      photo = PhotoData.fromDataUrl(listing.listingId, dataUrl, listing.photoData.length);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    const problems = photo.validateData();
    if (problems.length > 0) throw badRequest(problems.join("; "));

    photo.storeData();
    res.status(201).json({ photo: photo.toJSON() });
  }),
);

listingsRouter.delete(
  "/:id/photos/:photoId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const row = db.prepare("SELECT owner_id FROM listings WHERE id = ?").get(req.params.id) as
      | { owner_id: string }
      | undefined;
    if (!row) throw notFound("Listing not found");
    if (row.owner_id !== user.id) throw forbidden("You can only edit your own listing");

    if (!PhotoData.deleteById(req.params.photoId, req.params.id)) throw notFound("Photo not found");
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ shared */

export function savedIdSet(userId: string): Set<string> {
  const rows = db
    .prepare("SELECT listing_id FROM saved_listings WHERE user_id = ?")
    .all(userId) as Array<{ listing_id: string }>;
  return new Set(rows.map((r) => r.listing_id));
}
