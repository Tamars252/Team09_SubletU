import { DEMO, app, expect, signIn, test, verificationCodeFor } from "../helpers/app.ts";

/**
 * These walk the real screens rather than planting a token, because the screens
 * are what they are testing. Every other spec uses the signIn() shortcut.
 *
 * The suite runs with SSO_DEV_MODE on, so "Continue with Syracuse University"
 * leads to the local stand-in instead of Microsoft. Everything downstream of
 * the identity — the handoff code, account linking, the domain rule, the
 * session — is the same code path a real Entra sign-in takes.
 */

test.describe("the sign-in screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("offers Microsoft sign-in and a password form", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Continue with Syracuse University/ })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot your password?" })).toBeVisible();
  });

  test("says plainly when the Microsoft stand-in is in use", async ({ page }) => {
    // A demo must never be mistaken for real verification.
    await expect(page.locator(".auth-dev-flag")).toContainText(/development stand-in/i);
  });

  test("signs in with the right password", async ({ page }) => {
    await page.locator('input[type="email"]').fill(DEMO.email);
    await page.locator('input[type="password"]').fill(DEMO.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(app.topCard(page)).toBeVisible();
  });

  test("rejects a wrong password and stays on the form", async ({ page }) => {
    await page.locator('input[type="email"]').fill(DEMO.email);
    await page.locator('input[type="password"]').fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.locator(".banner")).toBeVisible();
    await expect(app.topCard(page)).toHaveCount(0);
  });

  test("gives an unknown account the same message as a wrong password", async ({ page }) => {
    const message = async (email: string) => {
      await page.goto("/");
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill("not-the-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      return (await page.locator(".banner").innerText()).trim();
    };

    // Identical, or the form becomes a way to discover who has an account.
    expect(await message(`nobody-${Date.now()}@syr.edu`)).toBe(await message(DEMO.email));
  });

  test("lets the password be revealed", async ({ page }) => {
    const field = page.locator('input[type="password"]').first();
    await field.fill("hunter2-and-then-some");
    await page.getByRole("button", { name: "Show password" }).first().click();
    await expect(page.locator('input[type="text"][autocomplete="current-password"]')).toBeVisible();
  });
});

test.describe("creating an account with a password", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Create account" }).click();
  });

  test("refuses an address outside the allowed domains", async ({ page }) => {
    await page.locator('input[autocomplete="name"]').fill("Outside Person");
    await page.locator('input[type="email"]').fill(`nope-${Date.now()}@gmail.com`);
    await page.locator('input[type="password"]').fill("vaulted anchor lantern");
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page.locator(".banner")).toContainText(/only open to syr\.edu/i);
  });

  test("refuses a weak password and says why", async ({ page }) => {
    await page.locator('input[autocomplete="name"]').fill("Weak Password");
    await page.locator('input[type="email"]').fill(`weak-${Date.now()}@syr.edu`);
    await page.locator('input[type="password"]').fill("Password1!");
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page.locator(".banner")).toBeVisible();
    await expect(page.locator(".banner-list")).toContainText(/too common/i);
  });

  test("the strength meter responds as you type", async ({ page }) => {
    const field = page.locator('input[type="password"]');
    await field.fill("short");
    await expect(page.locator(".strength-label")).toHaveText(/too weak/i);

    await field.fill("vaulted anchor lantern moth");
    await expect(page.locator(".strength-label")).toHaveText(/good|strong/i);
  });

  test("accepts a long passphrase and asks to confirm the address", async ({ page }) => {
    await page.locator('input[autocomplete="name"]').fill("New Student");
    await page.locator('input[type="email"]').fill(`new-${Date.now()}@syr.edu`);
    await page.locator('input[type="password"]').fill("vaulted anchor lantern moth");
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page.locator(".auth-heading")).toHaveText(/confirm your school email/i);
    await expect(app.topCard(page)).toHaveCount(0);
  });

  test("a new password account is not verified until the code is entered", async ({ page }) => {
    await page.locator('input[autocomplete="name"]').fill("Unverified Student");
    await page.locator('input[type="email"]').fill(`unverified-${Date.now()}@syr.edu`);
    await page.locator('input[type="password"]').fill("vaulted anchor lantern moth");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.locator(".code-input")).toBeVisible();

    const me = await page.request.get("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("subletu.token"))}`,
      },
    });
    const { user } = (await me.json()) as { user: { verified: boolean } };
    expect(user.verified, "typing a syr.edu address is not proof of owning it").toBe(false);
  });
});

