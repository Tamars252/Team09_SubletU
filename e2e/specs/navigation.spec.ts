import { app, expect, openTopCardDetail, resetBrowsing, signIn, test } from "../helpers/app.ts";

test.beforeEach(async ({ page }) => {
  const token = await signIn(page);
  await page.goto("/");
  await resetBrowsing(page, token);
  await page.reload();
  await expect(app.topCard(page)).toBeVisible();
});

// Post is not a tab: it opens from a button in Browse's header (see below).
const TABS = ["Browse", "Map", "Saved", "Messages", "Profile"] as const;

test.describe("tab navigation", () => {
  for (const tab of TABS) {
    test(`${tab} opens and marks itself active`, async ({ page }) => {
      await app.nav(page, tab).click();
      await expect(app.nav(page, tab)).toHaveClass(/active/);
      // Whatever the tab is, it must render something rather than a blank pane.
      await expect(page.locator(".app-main")).not.toBeEmpty();
    });
  }

  test("moving through every tab in turn leaves no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    for (const tab of TABS) {
      await app.nav(page, tab).click();
      await expect(app.nav(page, tab)).toHaveClass(/active/);
      await page.waitForTimeout(250);
    }
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("the Post button in Browse's header opens your listings", async ({ page }) => {
    await page.getByRole("button", { name: "Post a listing", exact: true }).click();
    await expect(page.locator(".header-title", { hasText: "Your listings" })).toBeVisible();
  });

  test("returning to Browse keeps the deck where it was", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await app.nav(page, "Map").click();
    await app.nav(page, "Browse").click();
    await expect(app.cardTitle(page)).toHaveText(title);
  });
});

test.describe("listing detail routing", () => {
  test("back from a detail returns to the tab you came from", async ({ page }) => {
    await app.nav(page, "Saved").click();
    await expect(app.nav(page, "Saved")).toHaveClass(/active/);

    // Save something first so the tab has a row to open.
    await app.nav(page, "Browse").click();
    const title = await app.cardTitle(page).innerText();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await app.nav(page, "Saved").click();
    await page.locator(".list-thumb").first().click();
    await expect(page.locator(".detail-hero")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(app.nav(page, "Saved")).toHaveClass(/active/);
  });

  test("the bottom nav is hidden while a listing is open", async ({ page }) => {
    await openTopCardDetail(page);
    await expect(page.locator(".nav-item")).toHaveCount(0);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".nav-item")).toHaveCount(TABS.length);
  });
});

test.describe("reload behaviour", () => {
  test("a reload on each tab comes back signed in and usable", async ({ page }) => {
    for (const tab of TABS) {
      await app.nav(page, tab).click();
      await page.reload();
      // Reload always returns to Browse, but the important part is that the
      // app comes back working rather than stuck on a spinner or the form.
      await expect(app.topCard(page)).toBeVisible();
    }
  });

  test("saved listings survive a reload", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await page.reload();
    await app.nav(page, "Saved").click();
    await expect(page.locator(".app-main")).toContainText(title);
  });
});

test.describe("gesture containment", () => {
  /**
   * Regression guard. With overscroll-behavior-x left at `auto`, a horizontal
   * swipe triggered the browser's back/forward navigation — a panel sliding in
   * from the edge — and the card never saw the gesture.
   */
  test("horizontal overscroll is contained on both axes", async ({ page }) => {
    const contain = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        htmlX: html.overscrollBehaviorX,
        htmlY: html.overscrollBehaviorY,
        bodyX: body.overscrollBehaviorX,
        bodyY: body.overscrollBehaviorY,
      };
    });
    expect(contain).toEqual({ htmlX: "none", htmlY: "none", bodyX: "none", bodyY: "none" });
  });

  test("the swipe card claims horizontal gestures via touch-action", async ({ page }) => {
    const touchAction = await app
      .topCard(page)
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe("pan-y");
  });

  test("swiping the deck never navigates away from the app", async ({ page }) => {
    const before = page.url();
    const box = await app.topCard(page).boundingBox();
    if (!box) throw new Error("no card box");

    for (let i = 0; i < 3; i += 1) {
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    expect(page.url()).toBe(before);
    await expect(app.topCard(page)).toBeVisible();
  });
});
