import { Router } from "express";
import type { Request } from "express";
import { db } from "../db.ts";
import { ListingData } from "../domain/ListingData.ts";
import type { ListingFilter, ListingSort } from "../domain/ListingData.ts";
import type { SubmitListingInput } from "../domain/ListingManager.ts";
import { ListingManager, MAX_PHOTOS_PER_LISTING } from "../domain/ListingManager.ts";
import { PhotoData } from "../domain/PhotoData.ts";
import { campusAnchor } from "../lib/geocode.ts";
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
import { currentUser, requireAuth } from "../middleware/auth.ts";

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
    // Normalised, not passed through: SQLite's date() returns NULL for an
    // unpadded "2026-5-1", which silently matches nothing.
    availableFrom: q.availableFrom ? requireDate(q, "availableFrom") : undefined,
    availableTo: q.availableTo ? requireDate(q, "availableTo") : undefined,
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
    filter.near = campusAnchor(q.campus || req.user?.university);
  }

  const sortParam = (q.sort ?? "newest") as ListingSort;
  const sort = SORTS.includes(sortParam) ? sortParam : "newest";
  return { filter, sort };
}

const MAX_AMENITIES = 30;

/** Amenity lists arrive from the client, so they are filtered, not trusted. */
function readAmenities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, MAX_AMENITIES);
}

function readPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const photos = (value as unknown[]).filter((p): p is string => typeof p === "string");
  if (photos.length > MAX_PHOTOS_PER_LISTING) {
    throw badRequest(`A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos`);
  }
  return photos;
}

function readListingBody(body: Record<string, unknown>) {
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
    amenities: readAmenities(body.amenities),
    photoDataUrls: readPhotos(body.photos),
  };
}

/**
 * The PATCH counterpart: only the keys the caller actually sent, each run
 * through the same validator the create path uses. Forwarding the raw body
 * instead let a PATCH past every rule POST enforces.
 */
function readListingPatch(body: Record<string, unknown>): Partial<SubmitListingInput> {
  const patch: Partial<SubmitListingInput> = {};

  if (body.title !== undefined) patch.title = requireString(body, "title", { min: 4, max: 120 });
  if (body.address !== undefined) {
    patch.address = requireString(body, "address", { min: 5, max: 200 });
  }
  if (body.city !== undefined) patch.city = requireString(body, "city", { max: 80 });
  if (body.state !== undefined) {
    patch.state = requireString(body, "state", { min: 2, max: 2 }).toUpperCase();
  }
  if (body.zip !== undefined) patch.zip = optionalString(body, "zip", "", 10);
  if (body.description !== undefined) {
    patch.description = requireString(body, "description", { min: 20, max: 4000 });
  }

  if (body.monthlyRent !== undefined) {
    patch.monthlyRent = requireNumber(body, "monthlyRent", { min: 1, max: 20_000 });
  }
  if (body.availableFrom !== undefined) patch.availableFrom = requireDate(body, "availableFrom");
  if (body.availableTo !== undefined) patch.availableTo = requireDate(body, "availableTo");
  if (body.deposit !== undefined) {
    patch.deposit = requireNumber(body, "deposit", { min: 0, max: 50_000 });
  }
  if (body.bedrooms !== undefined) {
    patch.bedrooms = requireNumber(body, "bedrooms", { min: 0, max: 12 });
  }
  if (body.bathrooms !== undefined) {
    patch.bathrooms = requireNumber(body, "bathrooms", { min: 0.5, max: 12 });
  }
  if (body.maxRoommates !== undefined) {
    patch.maxRoommates = requireNumber(body, "maxRoommates", { min: 0, max: 20 });
  }

  if (body.utilitiesIncluded !== undefined) {
    patch.utilitiesIncluded = toBool(body.utilitiesIncluded);
  }
  if (body.petsAllowed !== undefined) patch.petsAllowed = toBool(body.petsAllowed);
  if (body.furnished !== undefined) patch.furnished = toBool(body.furnished);
  if (body.privateBath !== undefined) patch.privateBath = toBool(body.privateBath);

  if (body.amenities !== undefined) patch.amenities = readAmenities(body.amenities);
  if (body.photos !== undefined) patch.photoDataUrls = readPhotos(body.photos);

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !["active", "paused"].includes(body.status)) {
      throw badRequest('status must be "active" or "paused"');
    }
    patch.status = body.status;
  }

  return patch;
}

/** Saves, right-swipes and inquiries for every listing one host owns. */
const statsForOwnerSql = `
  SELECT l.id AS listing_id,
         (SELECT COUNT(*) FROM saved_listings s WHERE s.listing_id = l.id) AS saves,
         (SELECT COUNT(*) FROM swipes w
           WHERE w.listing_id = l.id AND w.direction = 'right') AS likes,
         (SELECT COUNT(*) FROM conversations c WHERE c.listing_id = l.id) AS inquiries
  FROM listings l
  WHERE l.owner_id = ?
`;

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
    // Removed listings are included: they are soft-deleted, and this screen is
    // the only place their owner can set them back to active.
    const byStatus = ["active", "paused", "removed"].map((status) =>
      manager.retrieveListings({ ownerId: user.id, status }, "newest"),
    );

    const stats = db.prepare(statsForOwnerSql).all(user.id) as Array<{
      listing_id: string;
      saves: number;
      likes: number;
      inquiries: number;
    }>;
    const byListing = new Map(stats.map((row) => [row.listing_id, row]));

    const withStats = byStatus.flat().map((l) => {
      const row = byListing.get(l.listingId);
      return {
        ...l.toJSON(),
        stats: {
          saves: row?.saves ?? 0,
          likes: row?.likes ?? 0,
          inquiries: row?.inquiries ?? 0,
        },
      };
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
    const patch = readListingPatch(req.body as Record<string, unknown>);

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
    if (listing.photoData.length >= MAX_PHOTOS_PER_LISTING) {
      throw badRequest(`A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos`);
    }

    let decoded: { bytes: Buffer; ext: string };
    try {
      decoded = PhotoData.decodeDataUrl(dataUrl);
    } catch (err) {
      // Nothing has reached the uploads directory at this point.
      throw badRequest((err as Error).message);
    }

    const photo = PhotoData.persist(listing.listingId, decoded, listing.photoData.length);
    const problems = photo.validateData();
    if (problems.length > 0) {
      PhotoData.discardFile(photo.fileUrl);
      throw badRequest(problems.join("; "));
    }

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
