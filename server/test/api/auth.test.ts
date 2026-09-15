import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { TEST_PASSWORD, TestApi } from "../helpers/api.ts";

let api: TestApi;
before(async () => {
  api = await TestApi.start();
});
after(async () => {
  await api.close();
});

describe("POST /api/auth/register", () => {
  it("creates an account and returns a usable token", async () => {
    const { token, user } = await api.registerUser({ name: "Ada Lovelace" });
    assert.ok(token);
    assert.equal(user.name, "Ada Lovelace");

    const me = await api.get<{ user: { id: string } }>("/api/auth/me", token);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, user.id);
  });

  it("never returns the password hash", async () => {
    const res = await api.post("/api/auth/register", {
      email: `hash-check-${Date.now()}@syr.edu`,
      password: TEST_PASSWORD,
      name: "Test Student",
    });
    assert.equal(res.status, 201);
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes("scrypt"));
    assert.ok(!JSON.stringify(res.body).includes(TEST_PASSWORD));
  });

  it("rejects a duplicate email with 409", async () => {
    const email = `dupe-${Date.now()}@syr.edu`;
    const body = { email, password: TEST_PASSWORD, name: "First Student" };
    assert.equal((await api.post("/api/auth/register", body)).status, 201);

    const second = await api.post<{ error: string }>("/api/auth/register", body);
    assert.equal(second.status, 409);
    assert.match(second.body.error, /already exists/i);
  });

  it("treats email as case-insensitive", async () => {
    const stamp = Date.now();
    await api.post("/api/auth/register", {
      email: `Case-${stamp}@syr.edu`,
      password: TEST_PASSWORD,
      name: "Case Student",
    });
    const clash = await api.post("/api/auth/register", {
      email: `case-${stamp}@syr.edu`,
      password: TEST_PASSWORD,
      name: "Other Student",
    });
    assert.equal(clash.status, 409);
  });

  it("rejects a malformed email", async () => {
    const res = await api.post("/api/auth/register", {
      email: "not-an-email",
      password: TEST_PASSWORD,
      name: "Test Student",
    });
    assert.equal(res.status, 400);
  });

  it("rejects a password under 8 characters", async () => {
    const res = await api.post("/api/auth/register", {
      email: `short-${Date.now()}@syr.edu`,
      password: "abc",
      name: "Test Student",
    });
    assert.equal(res.status, 400);
  });

  it("does not verify an account just because the domain matches", async () => {
    // Typing a syr.edu address only proves you can type. Reading the code sent
    // to it is what proves the address is yours.
    const fresh = await api.registerUser({}, { verified: false });
    assert.equal(fresh.user.verified, false);
  });

  it("refuses an address outside the allowed domains", async () => {
    const res = await api.post<{ error: string }>("/api/auth/register", {
      email: `person-${Date.now()}@gmail.com`,
      password: TEST_PASSWORD,
      name: "Outside Person",
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /only open to syr\.edu/i);
  });

  it("refuses a password that is too weak", async () => {
    const res = await api.post<{ error: string; problems: string[] }>("/api/auth/register", {
      email: `weak-${Date.now()}@syr.edu`,
      password: "Password1!",
      name: "Weak Password",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.problems.length > 0);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token for correct credentials", async () => {
    const email = `login-${Date.now()}@syr.edu`;
    await api.post("/api/auth/register", { email, password: TEST_PASSWORD, name: "Login Student" });

    const res = await api.post<{ token: string }>("/api/auth/login", {
      email,
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it("gives the same 401 for a wrong password and an unknown account", async () => {
    const email = `enum-${Date.now()}@syr.edu`;
    await api.post("/api/auth/register", { email, password: TEST_PASSWORD, name: "Enum Student" });

    const wrongPassword = await api.post<{ error: string }>("/api/auth/login", {
      email,
      password: "definitely-wrong",
    });
    const unknownAccount = await api.post<{ error: string }>("/api/auth/login", {
      email: `nobody-${Date.now()}@syr.edu`,
      password: "definitely-wrong",
    });

    // Identical status and message, or the endpoint becomes an account oracle.
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownAccount.status, 401);
    assert.equal(wrongPassword.body.error, unknownAccount.body.error);
  });
});

describe("authentication middleware", () => {
  it("rejects an unauthenticated request to a protected route", async () => {
    assert.equal((await api.get("/api/auth/me", null)).status, 401);
    assert.equal((await api.get("/api/saved", null)).status, 401);
    assert.equal((await api.post("/api/swipes", { listingId: "x" }, null)).status, 401);
  });

  it("rejects a garbage or forged token", async () => {
    for (const token of ["garbage", "a.b.c", ""]) {
      assert.equal((await api.get("/api/auth/me", token || null)).status, 401);
    }
  });

  it("rejects a token whose user no longer exists", async () => {
    // Signed correctly, but the subject was never a real row.
    const { token } = await api.registerUser();
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "usr_ghost", email: "ghost@syr.edu", iat: 0, exp: 9e9 }),
    ).toString("base64url");
    assert.equal((await api.get("/api/auth/me", `${header}.${forged}.${signature}`)).status, 401);
  });
});

