/**
 * TM09-133: Photo upload endpoints.
 *
 * One block per acceptance criterion:
 *   1. POST /listings/:id/photos uploads one image for the owner and returns
 *      the photo record with its public URL.
 *   2. DELETE /listings/:id/photos/:photoId removes the row AND the file.
 *   3. Over MAX_PHOTO_BYTES -> 413, not an image -> 415.
 *   4. Not the owner -> 403, no such listing -> 404.
 *
 * Every rejection also asserts on uploadedFiles(): a request that fails must
 * not leave anything behind in UPLOAD_DIR. That is the part a status-code-only
 * test would miss, and orphaned files are the expensive kind of bug here.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { uploadedFiles } from "../helpers/env.ts";
import {
  api,
  JPEG_SMALL,
  OVERSIZED_PNG,
  PNG_1PX,
  PNG_LIAR,
  seedListing,
  seedUser,
  startTestServer,
  WEBP_SMALL,
} from "../helpers/http.ts";
import type { TestServer } from "../helpers/http.ts";
import { config } from "../../src/config.ts";
import { db } from "../../src/db.ts";

let server: TestServer;
let owner: { id: string; token: string };
let stranger: { id: string; token: string };

before(async () => {
  server = await startTestServer();
  owner = seedUser("Owner");
  stranger = seedUser("Stranger");
});

after(async () => {
  await server.close();
});

/** The photo rows a listing currently has, oldest first. */
function photoRows(listingId: string): Array<{ id: string; file_url: string }> {
  return db
    .prepare("SELECT id, file_url FROM photos WHERE listing_id = ? ORDER BY sort_order")
    .all(listingId) as Array<{ id: string; file_url: string }>;
}

describe("POST /api/listings/:id/photos", () => {
  it("stores one image for the owner and returns its public URL", async () => {
    const listingId = seedListing(owner.id);
    const before = uploadedFiles();

    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: PNG_1PX },
    });

    assert.equal(res.status, 201);
    const photo = res.body.photo as Record<string, unknown>;
    assert.ok(typeof photo.photoId === "string" && photo.photoId.startsWith("pho_"));
    assert.equal(photo.fileUrl, `/uploads/${listingId}/${photo.photoId as string}.png`);
    assert.ok((photo.fileSize as number) > 0);
    assert.equal(photo.sortOrder, 0);

    // The row and the file both exist, and exactly one file was added.
    assert.deepEqual(
      photoRows(listingId).map((r) => r.id),
      [photo.photoId],
    );
    const added = uploadedFiles().filter((f) => !before.includes(f));
    assert.deepEqual(added, [path.join(listingId, `${photo.photoId as string}.png`)]);
  });

  it("accepts JPEG and WebP, with the extension the bytes call for", async () => {
    const listingId = seedListing(owner.id);

    const jpeg = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: JPEG_SMALL },
    });
    assert.equal(jpeg.status, 201);
    assert.match((jpeg.body.photo as Record<string, string>).fileUrl, /\.jpg$/);

    const webp = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: WEBP_SMALL },
    });
    assert.equal(webp.status, 201);
    assert.match((webp.body.photo as Record<string, string>).fileUrl, /\.webp$/);

    // Second upload lands after the first rather than overwriting its order.
    assert.equal((webp.body.photo as Record<string, number>).sortOrder, 1);
    assert.equal(photoRows(listingId).length, 2);
  });

  it("rejects a photo over MAX_PHOTO_BYTES with 413 and writes nothing", async () => {
    const listingId = seedListing(owner.id);
    const before = uploadedFiles();

    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: OVERSIZED_PNG },
    });

    assert.equal(res.status, 413);
    assert.match(res.body.error as string, /the limit is/);
    assert.deepEqual(uploadedFiles(), before);
    assert.equal(photoRows(listingId).length, 0);
  });

  it("rejects a non-image MIME type with 415 and writes nothing", async () => {
    const listingId = seedListing(owner.id);
    const before = uploadedFiles();

    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: "data:application/pdf;base64,JVBERi0xLjQKJWZvbw==" },
    });

    assert.equal(res.status, 415);
    assert.match(res.body.error as string, /Unsupported image type/);
    assert.deepEqual(uploadedFiles(), before);
    assert.equal(photoRows(listingId).length, 0);
  });

  it("rejects non-image bytes wearing an image MIME type with 415", async () => {
    // The declared type says PNG; the magic bytes say otherwise. Trusting the
    // declaration would put an executable under the public /uploads mount.
    const listingId = seedListing(owner.id);
    const before = uploadedFiles();

    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: PNG_LIAR },
    });

    assert.equal(res.status, 415);
    assert.deepEqual(uploadedFiles(), before);
    assert.equal(photoRows(listingId).length, 0);
  });

  it("rejects a body past the JSON limit with the same 413 shape", async () => {
    // Never reaches the route — body-parser rejects it first. The client still
    // gets one clear answer rather than a 500. The wording does not mention a
    // photo, because this limit guards every route, but it still names the
    // photo size that sets it.
    const listingId = seedListing(owner.id);
    const before = uploadedFiles();
    const huge = "A".repeat(config.jsonBodyLimitBytes + 1024);

    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: `data:image/png;base64,${huge}` },
    });

    assert.equal(res.status, 413);
    assert.equal(typeof res.body.error, "string");
    assert.match(res.body.error as string, /Request body is too large/);
    assert.match(res.body.error as string, /a photo may be at most/);
    assert.deepEqual(uploadedFiles(), before);
  });

  it("refuses a non-owner with 403 and decodes nothing", async () => {
    const listingId = seedListing(owner.id);
    const before = uploadedFiles();

    // The payload is over the size limit too. A 403 rather than a 413 proves
    // the ownership check ran first and no decode work was done for a
    // caller with no business uploading here.
    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: stranger.token,
      body: { photo: OVERSIZED_PNG },
    });

    assert.equal(res.status, 403);
    assert.deepEqual(uploadedFiles(), before);
    assert.equal(photoRows(listingId).length, 0);
  });

  it("returns 404 for a listing that does not exist", async () => {
    const res = await api(server, "POST", "/api/listings/lst_nope/photos", {
      token: owner.token,
      body: { photo: PNG_1PX },
    });

    assert.equal(res.status, 404);
    assert.match(res.body.error as string, /Listing not found/);
  });

  it("returns 401 without a token", async () => {
    const listingId = seedListing(owner.id);
    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      body: { photo: PNG_1PX },
    });
    assert.equal(res.status, 401);
  });

  it("returns 400 when the photo field is missing", async () => {
    const listingId = seedListing(owner.id);
    const res = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: {},
    });
    assert.equal(res.status, 400);
  });
});

