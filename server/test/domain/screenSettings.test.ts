import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScreenSettings } from "../../src/domain/ScreenSettings.ts";

describe("ScreenSettings.validateData", () => {
  it("accepts the defaults", () => {
    assert.deepEqual(new ScreenSettings("usr_1").validateData(), []);
  });

  it("requires a 6-digit hex accent colour", () => {
    for (const color of ["#FFF", "D4603A", "#GGGGGG", "terracotta"]) {
      const s = new ScreenSettings("usr_1");
      s.color = color;
      assert.ok(s.validateData().some((p) => p.includes("Accent color")), `${color} should fail`);
    }
  });

  it("accepts hex in either case", () => {
    for (const color of ["#D4603A", "#d4603a"]) {
      const s = new ScreenSettings("usr_1");
      s.color = color;
      assert.deepEqual(s.validateData(), []);
    }
  });

  it("only allows the three themes", () => {
    for (const theme of ["light", "dark", "system"]) {
      const s = new ScreenSettings("usr_1");
      s.theme = theme;
      assert.deepEqual(s.validateData(), []);
    }
    const bad = new ScreenSettings("usr_1");
    bad.theme = "midnight";
    assert.ok(bad.validateData().some((p) => p.includes("Theme must be")));
  });

  it("bounds the viewport dimensions", () => {
    const tooNarrow = new ScreenSettings("usr_1");
    tooNarrow.width = 100;
    assert.ok(tooNarrow.validateData().some((p) => p.includes("Width")));

    const tooShort = new ScreenSettings("usr_1");
    tooShort.height = 200;
    assert.ok(tooShort.validateData().some((p) => p.includes("Height")));
  });

  it("bounds the search radius", () => {
    const s = new ScreenSettings("usr_1");
    s.payload.searchRadiusMiles = 500;
    assert.ok(s.validateData().some((p) => p.includes("Search radius")));

    s.payload.searchRadiusMiles = 0;
    assert.ok(s.validateData().some((p) => p.includes("Search radius")));
  });

  it("allows no price ceiling but not a zero one", () => {
    const none = new ScreenSettings("usr_1");
    none.payload.priceCeiling = null;
    assert.deepEqual(none.validateData(), []);

    const zero = new ScreenSettings("usr_1");
    zero.payload.priceCeiling = 0;
    assert.ok(zero.validateData().some((p) => p.includes("Price ceiling")));
  });
});

/**
 * EncryptData() / DecryptData() from the class diagram. The preference payload
 * is the one blob that holds a user's private search behaviour, so the round
 * trip and the tamper path both matter.
 */
describe("ScreenSettings encryption", () => {
  it("round-trips the payload", () => {
    const s = new ScreenSettings("usr_1");
    s.payload.priceCeiling = 1200;
    s.payload.showOnlyVerifiedHosts = true;

    const decrypted = ScreenSettings.decryptData(s.encryptData());
    assert.equal(decrypted.priceCeiling, 1200);
    assert.equal(decrypted.showOnlyVerifiedHosts, true);
  });

  it("does not leave the payload readable in the ciphertext", () => {
    const s = new ScreenSettings("usr_1");
    s.payload.university = "Cornell University";
    assert.ok(!s.encryptData().includes("Cornell"));
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const s = new ScreenSettings("usr_1");
    assert.notEqual(s.encryptData(), s.encryptData());
  });

  /**
   * Flip one byte of a base64url segment. Editing the encoded *characters* is
   * not enough: base64 carries spare low-order bits in its final character, so
   * a changed string can still decode to identical bytes and sail past the GCM
   * tag. Decode, mutate a real byte, re-encode.
   */
  function tamperSegment(blob: string, index: 0 | 1 | 2): string {
    const parts = blob.split(".");
    const bytes = Buffer.from(parts[index], "base64url");
    bytes[0] ^= 0xff;
    parts[index] = bytes.toString("base64url");
    return parts.join(".");
  }

  it("falls back to defaults when the ciphertext is tampered with", () => {
    const s = new ScreenSettings("usr_1");
    s.payload.priceCeiling = 1200;

    const recovered = ScreenSettings.decryptData(tamperSegment(s.encryptData(), 2));
    assert.equal(recovered.priceCeiling, null, "tampered payload must not survive");
    assert.equal(recovered.searchRadiusMiles, 5);
  });

  it("rejects a tampered auth tag", () => {
    const s = new ScreenSettings("usr_1");
    s.payload.priceCeiling = 1200;
    assert.equal(ScreenSettings.decryptData(tamperSegment(s.encryptData(), 1)).priceCeiling, null);
  });

  it("rejects a tampered IV", () => {
    const s = new ScreenSettings("usr_1");
    s.payload.priceCeiling = 1200;
    assert.equal(ScreenSettings.decryptData(tamperSegment(s.encryptData(), 0)).priceCeiling, null);
  });

  it("falls back to defaults on a missing or malformed blob", () => {
    for (const blob of [null, "", "not-a-blob", "a.b"]) {
      const recovered = ScreenSettings.decryptData(blob);
      assert.equal(recovered.searchRadiusMiles, 5);
      assert.equal(recovered.university, "Syracuse University");
    }
  });

  it("fills in any key a stored payload is missing", () => {
    // Guards against an older row written before a preference was added.
    const partial = ScreenSettings.decryptData(null);
    assert.equal(partial.notifyMessages, true);
    assert.equal(partial.notifyNewMatches, true);
  });
});
