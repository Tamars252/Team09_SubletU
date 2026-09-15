import { expect, test as base, type Locator, type Page } from "@playwright/test";

export const DEMO = { email: "demo@syr.edu", password: "sublet123" };
export const HOST = { email: "amansour@syr.edu", password: "sublet123" };

/** The key `web/src/api/client.ts` keeps the session token under. */
const TOKEN_KEY = "subletu.token";

type Credentials = { email: string; password: string };

/**
 * Signs in over the API and plants the token before the app's first paint, so
 * a test that is not about authentication does not have to walk the login
 * form. `auth.spec.ts` exercises the real form.
 */
export async function signIn(page: Page, who: Credentials = DEMO): Promise<string> {
  const res = await page.request.post("/api/auth/login", { data: who });
  expect(res.status(), "sign-in should succeed").toBe(200);
  const { token } = (await res.json()) as { token: string };

  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, token] as const,
  );
  return token;
}

/**
 * Resets the signed-in account's browsing so each test starts from a full
 * deck. Specs share one database, so without this they would fight over which
 * listings are left.
 */
export async function resetBrowsing(page: Page, token: string): Promise<void> {
  await page.request.delete("/api/swipes?keepSaved=false", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export const app = {
  /** The top, interactive card of the swipe deck. */
  topCard: (page: Page): Locator => page.locator(".swipe-card:not(.behind)").first(),
  cardTitle: (page: Page): Locator => app.topCard(page).locator(".swipe-title"),
  nav: (page: Page, name: string): Locator => page.locator(".nav-item", { hasText: name }),
  scroller: (page: Page): Locator => page.locator(".app-main"),
};

/** Reads the deck counter ("12 listings left") as a number. */
export async function listingsLeft(page: Page): Promise<number> {
  const text = await page.locator(".app-main").innerText();
  const match = text.match(/(\d+)\s+listings? left/);
  return match ? Number(match[1]) : Number.NaN;
}

/**
 * Drags across the top card with real pointer input.
 *
 * `fromZone` picks where the press lands. The photo-tap zones each cover 32%
 * of the photo's width; pressing inside one used to block the drag entirely,
 * so "left" and "right" are the regression cases worth keeping.
 */
export async function swipeCard(
  page: Page,
  direction: "left" | "right",
  fromZone: "left" | "middle" | "right" = "middle",
  distance = 260,
): Promise<void> {
  const photo = app.topCard(page).locator(".swipe-photo");
  const box = await photo.boundingBox();
  if (!box) throw new Error("swipe photo has no bounding box");

  const ratio = fromZone === "left" ? 0.16 : fromZone === "right" ? 0.84 : 0.5;
  const startX = box.x + box.width * ratio;
  const y = box.y + box.height / 2;
  const endX = direction === "right" ? startX + distance : startX - distance;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  // Several steps so pointermove fires repeatedly, the way a real drag does.
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(startX + ((endX - startX) * i) / 8, y, { steps: 1 });
  }
  await page.mouse.up();
}

/** Opens the top card's detail screen by tapping its title. */
export async function openTopCardDetail(page: Page): Promise<string> {
  const title = (await app.cardTitle(page).innerText()).trim();
  await app.cardTitle(page).click();
  await expect(page.locator(".detail-hero")).toBeVisible();
  return title;
}

export const test = base;
export { expect };
