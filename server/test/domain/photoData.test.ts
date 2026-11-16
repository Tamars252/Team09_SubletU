/**
 * PhotoData: the decode/persist pipeline (TM09-114 extended it with the
 * validateData() rules, the storeData() upsert and fromJSON()).
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { uploadedFiles } from "../helpers/env.ts";
import { config } from "../../src/config.ts";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";
import { ValidationError } from "../../src/domain/Data.ts";
import { PhotoData } from "../../src/domain/PhotoData.ts";
import type { PhotoFields } from "../../src/domain/PhotoData.ts";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function oversizedDataUrl(): string {
  return `data:image/png;base64,${Buffer.alloc(8192, 7).toString("base64")}`;
}

describe("PhotoData.decodeDataUrl", () => {
  it("writes nothing when the payload is too large", () => {
    const before = uploadedFiles();
    assert.throws(() => PhotoData.decodeDataUrl(oversizedDataUrl()), /the limit is/);
    assert.deepEqual(uploadedFiles(), before);
  });

  it("writes nothing when the type is not an allowed image", () => {
    const before = uploadedFiles();
    assert.throws(
      () => PhotoData.decodeDataUrl("data:application/pdf;base64,Zm9v"),
      /Unsupported image type/,
    );
    assert.throws(() => PhotoData.decodeDataUrl("not a data url"), /base64 data URL/);
    assert.deepEqual(uploadedFiles(), before);
  });

  it("decodes an allowed image without touching the disk", () => {
    const before = uploadedFiles();
    const decoded = PhotoData.decodeDataUrl(PNG_1PX);
    assert.equal(decoded.ext, ".png");
    assert.ok(decoded.bytes.byteLength > 0);
    assert.deepEqual(uploadedFiles(), before);
  });
});

describe("PhotoData.persist / discardFile", () => {
  it("writes the file, then removes it again", () => {
    const photo = PhotoData.persist("lst_test", PhotoData.decodeDataUrl(PNG_1PX), 0);
    assert.ok(uploadedFiles().some((f) => f.includes(photo.photoId)));
    assert.equal(photo.fileSize, PhotoData.decodeDataUrl(PNG_1PX).bytes.byteLength);

    PhotoData.discardFile(photo.fileUrl);
    assert.ok(!uploadedFiles().some((f) => f.includes(photo.photoId)));
  });

  it("refuses to delete outside the upload directory", () => {
    // A tampered DB value must not reach into the rest of the filesystem.
    assert.doesNotThrow(() => PhotoData.discardFile("/uploads/../../secrets.txt"));
    assert.doesNotThrow(() => PhotoData.discardFile("https://example.com/a.png"));
  });
});

/* ------------------------------------------------------------ validateData */

const URL_PROBLEM = "Photo URL must be an http(s) URL or an uploaded file path";

const BASE: Omit<PhotoFields, "photoId" | "listingId"> = {
  fileUrl: "/uploads/lst_fixture/pho_fixture.png",
  fileSize: 1024,
  uploadTimestamp: "2026-11-16T12:00:00.000Z",
  sortOrder: 0,
};

/** A photo that is valid apart from whatever the caller overrides. */
function photo(over: Partial<PhotoFields> = {}): PhotoData {
  return new PhotoData({
    photoId: "pho_fixture",
    listingId: "lst_fixture",
    ...BASE,
    ...over,
  });
}

const problemsOf = (over: Partial<PhotoFields>) => photo(over).validateData();

/** The problem list carried by the ValidationError `fn` is expected to throw. */
function problemsThrownBy(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ValidationError, `expected a ValidationError, got ${err}`);
    return err.problems;
  }
  assert.fail("expected a ValidationError, but nothing was thrown");
}

describe("validateData(): the file URL", () => {
  it("accepts the two shapes the app actually produces", () => {
    // A local upload, and a remote image registered by the seed data.
    assert.deepEqual(problemsOf({ fileUrl: "/uploads/lst_1/pho_1.jpg" }), []);
    assert.deepEqual(problemsOf({ fileUrl: "https://example.com/room.jpg" }), []);
    assert.deepEqual(problemsOf({ fileUrl: "http://example.com/room.jpg" }), []);
  });

  it("rejects an empty URL, saying both that it is missing and that it is wrong", () => {
    assert.deepEqual(problemsOf({ fileUrl: "" }), ["Photo is missing a file URL", URL_PROBLEM]);
  });

  it("rejects a scheme the browser would not load as an image", () => {
    assert.deepEqual(problemsOf({ fileUrl: "ftp://example.com/room.jpg" }), [URL_PROBLEM]);
    assert.deepEqual(problemsOf({ fileUrl: "javascript:alert(1)" }), [URL_PROBLEM]);
    assert.deepEqual(problemsOf({ fileUrl: "data:image/png;base64,AAAA" }), [URL_PROBLEM]);
  });

  it("requires the upload path to be rooted, not relative", () => {
    assert.deepEqual(problemsOf({ fileUrl: "uploads/lst_1/pho_1.jpg" }), [URL_PROBLEM]);
    assert.deepEqual(problemsOf({ fileUrl: "../uploads/lst_1/pho_1.jpg" }), [URL_PROBLEM]);
  });
});