test.describe("Microsoft sign-in", () => {
  test("the button leads to the identity provider", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Continue with Syracuse University/ }).click();
    // Dev mode redirects to the local stand-in; a configured server would be
    // on login.microsoftonline.com by now.
    await expect(page).toHaveURL(/\/auth\/dev-sso/);
  });

  test("signing in creates a verified account and lands on the deck", async ({ page }) => {
    const email = `sso-${Date.now()}@syr.edu`;
    await page.goto("/auth/dev-sso");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="text"]').fill("SSO Student");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(app.topCard(page)).toBeVisible();
    // The one-time code must not linger in the URL, where it would reach
    // history and Referer headers.
    await expect(page).toHaveURL(/\/$/);

    const token = await page.evaluate(() => localStorage.getItem("subletu.token"));
    const me = await page.request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { user } = (await me.json()) as {
      user: { verified: boolean; linkedToSso: boolean; hasPassword: boolean };
    };
    expect(user.verified).toBe(true);
    expect(user.linkedToSso).toBe(true);
    expect(user.hasPassword, "an SSO account starts with no password").toBe(false);
  });

  test("refuses an address outside the allowed domains", async ({ page }) => {
    await page.goto("/auth/dev-sso");
    await page.locator('input[type="email"]').fill("someone@gmail.com");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.locator(".banner.error")).toContainText(/only open to syr\.edu/i);
    await expect(app.topCard(page)).toHaveCount(0);
  });

  test("a spent handoff code cannot be replayed", async ({ page }) => {
    const res = await page.request.post("/api/auth/sso/dev-complete", {
      data: { email: `replay-${Date.now()}@syr.edu`, name: "Replay Student" },
    });
    const { code } = (await res.json()) as { code: string };

    const first = await page.request.post("/api/auth/sso/exchange", { data: { code } });
    expect(first.status()).toBe(200);

    const second = await page.request.post("/api/auth/sso/exchange", { data: { code } });
    expect(second.status()).toBe(401);
  });

  test("signing in through Microsoft links to an existing password account", async ({ page }) => {
    const email = `link-${Date.now()}@syr.edu`;
    // Start with a password account...
    await page.goto("/");
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.locator('input[autocomplete="name"]').fill("Link Student");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("vaulted anchor lantern moth");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.locator(".code-input")).toBeVisible();
    const firstId = await page.evaluate(async () => {
      const r = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("subletu.token")}` },
      });
      return (await r.json()).user.id as string;
    });

    // ...then sign in to the same address through Microsoft.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/auth/dev-sso");
    await page.locator('input[type="email"]').fill(email);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(app.topCard(page)).toBeVisible();

    const linked = await page.evaluate(async () => {
      const r = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("subletu.token")}` },
      });
      return (await r.json()).user as { id: string; verified: boolean; hasPassword: boolean };
    });

    // Same account, now verified, password intact — not a duplicate.
    expect(linked.id).toBe(firstId);
    expect(linked.verified).toBe(true);
    expect(linked.hasPassword).toBe(true);
  });
});

test.describe("forgotten passwords", () => {
  test("the same reply comes back whether or not the address exists", async ({ page }) => {
    const ask = async (email: string) => {
      const res = await page.request.post("/api/auth/forgot", { data: { email } });
      return ((await res.json()) as { message: string }).message;
    };
    expect(await ask(DEMO.email)).toBe(await ask(`ghost-${Date.now()}@syr.edu`));
  });

  test("the form confirms without revealing anything", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot your password?" }).click();
    await page.locator('input[type="email"]').fill(`unknown-${Date.now()}@syr.edu`);
    await page.getByRole("button", { name: "Email me a reset link" }).click();

    await expect(page.locator(".banner.success")).toContainText(/if that email has an account/i);
  });

  test("an invalid reset link says so instead of asking for a password", async ({ page }) => {
    await page.goto("/auth/reset?token=not-a-real-token");
    await expect(page.locator(".auth-heading")).toHaveText(/expired/i);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("a reset link with no token at all is handled", async ({ page }) => {
    await page.goto("/auth/reset");
    await expect(page.locator(".auth-heading")).toHaveText(/expired/i);
  });
});

test.describe("session persistence", () => {
  test("a reload keeps you signed in", async ({ page }) => {
    await signIn(page);
    await page.goto("/");
    await expect(app.topCard(page)).toBeVisible();

    await page.reload();
    await expect(app.topCard(page)).toBeVisible();
  });

  test("a deep path still restores the session", async ({ page }) => {
    await signIn(page);
    // The API serves index.html for any non-API path, so a refresh anywhere has
    // to come back to a working, signed-in app.
    await page.goto("/anything/at/all");
    await expect(app.topCard(page)).toBeVisible();
  });

  test("signing out clears the session for good", async ({ page }) => {
    // Signs in through the form rather than signIn(), whose addInitScript
    // re-plants the token on every navigation — that would hide a sign-out
    // that failed to persist.
    await page.goto("/");
    await page.locator('input[type="email"]').fill(DEMO.email);
    await page.locator('input[type="password"]').fill(DEMO.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(app.topCard(page)).toBeVisible();

    await app.nav(page, "Profile").click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: /Continue with Syracuse/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: /Continue with Syracuse/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("subletu.token"))).toBeNull();
  });

  test("a signed-out visitor cannot see the deck", async ({ page }) => {
    await page.goto("/");
    await expect(app.topCard(page)).toHaveCount(0);
  });
});

