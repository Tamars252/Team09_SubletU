import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { TestApi } from "../helpers/api.ts";

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
      password: "sublet123",
      name: "Test Student",
    });
    assert.equal(res.status, 201);
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes("scrypt"));
    assert.ok(!JSON.stringify(res.body).includes("sublet123"));
  });

  it("rejects a duplicate email with 409", async () => {
    const email = `dupe-${Date.now()}@syr.edu`;
    const body = { email, password: "sublet123", name: "First Student" };
    assert.equal((await api.post("/api/auth/register", body)).status, 201);

    const second = await api.post<{ error: string }>("/api/auth/register", body);
    assert.equal(second.status, 409);
    assert.match(second.body.error, /already exists/i);
  });

  it("treats email as case-insensitive", async () => {
    const stamp = Date.now();
    await api.post("/api/auth/register", {
      email: `Case-${stamp}@syr.edu`,
      password: "sublet123",
      name: "Case Student",
    });
    const clash = await api.post("/api/auth/register", {
      email: `case-${stamp}@syr.edu`,
      password: "sublet123",
      name: "Other Student",
    });
    assert.equal(clash.status, 409);
  });

  it("rejects a malformed email", async () => {
    const res = await api.post("/api/auth/register", {
      email: "not-an-email",
      password: "sublet123",
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

  it("auto-verifies a .edu address but not a personal one", async () => {
    const edu = await api.registerUser();
    assert.equal(edu.user.verified, true);

    const gmail = await api.registerUser({ email: `person-${Date.now()}@gmail.com` });
    assert.equal(gmail.user.verified, false);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token for correct credentials", async () => {
    const email = `login-${Date.now()}@syr.edu`;
    await api.post("/api/auth/register", { email, password: "sublet123", name: "Login Student" });

    const res = await api.post<{ token: string }>("/api/auth/login", {
      email,
      password: "sublet123",
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it("gives the same 401 for a wrong password and an unknown account", async () => {
    const email = `enum-${Date.now()}@syr.edu`;
    await api.post("/api/auth/register", { email, password: "sublet123", name: "Enum Student" });

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
      password: "sublet123",
      name: "Password Student",
    });

    const changed = await api.post(
      "/api/auth/password",
      { currentPassword: "sublet123", newPassword: "brand-new-pw" },
      reg.body.token,
    );
    assert.equal(changed.status, 200);

    assert.equal((await api.post("/api/auth/login", { email, password: "sublet123" })).status, 401);
    assert.equal(
      (await api.post("/api/auth/login", { email, password: "brand-new-pw" })).status,
      200,
    );
  });

  it("refuses when the current password is wrong", async () => {
    const { token } = await api.registerUser();
    const res = await api.post(
      "/api/auth/password",
      { currentPassword: "not-it", newPassword: "brand-new-pw" },
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
