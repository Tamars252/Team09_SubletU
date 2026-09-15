import { app, expect, openTopCardDetail, resetBrowsing, signIn, test } from "../helpers/app.ts";

test.beforeEach(async ({ page }) => {
  const token = await signIn(page);
  await page.goto("/");
  await resetBrowsing(page, token);
  await page.reload();
  await expect(app.topCard(page)).toBeVisible();
});

test.describe("listing detail", () => {
  test("the page scrolls", async ({ page }) => {
    await openTopCardDetail(page);
    const scroller = app.scroller(page);

    const metrics = await scroller.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollHeight, "detail should overflow its box").toBeGreaterThan(
      metrics.clientHeight,
    );

    // Scroll over the app itself. Past the 900px breakpoint it is a centred
    // panel, so fixed coordinates can land on the shell behind it and scroll
    // nothing at all.
    const box = await scroller.boundingBox();
    if (!box) throw new Error("scroller has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  });

  test("scrolling works starting over the hero image", async ({ page }) => {
    await openTopCardDetail(page);
    const hero = page.locator(".detail-hero");
    const box = await hero.boundingBox();
    if (!box) throw new Error("no hero box");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 500);
    await expect
      .poll(async () => app.scroller(page).evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  });

  test("it shows the computed full-term cost, not just monthly rent", async ({ page }) => {
    await openTopCardDetail(page);
    await expect(page.locator(".app-main")).toContainText(/for the full term/i);
  });

  test("save and unsave round-trip from the detail screen", async ({ page }) => {
    const title = await openTopCardDetail(page);
    // Scope to the action bar: the bottom nav also has a "Saved" button.
    const cta = page.locator(".sticky-cta");

    await cta.getByRole("button", { name: "Save", exact: true }).click();
    await expect(cta.getByRole("button", { name: "Saved" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await app.nav(page, "Saved").click();
    await expect(page.locator(".app-main")).toContainText(title);

    await page.locator(".list-thumb").first().click();
    await cta.getByRole("button", { name: "Saved" }).click();
    await expect(cta.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  });
});

test.describe("message composer", () => {
  /**
   * Regression guard. "Message host" hides the sticky action bar and renders
   * the textarea at the foot of a long page — measured at 816px below the
   * fold. Without scrolling to it the button simply vanished and the screen
   * looked frozen.
   */
  test("opening the composer brings it on screen and focuses it", async ({ page }) => {
    await openTopCardDetail(page);
    await page.getByRole("button", { name: "Message host" }).click();

    const box = page.locator(".app-main textarea");
    await expect(box).toBeVisible();
    await expect(box).toBeInViewport();
    await expect(box).toBeFocused();
  });

  test("cancelling brings the action bar back", async ({ page }) => {
    await openTopCardDetail(page);
    await page.getByRole("button", { name: "Message host" }).click();
    await expect(page.locator(".app-main textarea")).toBeVisible();
    await expect(page.locator(".sticky-cta")).toHaveCount(0);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".sticky-cta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Message host" })).toBeVisible();
  });

  test("send stays disabled until something is typed", async ({ page }) => {
    await openTopCardDetail(page);
    await page.getByRole("button", { name: "Message host" }).click();

    const send = page.getByRole("button", { name: "Send message" });
    await expect(send).toBeDisabled();

    await page.locator(".app-main textarea").fill("Is this still available?");
    await expect(send).toBeEnabled();
  });

  test("sending a message opens the conversation on the Messages tab", async ({ page }) => {
    await openTopCardDetail(page);
    await page.getByRole("button", { name: "Message host" }).click();

    const body = `E2E enquiry ${Date.now()}`;
    await page.locator(".app-main textarea").fill(body);
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(app.nav(page, "Messages")).toHaveClass(/active/);
    await expect(page.locator(".detail-hero")).toHaveCount(0);
    await expect(page.locator(".app-main")).toContainText(body);
  });

  test("you cannot message yourself about your own listing", async ({ page }) => {
    // Sign in as the host who owns listings and open one of them.
    const token = await signIn(page, { email: "amansour@syr.edu", password: "sublet123" });
    await resetBrowsing(page, token);
    await page.goto("/");
    await app.nav(page, "Profile").click();

    const res = await page.request.get("/api/listings/mine", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { results } = (await res.json()) as { results: Array<{ id: string }> };
    test.skip(results.length === 0, "host has no listings");

    await page.goto("/");
    await app.nav(page, "Saved").click();
    // Reaching an own-listing detail through the UI varies; assert the API
    // guard directly, which is what the screen relies on.
    const convo = await page.request.post("/api/messages/conversations", {
      headers: { Authorization: `Bearer ${token}` },
      data: { listingId: results[0].id, body: "hello me" },
    });
    expect(convo.status()).toBeGreaterThanOrEqual(400);
  });
});
