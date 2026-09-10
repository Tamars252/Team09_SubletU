import { Router } from "express";
import { db, nowIso } from "../db.ts";
import { ListingData } from "../domain/ListingData.ts";
import { ScreenSettings } from "../domain/ScreenSettings.ts";
import { newId } from "../lib/crypto.ts";
import { CAMPUS_ANCHORS, searchPlaces } from "../lib/geocode.ts";
import {
  asyncHandler,
  badRequest,
  notFound,
  optionalNumber,
  optionalString,
  requireString,
  toBool,
} from "../lib/http.ts";
import { currentUser, requireAuth } from "../middleware/auth.ts";

/* ----------------------------------------------------------------- reports */

export const reportsRouter = Router();

const REPORT_REASONS = [
  "Suspected scam",
  "Inaccurate listing",
  "Inappropriate content",
  "Already rented",
  "Discriminatory language",
  "Other",
];

reportsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const listingId = requireString(body, "listingId", { min: 3, max: 64 });
    const reason = requireString(body, "reason", { min: 3, max: 80 });
    const details = optionalString(body, "details", "", 1500);

    if (!REPORT_REASONS.includes(reason)) throw badRequest("Unknown report reason");
    if (!ListingData.retrieveById(listingId)) throw notFound("Listing not found");

    db.prepare(
      `INSERT INTO reports (id, reporter_id, listing_id, reason, details, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    ).run(newId("rpt"), user.id, listingId, reason, details, nowIso());

    res.status(201).json({ ok: true, message: "Thanks — our team will review this listing." });
  }),
);

reportsRouter.get(
  "/reasons",
  asyncHandler(async (_req, res) => {
    res.json({ reasons: REPORT_REASONS });
  }),
);

/* ---------------------------------------------------------------- settings */

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ settings: ScreenSettings.retrieveForUser(user.id).toJSON() });
  }),
);

settingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const settings = ScreenSettings.retrieveForUser(user.id);

    settings.font = optionalString(body, "font", settings.font, 64);
    settings.color = optionalString(body, "color", settings.color, 7);
    settings.theme = optionalString(body, "theme", settings.theme, 16);
    settings.width = optionalNumber(body, "width", settings.width);
    settings.height = optionalNumber(body, "height", settings.height);

    settings.payload.university = optionalString(
      body,
      "university",
      settings.payload.university,
      120,
    );
    settings.payload.searchRadiusMiles = optionalNumber(
      body,
      "searchRadiusMiles",
      settings.payload.searchRadiusMiles,
    );
    settings.payload.priceCeiling =
      body.priceCeiling === null || body.priceCeiling === ""
        ? null
        : optionalNumber(body, "priceCeiling", settings.payload.priceCeiling ?? 0);
    if (body.notifyNewMatches !== undefined) {
      settings.payload.notifyNewMatches = toBool(body.notifyNewMatches);
    }
    if (body.notifyMessages !== undefined) {
      settings.payload.notifyMessages = toBool(body.notifyMessages);
    }
    if (body.notifyPriceDrops !== undefined) {
      settings.payload.notifyPriceDrops = toBool(body.notifyPriceDrops);
    }
    if (body.showOnlyVerifiedHosts !== undefined) {
      settings.payload.showOnlyVerifiedHosts = toBool(body.showOnlyVerifiedHosts);
    }

    const problems = settings.validateData();
    if (problems.length > 0) {
      res.status(422).json({ error: "Settings were not saved", problems });
      return;
    }

    settings.storeData();
    // Keep the profile's university in sync with the setting.
    db.prepare("UPDATE users SET university = ? WHERE id = ?").run(
      settings.payload.university,
      user.id,
    );

    res.json({ settings: settings.toJSON() });
  }),
);

/* --------------------------------------------------------------------- geo */

export const geoRouter = Router();

/** Place search for the map's search box — proxied so we control rate limits. */
geoRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 3) {
      res.json({ results: [] });
      return;
    }
    try {
      res.json({ results: await searchPlaces(q) });
    } catch (err) {
      console.warn("[geo] search failed:", (err as Error).message);
      res.status(503).json({ error: "Place search is temporarily unavailable", results: [] });
    }
  }),
);

geoRouter.get(
  "/campuses",
  asyncHandler(async (_req, res) => {
    res.json({
      campuses: Object.entries(CAMPUS_ANCHORS).map(([name, point]) => ({ name, ...point })),
    });
  }),
);

/* -------------------------------------------------------------- reference */

export const referenceRouter = Router();

export const AMENITIES_LIST = [
  "WiFi",
  "Laundry In-Unit",
  "Laundry On-Site",
  "Dishwasher",
  "Parking",
  "Gym Access",
  "Pool",
  "Furnished",
  "Pet Friendly",
  "AC",
  "Heating",
  "Balcony",
  "Porch",
  "Elevator",
  "Security System",
  "Doorman",
  "Storage",
  "Backyard",
  "Utilities Included",
  "Bus Route",
];

referenceRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({
      amenities: AMENITIES_LIST,
      universities: Object.keys(CAMPUS_ANCHORS),
      reportReasons: REPORT_REASONS,
      sorts: [
        { value: "distance", label: "Closest to campus" },
        { value: "price_asc", label: "Price: low to high" },
        { value: "price_desc", label: "Price: high to low" },
        { value: "available_soonest", label: "Available soonest" },
        { value: "newest", label: "Newest" },
      ],
    });
  }),
);
