/**
 * ScreenSettings with encryption at rest.
 *
 * One block per acceptance criterion:
 *   1. encryptData()/decryptData() use AES-256-GCM. Proven by decrypting the
 *      stored blob with node:crypto directly, not only by round-tripping it
 *      through our own code (which would pass for any reversible encoding).
 *   2. Tampered ciphertext is rejected: any change to the IV, the tag or the
 *      ciphertext, a cut-down tag, the wrong key or a malformed blob all come
 *      back as the defaults instead of as data.
 *
 * Plus the story itself: the preferences really are unreadable in the
 * database, and the HTTP routes keep working after a tampered row.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import { api, seedUser, startTestServer } from "../helpers/http.ts";
import type { TestServer } from "../helpers/http.ts";
import { db } from "../../src/db.ts";
import { ScreenSettings } from "../../src/domain/ScreenSettings.ts";
import type { SettingsPayload } from "../../src/domain/ScreenSettings.ts";

/** SETTINGS_SECRET is "test-settings-secret" in test/helpers/env.ts. */
const KEY = crypto.createHash("sha256").update("test-settings-secret").digest();

const DEFAULTS: SettingsPayload = new ScreenSettings("usr_defaults").payload;

const PRIVATE: SettingsPayload = {
  university: "Boston University",
  searchRadiusMiles: 12,
  priceCeiling: 1234,
  notifyNewMatches: false,
  notifyMessages: false,
  notifyPriceDrops: false,
  showOnlyVerifiedHosts: true,
};

function encrypted(payload: SettingsPayload = PRIVATE): string {
  const settings = new ScreenSettings("usr_x", { payload });
  return settings.encryptData();
}

/** The three base64url parts of a blob, as bytes. */
function parts(blob: string): { iv: Buffer; tag: Buffer; data: Buffer } {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  return { iv, tag, data };
}

function join(p: { iv: Buffer; tag: Buffer; data: Buffer }): string {
  return [p.iv, p.tag, p.data].map((b) => b.toString("base64url")).join(".");
}

function flipBit(buffer: Buffer, index = 0): Buffer {
  const copy = Buffer.from(buffer);
  copy[index] ^= 0x01;
  return copy;
}

/* ------------------------------------------------------------ criterion 1 */

describe("encryptData() and decryptData() use AES-256-GCM", () => {
  it("writes a 12-byte IV, a 16-byte tag and ciphertext", () => {
    const blob = encrypted();
    assert.equal(blob.split(".").length, 3);
    const { iv, tag, data } = parts(blob);
    assert.equal(iv.length, 12);
    assert.equal(tag.length, 16);
    assert.ok(data.length > 0);
  });

  it("produces a blob that standard AES-256-GCM decrypts with the configured key", () => {
    const { iv, tag, data } = parts(encrypted());

    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");

    assert.deepEqual(JSON.parse(plaintext), PRIVATE);
  });

  it("round-trips through decryptData()", () => {
    assert.deepEqual(ScreenSettings.decryptData(encrypted()), PRIVATE);
  });

  it("uses a fresh IV every time, so equal settings never produce equal blobs", () => {
    const a = encrypted();
    const b = encrypted();
    assert.notEqual(a, b);
    assert.notDeepEqual(parts(a).iv, parts(b).iv);
  });

  it("decrypts a blob written by standard AES-256-GCM", () => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(PRIVATE), "utf8"), cipher.final()]);
    const blob = join({ iv, tag: cipher.getAuthTag(), data });

    assert.deepEqual(ScreenSettings.decryptData(blob), PRIVATE);
  });
});

/* ------------------------------------------------------------ criterion 2 */