describe("validateData(): the file size", () => {
  it("accepts 0, which is what a remote photo reports", () => {
    assert.deepEqual(problemsOf({ fileSize: 0 }), []);
  });

  it("rejects a negative size", () => {
    assert.deepEqual(problemsOf({ fileSize: -1 }), ["Photo file size cannot be negative"]);
  });

  it("accepts the limit exactly and rejects one byte over it", () => {
    assert.deepEqual(problemsOf({ fileSize: config.maxPhotoBytes }), []);

    const [problem, ...rest] = problemsOf({ fileSize: config.maxPhotoBytes + 1 });
    assert.deepEqual(rest, [], "one problem, not two");
    assert.match(problem, /^Photo is .+; the limit is .+$/);
  });
});

describe("validateData(): the listing id", () => {
  it("requires one, and does not count whitespace", () => {
    assert.deepEqual(problemsOf({ listingId: "" }), ["Listing id is required"]);
    assert.deepEqual(problemsOf({ listingId: "   " }), ["Listing id is required"]);
  });

  it("reports every broken rule at once, not just the first", () => {
    assert.deepEqual(problemsOf({ listingId: "", fileUrl: "ftp://x/a.jpg", fileSize: -1 }), [
      "Listing id is required",
      URL_PROBLEM,
      "Photo file size cannot be negative",
    ]);
  });
});

describe("fromRemoteUrl(): a photo this server does not hold", () => {
  it("reports a size of 0 rather than guessing one, and is still valid", () => {
    const remote = PhotoData.fromRemoteUrl("lst_1", "https://example.com/room.jpg", 2);
    assert.equal(remote.fileSize, 0);
    assert.equal(remote.sortOrder, 2);
    assert.deepEqual(remote.validateData(), []);
  });
});

/* --------------------------------------------------------------- storeData */

