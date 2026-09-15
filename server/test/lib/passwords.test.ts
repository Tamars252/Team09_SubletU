import "../helpers/env.ts";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../../src/lib/passwords.ts";

describe("password hashing", () => {
  it("round-trips a password", () => {
    const stored = hashPassword("correct-horse-battery-staple");
    assert.ok(verifyPassword("correct-horse-battery-staple", stored));
    assert.ok(!verifyPassword("correct-horse-battery-stapl", stored));
  });

  it("never stores the password itself", () => {
    const stored = hashPassword("correct-horse-battery-staple");
    assert.ok(!stored.includes("correct-horse"));
  });

  it("salts, so the same password hashes differently every time", () => {
    assert.notEqual(hashPassword("the-same-password"), hashPassword("the-same-password"));
  });

  it("records its cost parameters in the hash", () => {
    const [scheme, n, r, p] = hashPassword("whatever-goes-here").split("$");
    assert.equal(scheme, "scrypt");
    assert.equal(Number(n), 1 << 16);
    assert.equal(Number(r), 8);
    assert.equal(Number(p), 1);
  });

  it("still verifies hashes written in the original format", () => {
    // `scrypt$salt$key` at Node's default cost — what the first release wrote.
    // Existing accounts must keep working across the upgrade.
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync("legacy-password-here", salt, 64);
    const legacy = `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;

    assert.ok(verifyPassword("legacy-password-here", legacy));
    assert.ok(!verifyPassword("wrong-password-here", legacy));
    assert.ok(needsRehash(legacy), "a legacy hash should be upgraded on next sign-in");
  });

  it("does not flag a current hash for rehashing", () => {
    assert.ok(!needsRehash(hashPassword("a-current-password")));
  });

  it("rejects malformed stored values rather than throwing", () => {
    for (const bad of ["", "nonsense", "scrypt$only-two", "bcrypt$a$b$c$d$e"]) {
      assert.doesNotThrow(() => verifyPassword("anything", bad));
      assert.equal(verifyPassword("anything", bad), false);
    }
  });
});

describe("password strength", () => {
  const accepts = (pw: string, context: string[] = []) => checkPasswordStrength(pw, context).ok;

  it("accepts a long passphrase with no symbols", () => {
    // Length beats punctuation — the point of the NIST guidance.
    assert.ok(accepts("correct horse battery staple"));
    assert.ok(accepts("vaulted anchor lantern moth"));
  });

  it("rejects anything under the minimum length", () => {
    const { ok, problems } = checkPasswordStrength("Sh0rt!");
    assert.ok(!ok);
    assert.ok(problems.some((p) => /at least \d+ characters/.test(p)));
  });

  it("rejects common passwords even when decorated to pass composition rules", () => {
    // These are exactly what a "needs a capital, a digit and a symbol" rule
    // produces, and they are on every cracking list.
    for (const pw of ["password1234", "Password1!", "Passw0rd!!", "qwerty123456"]) {
      assert.ok(!accepts(pw), `${pw} should be rejected`);
    }
  });

  it("rejects a password built from the user's own details", () => {
    assert.ok(!accepts("tmhaque-is-my-password", ["tmhaque", "Tareq Haque"]));
    assert.ok(!accepts("tareqtareqtareq", ["tmhaque", "Tareq"]));
  });

  it("does not reject a long passphrase that merely contains a common word", () => {
    // "sunshine" is blocklisted on its own; a real passphrase is not.
    assert.ok(accepts("the sunshine came early today"));
  });

  it("rejects repetition and simple sequences", () => {
    assert.ok(!accepts("aaaaaaaaaaaaaaaa"));
    assert.ok(!accepts("1234567890123456"));
  });

  it("rejects a password with too little variety", () => {
    assert.ok(!accepts("abababababababab"));
  });

  it("rejects leading or trailing whitespace", () => {
    const { ok, problems } = checkPasswordStrength(" a-good-long-passphrase");
    assert.ok(!ok);
    assert.ok(problems.some((p) => /space/i.test(p)));
  });

  it("caps length so a huge body cannot be used to burn CPU", () => {
    assert.ok(!accepts("a-good-passphrase-".repeat(20)));
  });

  it("returns every problem at once rather than one at a time", () => {
    const { problems } = checkPasswordStrength("abc");
    assert.ok(problems.length >= 2, `expected several problems, got ${problems.length}`);
  });
});
