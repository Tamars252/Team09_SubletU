import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadedFiles } from "../helpers/env.ts";
import { PhotoData } from "../../src/domain/PhotoData.ts";

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
