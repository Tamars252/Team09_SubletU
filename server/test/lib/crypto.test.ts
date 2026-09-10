import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashPassword,
  issueToken,
  newId,
  verifyPassword,
  verifyToken,
} from "../../src/lib/crypto.ts";

describe("password hashing", () => {
  it("accepts the correct password", () => {
    assert.equal(verifyPassword("sublet123", hashPassword("sublet123")), true);
  });

  it("rejects the wrong password", () => {
    assert.equal(verifyPassword("wrong", hashPassword("sublet123")), false);
  });

  it("never stores the password in the hash", () => {
    assert.ok(!hashPassword("sublet123").includes("sublet123"));
  });

  it("salts, so the same password hashes differently every time", () => {
    assert.notEqual(hashPassword("sublet123"), hashPassword("sublet123"));
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    for (const stored of ["", "garbage", "bcrypt$a$b", "scrypt$onlysalt"]) {
      assert.equal(verifyPassword("sublet123", stored), false, `${stored} should not verify`);
    }
  });

  it("handles unicode and long passwords", () => {
    const password = "🔑 a very long passphrase with spaces and ünïcödé";
    assert.equal(verifyPassword(password, hashPassword(password)), true);
  });
});

describe("session tokens", () => {
  it("round-trips the user id and email", () => {
    const payload = verifyToken(issueToken("usr_1", "demo@syr.edu"));
    assert.equal(payload?.sub, "usr_1");
    assert.equal(payload?.email, "demo@syr.edu");
  });

  it("rejects a token with a tampered payload", () => {
    const token = issueToken("usr_1", "demo@syr.edu");
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "usr_admin", email: "a@b.c", iat: 0, exp: 9e9 }))
      .toString("base64url");

    assert.equal(verifyToken(`${header}.${forged}.${signature}`), null);
  });

  it("rejects a token signed with a different secret", () => {
    // A signature that is the right shape but not ours.
    const token = issueToken("usr_1", "demo@syr.edu");
    const [header, body] = token.split(".");
    assert.equal(verifyToken(`${header}.${body}.${"x".repeat(43)}`), null);
  });

  it("rejects structurally invalid tokens", () => {
    for (const token of ["", "a", "a.b", "a.b.c.d"]) {
      assert.equal(verifyToken(token), null, `${token} should not verify`);
    }
  });

  it("rejects an expired token", () => {
    // JWT_TTL_HOURS is 1 in tests; jump the clock past it.
    const token = issueToken("usr_1", "demo@syr.edu");
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 2 * 3600 * 1000;
      assert.equal(verifyToken(token), null);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("newId", () => {
  it("carries the prefix it was given", () => {
    assert.ok(newId("lst").startsWith("lst_"));
  });

  it("does not collide across a large batch", () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => newId("usr")));
    assert.equal(ids.size, 5_000);
  });

  it("is URL-safe", () => {
    for (let i = 0; i < 200; i++) {
      assert.match(newId("pho"), /^pho_[A-Za-z0-9_-]+$/);
    }
  });
});