describe("DELETE /api/listings/:id/photos/:photoId", () => {
  it("removes the row and the file", async () => {
    const listingId = seedListing(owner.id);
    const created = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: PNG_1PX },
    });
    const photoId = (created.body.photo as Record<string, string>).photoId;
    const relative = path.join(listingId, `${photoId}.png`);
    assert.ok(uploadedFiles().includes(relative));

    const res = await api(server, "DELETE", `/api/listings/${listingId}/photos/${photoId}`, {
      token: owner.token,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(photoRows(listingId).length, 0);
    assert.ok(!uploadedFiles().includes(relative));
  });

  it("refuses a non-owner with 403 and leaves the file in place", async () => {
    const listingId = seedListing(owner.id);
    const created = await api(server, "POST", `/api/listings/${listingId}/photos`, {
      token: owner.token,
      body: { photo: PNG_1PX },
    });
    const photoId = (created.body.photo as Record<string, string>).photoId;
    const relative = path.join(listingId, `${photoId}.png`);

    const res = await api(server, "DELETE", `/api/listings/${listingId}/photos/${photoId}`, {
      token: stranger.token,
    });

    assert.equal(res.status, 403);
    assert.equal(photoRows(listingId).length, 1);
    assert.ok(uploadedFiles().includes(relative));
  });

  it("returns 404 for an unknown photo and for an unknown listing", async () => {
    const listingId = seedListing(owner.id);

    const unknownPhoto = await api(
      server,
      "DELETE",
      `/api/listings/${listingId}/photos/pho_nope`,
      { token: owner.token },
    );
    assert.equal(unknownPhoto.status, 404);
    assert.match(unknownPhoto.body.error as string, /Photo not found/);

    const unknownListing = await api(server, "DELETE", "/api/listings/lst_nope/photos/pho_nope", {
      token: owner.token,
    });
    assert.equal(unknownListing.status, 404);
    assert.match(unknownListing.body.error as string, /Listing not found/);
  });

  it("will not delete a photo through a listing that does not own it", async () => {
    // deleteById scopes by both ids, so a photo id guessed from one listing
    // cannot be removed by pointing another listing's URL at it.
    const mine = seedListing(owner.id);
    const other = seedListing(owner.id);
    const created = await api(server, "POST", `/api/listings/${mine}/photos`, {
      token: owner.token,
      body: { photo: PNG_1PX },
    });
    const photoId = (created.body.photo as Record<string, string>).photoId;

    const res = await api(server, "DELETE", `/api/listings/${other}/photos/${photoId}`, {
      token: owner.token,
    });

    assert.equal(res.status, 404);
    assert.equal(photoRows(mine).length, 1);
    assert.ok(uploadedFiles().includes(path.join(mine, `${photoId}.png`)));
  });
});
