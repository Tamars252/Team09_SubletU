import type { Page } from "@playwright/test";
import { app, expect, listingsLeft, resetBrowsing, signIn, test } from "../helpers/app.ts";

test.beforeEach(async ({ page }) => {
  const token = await signIn(page);
  await page.goto("/");
  await resetBrowsing(page, token);
  await page.reload();
  await expect(app.topCard(page)).toBeVisible();
});

const reportButton = (page: Page) =>
  page.getByRole("button", { name: "Report this listing" });
const reportSheet = (page: Page) =>
  page.getByRole("dialog", { name: "Report listing" });

test.describe("reporting from the card", () => {
  test("the report button sits outside the card and does not swipe it", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    const countBefore = await listingsLeft(page);

    // Outside the card: the button is not a descendant of .swipe-card.
    await expect(app.topCard(page).getByRole("button", { name: "Report this listing" })).toHaveCount(0);

    await reportButton(page).click();
    await expect(reportSheet(page)).toBeVisible();

    // Cancelling leaves the same card on top with the same count.
    await reportSheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(reportSheet(page)).toBeHidden();
    await expect(app.cardTitle(page)).toHaveText(title);
    expect(await listingsLeft(page)).toBe(countBefore);
  });

  test("the placeholder explains what to report", async ({ page }) => {
    await reportButton(page).click();
    await expect(reportSheet(page).locator("textarea")).toHaveAttribute(
      "placeholder",
      /For example/,
    );
  });

  test("submitting a report swipes the card left", async ({ page }) => {
    const title = await app.cardTitle(page).innerText();
    const countBefore = await listingsLeft(page);

    await reportButton(page).click();
    const sheet = reportSheet(page);
    await sheet.getByRole("button", { name: "Suspected scam" }).click();
    await sheet.getByRole("button", { name: "Submit report" }).click();

    await expect(sheet).toBeHidden();
    await expect(app.cardTitle(page)).not.toHaveText(title);
    await expect.poll(() => listingsLeft(page)).toBe(countBefore - 1);

    // Left means pass: the reported listing must not land in Saved.
    await app.nav(page, "Saved").click();
    await expect(page.locator(".app-main")).not.toContainText(title);
  });
});
