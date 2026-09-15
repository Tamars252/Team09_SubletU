import {
  app,
  expect,
  listingsLeft,
  openTopCardDetail,
  resetBrowsing,
  signIn,
  swipeCard,
  test,
} from "../helpers/app.ts";

test.beforeEach(async ({ page }) => {
  const token = await signIn(page);
  await page.goto("/");
  await resetBrowsing(page, token);
  await page.reload();
  await expect(app.topCard(page)).toBeVisible();
});

test.describe("swipe gestures", () => {
  /**
   * The .photo-tap zones cover 32% of the photo on each side. They used to
   * carry data-no-drag, which made onPointerDown bail before a drag could
   * start — so two thirds of the card could not be swiped at all. These three
   * cases are the regression guard.
   */
  for (const zone of ["left", "middle", "right"] as const) {
    test(`a drag starting in the ${zone} of the photo swipes the card`, async ({ page }) => {
      const before = await app.cardTitle(page).innerText();
      const countBefore = await listingsLeft(page);

      await swipeCard(page, "right", zone);

      await expect(app.cardTitle(page)).not.toHaveText(before);
      expect(await listingsLeft(page)).toBe(countBefore - 1);
    });
  }

  test("a drag shorter than the threshold snaps back", async ({ page }) => {
    const before = await app.cardTitle(page).innerText();
    const countBefore = await listingsLeft(page);

    await swipeCard(page, "right", "middle", 40); // under the 96px threshold

    await expect(app.cardTitle(page)).toHaveText(before);
    expect(await listingsLeft(page)).toBe(countBefore);
  });

  test("swiping right saves the listing", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await swipeCard(page, "right");
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await app.nav(page, "Saved").click();
    await expect(page.locator(".app-main")).toContainText(title);
  });

  test("swiping left passes without saving", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await swipeCard(page, "left");
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await app.nav(page, "Saved").click();
    await expect(page.locator(".app-main")).not.toContainText(title);
  });

  test("a swiped listing does not come back on reload", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await swipeCard(page, "left");
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await page.reload();
    await expect(app.topCard(page)).toBeVisible();
    await expect(app.cardTitle(page)).not.toHaveText(title);
  });
});

test.describe("photo paging", () => {
  /**
   * The other half of the same fix: taps in those zones must still page the
   * photos, and must not swipe the card or open the listing.
   */
  test("tapping a photo zone changes photo without swiping or opening", async ({ page }) => {
    const card = app.topCard(page);
    const dots = card.locator(".photo-dots i");
    test.skip((await dots.count()) < 2, "listing has a single photo");

    const title = await app.cardTitle(page).innerText();
    const photo = card.locator(".swipe-photo");
    const box = await photo.boundingBox();
    if (!box) throw new Error("no photo box");

    await expect(dots.nth(0)).toHaveClass(/on/);
    await page.mouse.click(box.x + box.width * 0.84, box.y + box.height / 2);

    await expect(dots.nth(1)).toHaveClass(/on/);
    await expect(app.cardTitle(page)).toHaveText(title); // did not swipe
    await expect(page.locator(".detail-hero")).toHaveCount(0); // did not open
  });

  test("a drag that ends over a photo zone does not also page the photo", async ({ page }) => {
    const dots = app.topCard(page).locator(".photo-dots i");
    test.skip((await dots.count()) < 2, "listing has a single photo");

    // Drag right, finishing inside the right-hand tap zone.
    await swipeCard(page, "right", "middle", 200);

    // New card, and it starts on its first photo rather than having been paged.
    const newDots = app.topCard(page).locator(".photo-dots i");
    if ((await newDots.count()) > 0) await expect(newDots.nth(0)).toHaveClass(/on/);
  });
});

test.describe("deck controls", () => {
  test("the pass button advances the deck", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await page.getByRole("button", { name: "Pass" }).click();
    await expect(app.cardTitle(page)).not.toHaveText(title);
  });

  test("the save button advances the deck and saves", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await app.nav(page, "Saved").click();
    await expect(page.locator(".app-main")).toContainText(title);
  });

  test("undo brings the last card back", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    const countBefore = await listingsLeft(page);

    await swipeCard(page, "left");
    await expect(app.cardTitle(page)).not.toHaveText(title);

    await page.getByRole("button", { name: "Undo last swipe" }).click();
    await expect(app.cardTitle(page)).toHaveText(title);
    expect(await listingsLeft(page)).toBe(countBefore);
  });

  test("tapping a card opens its listing, and back returns to the deck", async ({ page }) => {
    const title = await openTopCardDetail(page);
    await expect(page.locator(".app-main")).toContainText(title);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(app.topCard(page)).toBeVisible();
    await expect(app.cardTitle(page)).toHaveText(title); // tapping is not a swipe
  });
});
