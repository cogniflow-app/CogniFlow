import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const severeViolations = result.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(severeViolations, JSON.stringify(severeViolations, null, 2)).toEqual([]);
}

async function openAppearancePanel(page: Page): Promise<void> {
  const colorTheme = page.getByLabel("Color theme");
  if (!(await colorTheme.isVisible())) {
    await page.locator(".appearance-panel > summary").click();
  }
  await expect(colorTheme).toBeVisible();
}

async function tabTo(page: Page, target: Locator, description: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard focus did not reach ${description}.`);
}

async function expectVisibleFocusIndicator(locator: Locator): Promise<void> {
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      boxShadow: style.boxShadow,
      left: box.left,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      right: box.right,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  const hasOutline = focus.outlineStyle !== "none" && focus.outlineWidth >= 2;
  const hasFocusShadow = focus.boxShadow !== "none";
  expect(hasOutline || hasFocusShadow, "Keyboard focus should have a visible indicator").toBe(true);
  expect(
    focus.left,
    "The focus indicator should remain inside the left viewport edge",
  ).toBeGreaterThanOrEqual(0);
  expect(
    focus.right,
    "The focus indicator should remain inside the right viewport edge",
  ).toBeLessThanOrEqual(focus.viewportWidth);
}

async function readLongestTransitionMilliseconds(locator: Locator): Promise<number> {
  return await locator.evaluate((element) => {
    const durations = getComputedStyle(element).transitionDuration.split(",");
    return Math.max(
      0,
      ...durations.map((duration) => {
        const value = Number.parseFloat(duration);
        return duration.trim().endsWith("ms") ? value : value * 1000;
      }),
    );
  });
}

for (const route of [
  "/",
  "/join",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/magic-link",
  "/auth/forgot-password",
  "/auth/check-email",
  "/auth/guardian-required",
  "/auth/error?reason=expired",
  "/auth/profile-locked",
  "/auth/update-password",
  "/onboarding",
  "/privacy",
  "/terms",
  "/safety",
  "/copyright",
  "/dev/design-system",
] as const) {
  test(`${route} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(route);
    const main = page.locator("main");
    await expect(main).toHaveCount(1);
    await expect(main).toBeVisible();

    await expectNoSeriousOrCriticalViolations(page);
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
  await page.goto("/auth/sign-in");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("keyboard traversal exposes a visible focus indicator on the primary action", async ({
  page,
}) => {
  await page.goto("/");
  const primaryAction = page.getByRole("link", { name: /create an account/i });
  await tabTo(page, primaryAction, "the primary landing action");
  await expect(primaryAction).toBeFocused();
  await expectVisibleFocusIndicator(primaryAction);
});

for (const theme of ["light", "dark"] as const) {
  test(`the landing page has no serious or critical axe violations in ${theme} theme`, async ({
    page,
  }) => {
    await page.goto("/");
    await openAppearancePanel(page);
    await page.getByLabel("Color theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectNoSeriousOrCriticalViolations(page);
  });
}

test("serious mode is low-motion and has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/");
  await openAppearancePanel(page);
  await page.getByLabel("Serious mode").check();
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  expect(
    await readLongestTransitionMilliseconds(page.getByRole("link", { name: /create an account/i })),
  ).toBeLessThanOrEqual(0.1);
  await expectNoSeriousOrCriticalViolations(page);
});

test("operating-system reduced motion suppresses transitions and remains accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect
    .poll(
      async () =>
        await page.locator("html").evaluate((root) => getComputedStyle(root).scrollBehavior),
    )
    .toBe("auto");
  expect(
    await readLongestTransitionMilliseconds(page.getByRole("link", { name: /create an account/i })),
  ).toBeLessThanOrEqual(0.1);
  await expectNoSeriousOrCriticalViolations(page);
});

test("the open compact navigation has no serious or critical axe violations", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open primary navigation" }).click();
  await expect(page.getByRole("button", { name: "Close primary navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByText("Appearance", { exact: true })).toBeVisible();
  await expectNoSeriousOrCriticalViolations(page);
});

test("the dark design-system gallery has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/dev/design-system");
  await page.getByText("Appearance").click();
  await page.getByLabel("Color theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await expectNoSeriousOrCriticalViolations(page);
});