describe("storeData(): an upsert keyed on the photo id", () => {
  let listingId: string;
  let otherListingId: string;

  before(() => {
    const ownerId = newId("usr");
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES (?, ?, 'Photo Owner', 'x', ?)`,
    ).run(ownerId, `${ownerId}@syr.edu`, nowIso());

    const addListing = () => {
      const id = newId("lst");
      const now = nowIso();
      db.prepare(
        `INSERT INTO listings (id, owner_id, title, address, description, created_at, updated_at)
         VALUES (?, ?, 'Photo fixture', '3 Fixture Ave', 'A fixture listing.', ?, ?)`,
      ).run(id, ownerId, now, now);
      return id;
    };
    listingId = addListing();
    otherListingId = addListing();
  });

  it("updates the row in place instead of inserting a second one", () => {
    const photoId = newId("pho");
    new PhotoData({
      photoId,
      listingId,
      fileUrl: `/uploads/${listingId}/a.png`,
      fileSize: 100,
      uploadTimestamp: nowIso(),
      sortOrder: 0,
    }).storeData();

    new PhotoData({
      photoId,
      listingId,
      fileUrl: `/uploads/${listingId}/b.png`,
      fileSize: 200,
      uploadTimestamp: nowIso(),
      sortOrder: 3,
    }).storeData();

    const stored = PhotoData.retrieveForListing(listingId);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].fileUrl, `/uploads/${listingId}/b.png`);
    assert.equal(stored[0].fileSize, 200);
    assert.equal(stored[0].sortOrder, 3);
  });

  it("will not move a photo to another listing, or restamp when it arrived", () => {
    // Both columns are facts about where the photo came from, and the bytes
    // live under UPLOAD_DIR/<listing_id>/ — see the comment on storeData().
    const photoId = newId("pho");
    const uploadedAt = "2026-01-02T03:04:05.000Z";
    new PhotoData({
      photoId,
      listingId,
      fileUrl: `/uploads/${listingId}/c.png`,
      fileSize: 100,
      uploadTimestamp: uploadedAt,
      sortOrder: 0,
    }).storeData();

    new PhotoData({
      photoId,
      listingId: otherListingId,
      fileUrl: `/uploads/${otherListingId}/c.png`,
      fileSize: 100,
      uploadTimestamp: nowIso(),
      sortOrder: 0,
    }).storeData();

    assert.equal(
      PhotoData.retrieveForListing(otherListingId).length,
      0,
      "the photo must not follow the listing id it was re-saved with",
    );
    const stayed = PhotoData.retrieveForListing(listingId).find((p) => p.photoId === photoId)!;
    assert.ok(stayed, "the photo is still on the listing it was uploaded to");
    assert.equal(stayed.uploadTimestamp, uploadedAt);
  });

  it("retrieveData() refreshes a row, and reports one that is gone", () => {
    const photoId = newId("pho");
    const mine = new PhotoData({
      photoId,
      listingId,
      fileUrl: `/uploads/${listingId}/d.png`,
      fileSize: 100,
      uploadTimestamp: nowIso(),
      sortOrder: 0,
    });
    mine.storeData();

    db.prepare("UPDATE photos SET file_size = 555, sort_order = 7 WHERE id = ?").run(photoId);
    assert.equal(mine.retrieveData(), true);
    assert.equal(mine.fileSize, 555);
    assert.equal(mine.sortOrder, 7);

    db.prepare("DELETE FROM photos WHERE id = ?").run(photoId);
    assert.equal(mine.retrieveData(), false);
    assert.equal(mine.fileSize, 555, "the object keeps what it last read");
  });
});

/* ---------------------------------------------------------- toJSON/fromJSON */

describe("toJSON() / fromJSON()", () => {
  it("toJSON() carries the photo id but not the listing id", () => {
    // A photo is serialized inside the listing that owns it, so repeating the
    // listing id on every photo would be noise on the wire. fromJSON() takes
    // it as a parameter for the same reason.
    assert.deepEqual(Object.keys(photo().toJSON()).sort(), [
      "fileSize",
      "fileUrl",
      "photoId",
      "sortOrder",
      "uploadTimestamp",
    ]);
  });

  it("fromJSON(toJSON()) gives back an equal object", () => {
    const original = photo({ photoId: "pho_round_trip", fileSize: 2048, sortOrder: 4 });
    const copy = PhotoData.fromJSON("lst_fixture", JSON.parse(JSON.stringify(original)));

    assert.ok(copy instanceof PhotoData);
    assert.equal(copy.listingId, "lst_fixture");
    assert.deepEqual(copy.toJSON(), original.toJSON());
  });

  it("takes the listing id from its argument, never from the payload", () => {
    const payload = { ...photo().toJSON(), listingId: "lst_smuggled" };
    assert.equal(PhotoData.fromJSON("lst_real", payload).listingId, "lst_real");
  });

  it("rejects a wrongly typed or missing field, naming it", () => {
    assert.deepEqual(
      problemsThrownBy(() => PhotoData.fromJSON("lst_x", { ...photo().toJSON(), fileSize: "100" })),
      ['PhotoData JSON field "fileSize" must be a number'],
    );

    const { photoId, ...withoutId } = photo().toJSON();
    assert.deepEqual(problemsThrownBy(() => PhotoData.fromJSON("lst_x", withoutId)), [
      'PhotoData JSON is missing "photoId"',
    ]);
  });

  it("reports every bad field at once, and rejects a non-object", () => {
    assert.deepEqual(
      problemsThrownBy(() =>
        PhotoData.fromJSON("lst_x", {
          photoId: 7,
          fileUrl: "/uploads/a.png",
          fileSize: null,
          sortOrder: 0,
        }),
      ),
      [
        'PhotoData JSON field "photoId" must be a string',
        'PhotoData JSON is missing "fileSize"',
        'PhotoData JSON is missing "uploadTimestamp"',
      ],
    );

    for (const bad of [null, "{}", 7, [], undefined]) {
      assert.throws(() => PhotoData.fromJSON("lst_x", bad), ValidationError);
    }
  });

  it("does not run validateData(): a payload may be well-formed and unstorable", () => {
    const built = PhotoData.fromJSON("lst_x", { ...photo().toJSON(), fileUrl: "ftp://x/a.png" });
    assert.equal(built.fileUrl, "ftp://x/a.png");
    assert.deepEqual(built.validateData(), [URL_PROBLEM]);
  });
});