/**
 * Email verification is the fallback for not having a Microsoft app
 * registration. It proves control of the mailbox, which is a weaker claim than
 * SSO — it says nothing about current enrolment — but it is what stops anyone
 * with a personal address from posing as a student.
 */
test.describe("confirming a school email", () => {
  async function registerFresh(page: import("@playwright/test").Page) {
    const email = `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@syr.edu`;
    await page.goto("/");
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.locator('input[autocomplete="name"]').fill("Confirm Student");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("vaulted anchor lantern moth");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.locator(".code-input")).toBeVisible();
    return email;
  }

  test("the gate names the address the code went to", async ({ page }) => {
    const email = await registerFresh(page);
    await expect(page.locator(".auth-card")).toContainText(email);
  });

  test("the right code unlocks the app", async ({ page }) => {
    const email = await registerFresh(page);
    const code = await verificationCodeFor(email);

    // Six digits is a fixed length, so the form submits on the last one.
    await page.locator(".code-input").fill(code);
    await expect(app.topCard(page)).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem("subletu.token"));
    const me = await page.request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(((await me.json()) as { user: { verified: boolean } }).user.verified).toBe(true);
  });

  test("a wrong code says how many attempts are left", async ({ page }) => {
    const email = await registerFresh(page);
    const real = await verificationCodeFor(email);
    const wrong = real === "000000" ? "111111" : "000000";

    await page.locator(".code-input").fill(wrong);
    await expect(page.locator(".banner.error")).toContainText(/attempts left/i);
    await expect(app.topCard(page)).toHaveCount(0);
  });

  test("the code is burned after five wrong guesses", async ({ page }) => {
    const email = await registerFresh(page);
    const real = await verificationCodeFor(email);
    const wrong = real === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) {
      await page.locator(".code-input").fill(wrong);
      await expect(page.locator(".banner.error")).toBeVisible();
    }
    await expect(page.locator(".banner.error")).toContainText(/too many wrong codes/i);

    // Even the real code is dead now — the limit is what makes six digits safe.
    await page.locator(".code-input").fill(real);
    await expect(page.locator(".banner.error")).toBeVisible();
    await expect(app.topCard(page)).toHaveCount(0);
  });

  test("resend is on a cooldown", async ({ page }) => {
    await registerFresh(page);
    await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
  });

  test("an unverified account cannot post or message, over the API", async ({ page }) => {
    // The screen gates too, but this is the check that actually holds — the
    // API is reachable without the UI.
    await registerFresh(page);
    const token = await page.evaluate(() => localStorage.getItem("subletu.token"));
    const auth = { Authorization: `Bearer ${token}` };

    const listing = await page.request.post("/api/listings", { headers: auth, data: {} });
    expect(listing.status()).toBe(403);

    const convo = await page.request.post("/api/messages/conversations", {
      headers: auth,
      data: { listingId: "lst_whatever", body: "hello" },
    });
    expect(convo.status()).toBe(403);

    // Browsing stays open, so a new account can look around while it waits.
    const deck = await page.request.get("/api/listings/deck", { headers: auth });
    expect(deck.status()).toBe(200);
  });

  test("signing out and back in returns to the gate, not the app", async ({ page }) => {
    const email = await registerFresh(page);
    await page.getByRole("button", { name: "Use a different account" }).click();
    await expect(page.getByRole("link", { name: /Continue with Syracuse/ })).toBeVisible();

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("vaulted anchor lantern moth");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.locator(".code-input")).toBeVisible();
    await expect(app.topCard(page)).toHaveCount(0);
  });

  test("Microsoft sign-in skips the gate entirely", async ({ page }) => {
    await page.goto("/auth/dev-sso");
    await page.locator('input[type="email"]').fill(`skip-${Date.now()}@syr.edu`);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(app.topCard(page)).toBeVisible();
    await expect(page.locator(".code-input")).toHaveCount(0);
  });
});
