import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../../src/config.ts";
import { makePhoto } from "../helpers/factories.ts";

describe("PhotoData.validateData", () => {
  it("accepts an uploaded file path", () => {
    assert.deepEqual(makePhoto().validateData(), []);
  });

  it("accepts a remote https URL", () => {
    assert.deepEqual(makePhoto({ fileUrl: "https://example.com/room.jpg" }).validateData(), []);
  });

  it("rejects a missing file URL", () => {
    const problems = makePhoto({ fileUrl: "" }).validateData();
    assert.ok(problems.some((p) => p.includes("missing a file URL")));
  });

  it("rejects URL schemes that are not http(s) or an upload path", () => {
    // The front end renders these straight into an <img src>, so anything that
    // is not a plain image location has no business being stored.
    for (const fileUrl of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "../../etc/passwd",
    ]) {
      const problems = makePhoto({ fileUrl }).validateData();
      assert.ok(problems.some((p) => p.includes("Photo URL must be")), `${fileUrl} should fail`);
    }
  });

  it("rejects a negative file size", () => {
    const problems = makePhoto({ fileSize: -1 }).validateData();
    assert.ok(problems.some((p) => p.includes("file size cannot be negative")));
  });

  it("rejects a photo over the configured byte budget", () => {
    const problems = makePhoto({ fileSize: config.maxPhotoBytes + 1 }).validateData();
    assert.ok(problems.some((p) => p.includes("the limit is")));
  });

  it("accepts a photo exactly at the limit", () => {
    assert.deepEqual(makePhoto({ fileSize: config.maxPhotoBytes }).validateData(), []);
  });

  it("reports the size in MB so the message is readable", () => {
    const problems = makePhoto({ fileSize: 8 * 1_048_576 }).validateData();
    assert.ok(problems.some((p) => p.includes("8.0 MB")));
  });
});
