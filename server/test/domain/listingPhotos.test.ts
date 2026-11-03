import "../helpers/env.ts";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { uploadedFiles } from "../helpers/env.ts";
import { db, nowIso } from "../../src/db.ts";
import { ListingManager, MAX_PHOTOS_PER_LISTING } from "../../src/domain/ListingManager.ts";
import type { SubmitListingInput } from "../../src/domain/ListingManager.ts";
import { newId } from "../../src/lib/crypto.ts";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ownerId = newId("usr");

function baseInput(): SubmitListingInput {
  return {
    ownerId,
    title: "Sunny room near campus",
    address: "123 Euclid Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "A bright room a short walk from campus, available for the summer term.",
    monthlyRent: 800,
    availableFrom: "2026-05-15",
    availableTo: "2026-08-15",
    utilitiesIncluded: true,
    deposit: 400,
    bedrooms: 1,
    bathrooms: 1,
    maxRoommates: 2,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: ["WiFi"],
    photoDataUrls: [],
  };
}

before(() => {
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, university, bio,
                        avatar_initials, verified, rating, review_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?)`,
  ).run(ownerId, "host@syr.edu", "Test Host", "x", "Syracuse University", "", "TH", nowIso());

  // Pre-seed the geocode cache so submitListing never reaches the network.
  db.prepare(
    "INSERT OR REPLACE INTO geocache (query, lat, lng, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("fwd:123 euclid ave, syracuse, ny", 43.04, -76.13, "Euclid Ave", nowIso());
});

describe("ListingManager.submitListing", () => {
  it("leaves no uploaded files behind when the listing is rejected", async () => {
    const before = uploadedFiles();
    const input = baseInput();
    input.description = "too short";
    input.photoDataUrls = [PNG_1PX, PNG_1PX];

    const status = await new ListingManager().submitListing(input);

    assert.equal(status.ok, false);
    assert.ok(status.problems.some((p) => p.includes("Description")));
    assert.deepEqual(uploadedFiles(), before, "a rejected listing must write no photos");
  });

  it("refuses more photos than the cap and writes nothing", async () => {
    const before = uploadedFiles();
    const input = baseInput();
    input.photoDataUrls = new Array(MAX_PHOTOS_PER_LISTING + 1).fill(PNG_1PX);

    const status = await new ListingManager().submitListing(input);

    assert.equal(status.ok, false);
    assert.match(status.problems.join(" "), /at most 10 photos/);
    assert.deepEqual(uploadedFiles(), before);
  });

  it("stores the listing and its photos when it is valid", async () => {
    const input = baseInput();
    input.photoDataUrls = [PNG_1PX];

    const status = await new ListingManager().submitListing(input);

    assert.equal(status.ok, true, status.problems.join("; "));
    assert.equal(status.listing?.photoData.length, 1);
    const photoId = status.listing?.photoData[0].photoId as string;
    assert.ok(uploadedFiles().some((f) => f.includes(photoId)), "the photo file is on disk");

    const row = db
      .prepare("SELECT COUNT(*) AS n FROM photos WHERE listing_id = ?")
      .get(status.listing?.listingId as string) as { n: number };
    assert.equal(row.n, 1);
  });
});

describe("ListingManager.updateListing", () => {
  it("counts existing photos against the cap", async () => {
    const input = baseInput();
    input.photoDataUrls = [PNG_1PX, PNG_1PX];
    const created = await new ListingManager().submitListing(input);
    assert.equal(created.ok, true);
    const listingId = created.listing?.listingId as string;

    const before = uploadedFiles();
    const manager = new ListingManager();
    const status = await manager.updateListing(listingId, ownerId, {
      photoDataUrls: new Array(MAX_PHOTOS_PER_LISTING - 1).fill(PNG_1PX),
    });

    assert.equal(status.ok, false);
    assert.equal(manager.operationStatus, "photo_rejected");
    assert.match(status.problems.join(" "), /at most 10 photos/);
    assert.deepEqual(uploadedFiles(), before);
  });

  it("refuses to edit someone else's listing", async () => {
    const created = await new ListingManager().submitListing(baseInput());
    const manager = new ListingManager();
    const status = await manager.updateListing(
      created.listing?.listingId as string,
      newId("usr"),
      { title: "Hijacked" },
    );
    assert.equal(status.ok, false);
    assert.equal(manager.operationStatus, "forbidden");
  });
});

describe("ListingManager.deleteListing", () => {
  it("keeps the photos so a removed listing can be restored", async () => {
    const input = baseInput();
    input.photoDataUrls = [PNG_1PX];
    const created = await new ListingManager().submitListing(input);
    const listingId = created.listing?.listingId as string;

    const status = new ListingManager().deleteListing(listingId, ownerId);
    assert.equal(status.ok, true);

    const photos = db
      .prepare("SELECT COUNT(*) AS n FROM photos WHERE listing_id = ?")
      .get(listingId) as { n: number };
    assert.equal(photos.n, 1, "soft delete must not destroy the photos");

    const row = db.prepare("SELECT status FROM listings WHERE id = ?").get(listingId) as {
      status: string;
    };
    assert.equal(row.status, "removed");
  });
});
