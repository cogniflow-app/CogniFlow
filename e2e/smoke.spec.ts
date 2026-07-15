import { expect, test } from "@playwright/test";

test("the public landing page exposes only real destinations", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/learn for the long term/i);
  await expect(page.getByRole("heading", { level: 1, name: /make knowledge stay/i })).toBeVisible();
  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNavigation).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "App shell" })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Access" })).toBeVisible();

  await page.getByRole("link", { name: /explore the app foundation/i }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole("heading", { level: 1, name: /a calm place to begin/i }),
  ).toBeVisible();
  await expect(page.getByText(/does not create an account session/i)).toBeVisible();
});

test("the design-system gallery renders interactive foundations", async ({ page }) => {
  await page.goto("/dev/design-system");

  await expect(page.getByRole("heading", { level: 1, name: /design system/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /open dialog/i })).toBeVisible();
  const cardFlip = page.getByRole("button", { name: /prompt side/i });
  await expect(cardFlip).toBeVisible();
  await cardFlip.click();
  await expect(cardFlip).toHaveAccessibleName(/answer side/i);
});

test("appearance controls apply dark, reduced-motion, and serious preferences", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Appearance").click();
  await page.getByLabel("Color theme").selectOption("dark");
  await page.getByLabel("Reduce motion").check();
  await page.getByLabel("Serious mode").check();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");

  await page.goto("/dev/design-system");
  const cardFlip = page.getByRole("button", { name: /prompt side/i });
  await cardFlip.click();
  await expect(
    page.getByText("What changes when a learner successfully retrieves an answer?"),
  ).toBeHidden();
  await expect(page.getByText(/retrieval routes/i)).toBeVisible();
});
