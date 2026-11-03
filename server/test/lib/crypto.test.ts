import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, issueToken, verifyPassword, verifyToken } from "../../src/lib/crypto.ts";

describe("passwords", () => {
  it("round-trips and rejects the wrong password", () => {
    const stored = hashPassword("correct horse battery");
    assert.equal(verifyPassword("correct horse battery", stored), true);
    assert.equal(verifyPassword("something else", stored), false);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    assert.equal(verifyPassword("anything", "not-a-hash"), false);
  });
});

describe("tokens", () => {
  it("carries the token version it was issued with", () => {
    const payload = verifyToken(issueToken("usr_1", "a@syr.edu", 3));
    assert.equal(payload?.sub, "usr_1");
    assert.equal(payload?.tv, 3);
  });

  it("rejects a tampered signature", () => {
    const token = issueToken("usr_1", "a@syr.edu", 0);
    const [header, body] = token.split(".");
    const forged = `${header}.${body}.${"A".repeat(43)}`;
    assert.equal(verifyToken(forged), null);
  });

  it("rejects a token with no token version", () => {
    // Shape of a token issued before token_version existed.
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const header = b64({ alg: "HS256", typ: "JWT" });
    const body = b64({ sub: "usr_1", email: "a@syr.edu", iat: 0, exp: 4_102_444_800 });
    assert.equal(verifyToken(`${header}.${body}.x`), null);
  });
});
