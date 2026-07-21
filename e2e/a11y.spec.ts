import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

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

async function createA11yAuthor(page: Page): Promise<void> {
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Accessibility author",
    emailPrefix: "phase02-a11y",
    handlePrefix: "a11y",
    returnTo: "/app",
  });
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
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

test("the workspace Appearance popover is pointer-accessible above the mobile drawer", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createA11yAuthor(page);
  await page.setViewportSize({ height: 844, width: 390 });

  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  const workspaceDrawer = page.getByRole("dialog", { name: "Workspace" });
  await expect(workspaceDrawer).toBeVisible();
  await workspaceDrawer.getByRole("button", { name: "Appearance" }).click();

  const appearancePopover = page.locator(".workspace-appearance__popover");
  const colorTheme = appearancePopover.getByLabel("Color theme");
  await expect(appearancePopover).toBeVisible();
  await expect(colorTheme).toBeVisible();
  const layerOrder = await Promise.all([
    appearancePopover.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)),
    workspaceDrawer.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)),
  ]);
  expect(
    layerOrder[0],
    "The Appearance popover should stack above the workspace drawer",
  ).toBeGreaterThan(layerOrder[1] ?? 0);
  expect(
    await colorTheme.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return hit === element || element.contains(hit);
    }),
    "The theme control should win pointer hit testing above the modal layer",
  ).toBe(true);

  await colorTheme.click();
  await expect(colorTheme).toBeFocused();
  await colorTheme.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(appearancePopover).toBeHidden();
  await expect(workspaceDrawer).toBeVisible();
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

test("the authenticated library, deck creation, and card editor are accessible by keyboard", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createA11yAuthor(page);

  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.getByText("Welcome back, Accessibility author.")).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectNoSeriousOrCriticalViolations(page);

  await page.setViewportSize({ height: 844, width: 390 });
  const workspaceTrigger = page.getByRole("button", { name: "Open workspace navigation" });
  await workspaceTrigger.click();
  const workspaceDrawer = page.getByRole("dialog", { name: "Workspace" });
  await expect(workspaceDrawer).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(
    await workspaceDrawer.evaluate((drawer) => drawer.contains(document.activeElement)),
    "Keyboard focus should remain trapped in the workspace drawer",
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(workspaceDrawer).toBeHidden();
  await expect(workspaceTrigger).toBeFocused();
  await page.setViewportSize({ height: 900, width: 1440 });

  await page.getByRole("link", { name: "New deck" }).click();
  await expect(page).toHaveURL(/\/app\/decks\/new$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Create a deck" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Deck title" })).toBeFocused();
  await page.getByRole("textbox", { name: "Deck title" }).fill("Accessible authoring deck");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose what to add first" }),
  ).toBeFocused();
  await expect(page.locator(".card-type-option")).toHaveCount(17);
  const typedAnswer = page.locator('[aria-describedby="card-type-typed_answer-detail"]');
  await expect(typedAnswer).toBeVisible();
  await typedAnswer.focus();
  await expect(typedAnswer).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(typedAnswer).toHaveAttribute("aria-pressed", "true");
  await expectNoDocumentOverflow(page);
  await expectNoSeriousOrCriticalViolations(page);

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(page).toHaveURL(/\/app\/decks\/[^/]+\/edit\?type=typed_answer$/u);

  const prompt = page.getByRole("textbox", { name: "Prompt" });
  await prompt.focus();
  await expect(prompt).toBeFocused();
  await page.keyboard.type("What does ATP stand for?");
  await page.getByRole("textbox", { name: "Correct answer" }).fill("Adenosine triphosphate");
  await page.getByRole("textbox", { name: "Main typed answer" }).fill("adenosine triphosphate");
  await expect(page.getByText("Card 1")).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectNoSeriousOrCriticalViolations(page);

  await page.getByRole("button", { name: "Back to deck" }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(leaveDialog).toBeVisible();
  await expectNoSeriousOrCriticalViolations(page);
  await leaveDialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/app\/decks\/[^/]+$/u);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete this deck?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete deck" }).click();
  await expect(page).toHaveURL(/\/app$/u);
});
