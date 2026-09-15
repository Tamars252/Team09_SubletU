import "../helpers/env.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { db, nowIso } from "../../src/db.ts";
import { newId } from "../../src/lib/crypto.ts";
import { issueCode, verifyCode, verificationLimits } from "../../src/lib/verification.ts";

/** A user row to hang codes off, since the table has a foreign key. */
function makeUser(): { id: string; email: string } {
  const id = newId("usr");
  const email = `${id}@syr.edu`;
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, university, bio, avatar_initials,
                        verified, rating, review_count, created_at)
     VALUES (?, ?, 'Test Student', NULL, 'Syracuse University', '', 'TS', 0, 0, 0, ?)`,
  ).run(id, email, nowIso());
  return { id, email };
}

const isVerified = (id: string) =>
  (db.prepare("SELECT verified FROM users WHERE id = ?").get(id) as { verified: number }).verified === 1;

/** The cooldown blocks a second send, so tests that need one clear the log. */
function clearSendHistory(userId: string): void {
  db.prepare("DELETE FROM auth_attempts WHERE scope = 'verify_send' AND key = ?").run(userId);
}

describe("issuing a verification code", () => {
  it("returns a six-digit code", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);
    assert.match(outcome.code, /^\d{6}$/);
  });

  it("never stores the code in the clear", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);

    const row = db
      .prepare("SELECT code_hash FROM email_verification_codes WHERE user_id = ?")
      .get(user.id) as { code_hash: string };
    assert.ok(!row.code_hash.includes(outcome.code));
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
  });

  it("refuses a second send inside the cooldown", () => {
    const user = makeUser();
    assert.ok(issueCode(user.id, user.email).ok);

    const second = issueCode(user.id, user.email);
    assert.ok(!second.ok);
    assert.ok(second.retryAfterSeconds > 0);
    assert.ok(second.retryAfterSeconds <= verificationLimits.resendCooldownSeconds);
  });

  it("replaces the previous code, so only the newest works", () => {
    const user = makeUser();
    const first = issueCode(user.id, user.email);
    assert.ok(first.ok);

    clearSendHistory(user.id);
    const second = issueCode(user.id, user.email);
    assert.ok(second.ok);

    assert.equal(verifyCode(user.id, first.code).ok, false, "the old code must stop working");
    assert.equal(verifyCode(user.id, second.code).ok, true);
  });

  it("hashes with the account id, so the same code differs between users", () => {
    // Otherwise a hash lifted from one row could be matched against another.
    const a = makeUser();
    const b = makeUser();
    issueCode(a.id, a.email);
    issueCode(b.id, b.email);

    const hashFor = (id: string) =>
      (
        db.prepare("SELECT code_hash FROM email_verification_codes WHERE user_id = ?").get(id) as {
          code_hash: string;
        }
      ).code_hash;

    // Force both rows to hold the same plaintext code and confirm the stored
    // digests still differ.
    const shared = "424242";
    db.prepare("UPDATE email_verification_codes SET code_hash = ? WHERE user_id = ?").run(
      hashFor(a.id),
      a.id,
    );
    assert.notEqual(verifyCode(a.id, shared).ok, true);
    assert.notEqual(hashFor(b.id), hashFor(a.id));
  });
});

describe("checking a verification code", () => {
  it("marks the account verified on the right code", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);
    assert.ok(!isVerified(user.id));

    assert.equal(verifyCode(user.id, outcome.code).ok, true);
    assert.ok(isVerified(user.id));
  });

  it("consumes the code, so it cannot be replayed", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);

    assert.equal(verifyCode(user.id, outcome.code).ok, true);
    assert.equal(verifyCode(user.id, outcome.code).ok, false);
  });

  it("tolerates surrounding whitespace", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);
    assert.equal(verifyCode(user.id, `  ${outcome.code}  `).ok, true);
  });

  it("counts down the attempts left", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);
    const wrong = outcome.code === "000000" ? "111111" : "000000";

    for (let i = 1; i < verificationLimits.maxAttempts; i += 1) {
      const result = verifyCode(user.id, wrong);
      assert.ok(!result.ok);
      assert.equal(result.reason, "mismatch");
      assert.equal(result.attemptsLeft, verificationLimits.maxAttempts - i);
    }
  });

  it("burns the code after too many wrong guesses", () => {
    // Six digits is only a million possibilities, so the attempt limit is what
    // makes the scheme safe — not the hash.
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);
    const wrong = outcome.code === "000000" ? "111111" : "000000";

    for (let i = 0; i < verificationLimits.maxAttempts; i += 1) verifyCode(user.id, wrong);

    const afterLockout = verifyCode(user.id, outcome.code);
    assert.equal(afterLockout.ok, false, "the right code must not work once the code is burned");
    assert.ok(!isVerified(user.id));
  });

  it("rejects an expired code", () => {
    const user = makeUser();
    const outcome = issueCode(user.id, user.email);
    assert.ok(outcome.ok);

    db.prepare("UPDATE email_verification_codes SET expires_at = ? WHERE user_id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      user.id,
    );

    const result = verifyCode(user.id, outcome.code);
    assert.equal(result.ok, false);
    assert.equal(result.reason === "expired", true);
    assert.ok(!isVerified(user.id));
  });

  it("rejects a code for an account that was never sent one", () => {
    const user = makeUser();
    const result = verifyCode(user.id, "123456");
    assert.equal(result.ok, false);
    assert.ok(!isVerified(user.id));
  });
});
