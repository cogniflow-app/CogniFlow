import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/", "/dev/design-system"] as const) {
  test(`${route} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const severeViolations = result.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );

    expect(severeViolations, JSON.stringify(severeViolations, null, 2)).toEqual([]);
  });
}

test("keyboard focus reaches the primary call to action", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("the skip link focuses a secondary route", async ({ page }) => {
  await page.goto("/auth");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("the dark design-system gallery has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/dev/design-system");
  await page.getByText("Appearance").click();
  await page.getByLabel("Color theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const severeViolations = result.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(severeViolations, JSON.stringify(severeViolations, null, 2)).toEqual([]);
});