describe("tampered ciphertext is rejected", () => {
  for (const part of ["iv", "tag", "data"] as const) {
    for (const index of [0, -1]) {
      it(`rejects one flipped bit in the ${part} (${index === 0 ? "first" : "last"} byte)`, () => {
        const p = parts(encrypted());
        p[part] = flipBit(p[part], index === 0 ? 0 : p[part].length - 1);
        assert.deepEqual(ScreenSettings.decryptData(join(p)), DEFAULTS);
      });
    }
  }

  it("rejects a tag cut down to 4, 8 or 12 bytes", () => {
    const original = parts(encrypted());
    for (const length of [4, 8, 12]) {
      const blob = join({ ...original, tag: original.tag.subarray(0, length) });
      assert.deepEqual(ScreenSettings.decryptData(blob), DEFAULTS, `${length}-byte tag`);
    }
  });

  it("rejects ciphertext that has been cut short or extended", () => {
    const p = parts(encrypted());
    assert.deepEqual(
      ScreenSettings.decryptData(join({ ...p, data: p.data.subarray(0, p.data.length - 1) })),
      DEFAULTS,
    );
    assert.deepEqual(
      ScreenSettings.decryptData(join({ ...p, data: Buffer.concat([p.data, Buffer.from([0])]) })),
      DEFAULTS,
    );
  });

  it("rejects a blob encrypted under a different key", () => {
    const otherKey = crypto.createHash("sha256").update("some-other-secret").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", otherKey, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(PRIVATE), "utf8"), cipher.final()]);

    assert.deepEqual(ScreenSettings.decryptData(join({ iv, tag: cipher.getAuthTag(), data })), DEFAULTS);
  });

  it("rejects a correctly encrypted blob that is not JSON", () => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
    const data = Buffer.concat([cipher.update("not json", "utf8"), cipher.final()]);

    assert.deepEqual(ScreenSettings.decryptData(join({ iv, tag: cipher.getAuthTag(), data })), DEFAULTS);
  });

  it("returns the defaults instead of throwing for missing or malformed blobs", () => {
    const [iv, tag, data] = encrypted().split(".");
    for (const blob of [null, "", "plain text", `${iv}.${tag}`, `${iv}.${tag}.${data}.extra`, "..."]) {
      assert.deepEqual(ScreenSettings.decryptData(blob), DEFAULTS, String(blob));
    }
  });
});

/* -------------------------------------------- at rest, through the routes */

describe("preferences are encrypted in the database", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  function storedRow(userId: string): { payload_enc: string; color: string } {
    return db
      .prepare("SELECT payload_enc, color FROM screen_settings WHERE user_id = ?")
      .get(userId) as { payload_enc: string; color: string };
  }

  it("stores the private preferences only as ciphertext and serves them back decrypted", async () => {
    const user = seedUser("Settings owner");

    const saved = await api(server, "PUT", "/api/settings", {
      token: user.token,
      body: { color: "#3A8D5C", university: "Boston University", priceCeiling: 1234, searchRadiusMiles: 12 },
    });
    assert.equal(saved.status, 200);

    const row = storedRow(user.id);
    assert.equal(row.color, "#3A8D5C", "display columns are stored plainly, by design");
    for (const secret of ["Boston", "1234", "priceCeiling", "university"]) {
      assert.ok(!row.payload_enc.includes(secret), `"${secret}" must not appear in payload_enc`);
    }

    const read = await api(server, "GET", "/api/settings", { token: user.token });
    const settings = read.body.settings as Record<string, unknown>;
    assert.equal(settings.university, "Boston University");
    assert.equal(settings.priceCeiling, 1234);
    assert.equal(settings.searchRadiusMiles, 12);
  });

  it("serves the defaults for a tampered row, and a later save recovers it", async () => {
    const user = seedUser("Tampered");
    await api(server, "PUT", "/api/settings", {
      token: user.token,
      body: { color: "#3A8D5C", priceCeiling: 1234 },
    });

    const p = parts(storedRow(user.id).payload_enc);
    db.prepare("UPDATE screen_settings SET payload_enc = ? WHERE user_id = ?").run(
      join({ ...p, data: flipBit(p.data) }),
      user.id,
    );

    const read = await api(server, "GET", "/api/settings", { token: user.token });
    assert.equal(read.status, 200);
    const settings = read.body.settings as Record<string, unknown>;
    assert.equal(settings.priceCeiling, DEFAULTS.priceCeiling, "the tampered value is not used");
    assert.equal(settings.color, "#3A8D5C", "the plain display columns are unaffected");

    const resaved = await api(server, "PUT", "/api/settings", {
      token: user.token,
      body: { priceCeiling: 800 },
    });
    assert.equal(resaved.status, 200);
    assert.equal(ScreenSettings.decryptData(storedRow(user.id).payload_enc).priceCeiling, 800);
  });
});