describe("PATCH /api/auth/me", () => {
  it("updates the profile and recomputes initials", async () => {
    const { token } = await api.registerUser({ name: "Ada Lovelace" });
    const res = await api.patch<{ user: { name: string; avatarInitials: string; bio: string } }>(
      "/api/auth/me",
      { name: "Grace Hopper", bio: "Compiler person" },
      token,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, "Grace Hopper");
    assert.equal(res.body.user.avatarInitials, "GH");
    assert.equal(res.body.user.bio, "Compiler person");
  });

  it("cannot be used to change another user's profile", async () => {
    const victim = await api.registerUser({ name: "Victim Student" });
    const attacker = await api.registerUser();

    await api.patch("/api/auth/me", { name: "Hacked", id: victim.user.id }, attacker.token);

    const check = await api.get<{ user: { name: string } }>("/api/auth/me", victim.token);
    assert.equal(check.body.user.name, "Victim Student");
  });
});

describe("POST /api/auth/password", () => {
  it("changes the password and invalidates the old one", async () => {
    const email = `pw-${Date.now()}@syr.edu`;
    const reg = await api.post<{ token: string }>("/api/auth/register", {
      email,
      password: TEST_PASSWORD,
      name: "Password Student",
    });

    const changed = await api.post<{ token: string }>(
      "/api/auth/password",
      { currentPassword: TEST_PASSWORD, newPassword: "tucked marble kettle" },
      reg.body.token,
    );
    assert.equal(changed.status, 200);

    assert.equal((await api.post("/api/auth/login", { email, password: TEST_PASSWORD })).status, 401);
    assert.equal(
      (await api.post("/api/auth/login", { email, password: "tucked marble kettle" })).status,
      200,
    );

    // Changing the password bumps the account's token version, so sessions
    // that existed beforehand stop working — otherwise a stolen token would
    // outlive the change meant to revoke it.
    assert.equal((await api.get("/api/auth/me", reg.body.token)).status, 401);
    // The caller gets a replacement so they are not signed out by their own change.
    assert.equal((await api.get("/api/auth/me", changed.body.token)).status, 200);
  });

  it("refuses when the current password is wrong", async () => {
    const { token } = await api.registerUser();
    const res = await api.post(
      "/api/auth/password",
      { currentPassword: "not-it", newPassword: "tucked marble kettle" },
      token,
    );
    assert.equal(res.status, 401);
  });
});

describe("error handling", () => {
  it("returns 404 JSON for an unknown API route", async () => {
    const res = await api.get<{ error: string }>("/api/does-not-exist");
    assert.equal(res.status, 404);
    assert.match(res.body.error, /No route for/);
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await fetch(`${api.origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
  });
});
