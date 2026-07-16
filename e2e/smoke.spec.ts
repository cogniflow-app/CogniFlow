import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function revealSiteNavigation(page: Page): Promise<void> {
  const compactToggle = page.getByRole("button", { name: "Open primary navigation" });
  if (await compactToggle.isVisible()) {
    await compactToggle.click();
    await expect(page.getByRole("button", { name: "Close primary navigation" })).toBeVisible();
  }
}

test("the public landing page exposes only real destinations", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/learn for the long term/i);
  await expect(
    page.getByRole("heading", { level: 1, name: /learn from a foundation you control/i }),
  ).toBeVisible();
  await revealSiteNavigation(page);
  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNavigation).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Enter a room code" })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Safety" })).toBeVisible();

  await page.getByRole("link", { name: /create an account/i }).click();
  await expect(page).toHaveURL(/\/auth\/sign-up$/u);
  await expect(page.getByRole("heading", { level: 2, name: /create your account/i })).toBeVisible();
});

test("the public guest shell checks a host code without pretending a room exists", async ({
  page,
}) => {
  await page.goto("/join/ABCDEF");

  await expect(
    page.getByRole("heading", { level: 1, name: /have a room code\? check it here/i }),
  ).toBeVisible();
  const roomCode = page.getByRole("textbox", { name: "Room code" });
  await expect(roomCode).toHaveValue("ABCDEF");
  await expect(page.getByRole("button", { name: "Check room code" })).toBeVisible();
  await expect(page.getByText("Active rooms only")).toBeVisible();

  await roomCode.clear();
  await page.getByRole("button", { name: "Check room code" }).click();
  await expect(page.getByText("Enter the room code")).toBeVisible();
  await expect(page.getByText(/you joined/i)).toHaveCount(0);
});

test("protected account routes preserve a safe return destination", async ({ page }) => {
  await page.goto("/app/settings/privacy");

  await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=%2Fapp%2Fsettings%2Fprivacy$/u);
  await expect(page.getByRole("heading", { level: 2, name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/privacy and data controls/i)).toHaveCount(0);

  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=%2Fapp$/u);
});

test("an under-13 signup follows the guardian path without creating an account", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "One browser covers this server gate.");
  const authMutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/auth/")) {
      authMutations.push(request.url());
    }
  });
  await page.goto("/auth/sign-up?returnTo=%2Fapp");

  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /continue with/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await page.getByRole("combobox", { name: /which age range describes you/i }).click();
  await page.getByRole("option", { name: "Under 13" }).click();

  await expect(page).toHaveURL(/\/auth\/guardian-required$/u);
  await expect(
    page.getByRole("heading", { level: 2, name: "A child account cannot be created" }),
  ).toBeVisible();
  await expect(page.getByText(/does not collect a child email/i)).toBeVisible();
  expect(authMutations).toEqual([]);
});

test("local email signup provisions, onboards, and opens real settings", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "One local account is enough for the integration path.",
  );
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "198.51.100.41" });
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const email = `phase01-${suffix}@example.test`;
  const handle = `learner_${suffix.slice(0, 12)}`;

  await page.goto("/auth/sign-up?returnTo=%2Fapp");
  await page.getByRole("combobox", { name: /which age range describes you/i }).click();
  await page.getByRole("option", { name: "18 or older" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(`Local-only-password-${suffix}`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fapp$/u);
  await expect(
    page.getByRole("heading", { level: 1, name: "Make the workspace yours." }),
  ).toBeVisible();
  const onboardingAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    onboardingAxe.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
    JSON.stringify(onboardingAxe.violations, null, 2),
  ).toEqual([]);

  await page.getByRole("textbox", { name: "Display name" }).fill("Local learner");
  await page.getByRole("textbox", { name: "Handle" }).fill(handle);
  await page.getByRole("button", { name: "Finish account setup" }).click();

  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole("heading", { level: 1, name: "A clear place to build, Local learner." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome, Local learner." })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Library", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await revealSiteNavigation(page);
  const workspaceAppearance = page.locator(".workspace-appearance").last();
  await workspaceAppearance.locator("> summary").click();
  const darkWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Color theme").selectOption("dark");
  expect((await darkWrite).ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-color-preference", "dark");

  const motionWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Reduce motion").check();
  expect((await motionWrite).ok()).toBe(true);
  const seriousWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Serious mode").check();
  expect((await seriousWrite).ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");

  await page.addInitScript(() => {
    const observedThemes: string[] = [];
    Object.defineProperty(window, "__lumenObservedThemes", {
      configurable: true,
      value: observedThemes,
    });
    new MutationObserver(() => {
      const theme = document.documentElement.dataset.theme;
      if (theme) observedThemes.push(theme);
    }).observe(document.documentElement, { attributeFilter: ["data-theme"], attributes: true });
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const observedThemes = await page.evaluate(
    () => (window as typeof window & { __lumenObservedThemes?: string[] }).__lumenObservedThemes,
  );
  expect(observedThemes).not.toContain("light");

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await revealSiteNavigation(page);
  await page.getByRole("link", { name: "Open your workspace" }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");

  await revealSiteNavigation(page);
  await workspaceAppearance.locator("> summary").click();
  const lightWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Color theme").selectOption("light");
  expect((await lightWrite).ok()).toBe(true);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await revealSiteNavigation(page);
  await page.getByRole("link", { name: "Open your workspace" }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");

  await revealSiteNavigation(page);
  await workspaceAppearance.locator("> summary").click();
  await page.emulateMedia({ colorScheme: "dark" });
  const systemWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Color theme").selectOption("system");
  expect((await systemWrite).ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");

  const explicitWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Color theme").selectOption("dark");
  expect((await explicitWrite).ok()).toBe(true);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const secondTab = await page.context().newPage();
  await secondTab.goto("/");
  await expect(secondTab.locator("html")).toHaveAttribute("data-theme", "dark");
  await secondTab.close();

  await page.getByRole("link", { name: "Learner profiles" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/learners$/u);
  await expect(
    page.getByRole("heading", { level: 2, name: "Guardian-managed profiles unavailable" }),
  ).toBeVisible();
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
  await revealSiteNavigation(page);
  await page.locator(".appearance-panel > summary").click();
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
