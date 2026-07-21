import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

async function gotoWithSuspendedNetworkRetry(page: Page, route: string) {
  try {
    await page.goto(route);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_NETWORK_IO_SUSPENDED"))
      throw error;
    await page.waitForTimeout(100);
    await page.goto(route);
  }
}

const viewportMatrix = [
  { height: 1080, width: 1920 },
  { height: 1024, width: 1536 },
  { height: 900, width: 1440 },
  { height: 800, width: 1280 },
  { height: 768, width: 1024 },
  { height: 1024, width: 768 },
  { height: 932, width: 430 },
  { height: 844, width: 390 },
  { height: 800, width: 360 },
  { height: 568, width: 320 },
] as const;

const publicAndAuthReflowRoutes = [
  "/",
  "/join",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/magic-link",
  "/auth/forgot-password",
  "/auth/check-email",
  "/auth/guardian-required",
  "/auth/error?reason=expired",
  "/auth/update-password",
  "/auth/profile-locked",
  "/onboarding",
  "/privacy",
  "/terms",
  "/safety",
  "/copyright",
  "/route-that-does-not-exist",
] as const;

interface ElementBox {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

function skipOutsideDesktopProject(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "The responsive matrix runs once in Chromium instead of repeating in every device project.",
  );
}

async function waitForStableTypography(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function readBox(locator: Locator, description: string): Promise<ElementBox> {
  await expect(locator, `${description} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${description} did not produce a layout box.`);

  return {
    bottom: box.y + box.height,
    height: box.height,
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    width: box.width,
  };
}

async function expectNoHorizontalPageOverflow(page: Page, description: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));

  expect(
    widths.scrollWidth,
    `${description} should not create document-level horizontal scrolling`,
  ).toBeLessThanOrEqual(widths.clientWidth + 1);
}

async function expectMainHeadingsWithinViewport(page: Page, description: string): Promise<void> {
  const results = await page.locator("main h1, main h2, main h3").evaluateAll((headings) => {
    const viewportWidth = document.documentElement.clientWidth;
    return headings
      .filter((heading) => {
        const style = getComputedStyle(heading);
        const box = heading.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0;
      })
      .map((heading) => {
        const box = heading.getBoundingClientRect();
        return {
          left: box.left,
          name: heading.textContent?.trim() ?? "unnamed heading",
          right: box.right,
          viewportWidth,
        };
      });
  });

  for (const result of results) {
    expect
      .soft(result.left, `${description}: “${result.name}” should not clip on the left`)
      .toBeGreaterThanOrEqual(-1);
    expect
      .soft(result.right, `${description}: “${result.name}” should not clip on the right`)
      .toBeLessThanOrEqual(result.viewportWidth + 1);
  }
}

async function expectMinimumTouchTarget(locator: Locator, description: string): Promise<void> {
  const box = await readBox(locator, description);
  expect
    .soft(box.width, `${description} should be at least 44 CSS pixels wide`)
    .toBeGreaterThanOrEqual(44);
  expect
    .soft(box.height, `${description} should be at least 44 CSS pixels tall`)
    .toBeGreaterThanOrEqual(44);
}

async function expectVisiblePrimaryTargetsAreUsable(
  page: Page,
  description: string,
): Promise<void> {
  const targets = page.locator(
    ".site-nav a, .site-footer a, .hero__actions a, .appearance-panel > summary",
  );
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    if (await target.isVisible()) {
      await expectMinimumTouchTarget(target, `${description}: primary target ${index + 1}`);
    }
  }

  const compactToggle = page.getByRole("button", { name: "Open primary navigation" });
  if (await compactToggle.isVisible()) {
    await expectMinimumTouchTarget(compactToggle, `${description}: compact navigation toggle`);
  }
}

function boxesIntersect(first: ElementBox, second: ElementBox): boolean {
  const horizontalIntersection =
    Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const verticalIntersection =
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return horizontalIntersection > 0.5 && verticalIntersection > 0.5;
}

async function readHeroLineCount(page: Page): Promise<number> {
  return await page.locator(".hero h1").evaluate((heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    const lineTops: number[] = [];

    for (const rectangle of Array.from(range.getClientRects())) {
      if (rectangle.width <= 0 || rectangle.height <= 0) continue;
      if (!lineTops.some((top) => Math.abs(top - rectangle.top) <= 1)) {
        lineTops.push(rectangle.top);
      }
    }

    return lineTops.length;
  });
}

async function expectLandingLayout(page: Page, description: string): Promise<void> {
  await expectNoHorizontalPageOverflow(page, description);
  await expectMainHeadingsWithinViewport(page, description);

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const headerBrand = await readBox(page.locator(".brand-lockup"), `${description}: brand`);
  const heroEyebrow = await readBox(page.locator(".hero .eyebrow"), `${description}: hero eyebrow`);
  const principlesHeading = await readBox(
    page.locator(".principles__heading").getByRole("heading", {
      level: 2,
      name: "Product principles",
    }),
    `${description}: principles heading`,
  );
  const principlesGrid = await readBox(
    page.locator(".principles__grid"),
    `${description}: principles grid`,
  );
  const footerIdentity = await readBox(
    page.locator(".site-footer__identity"),
    `${description}: footer identity`,
  );
  const appearance = page.locator(".appearance-panel > summary");
  const compactToggle = page.getByRole("button", { name: "Open primary navigation" });
  const headerEnd = await readBox(
    (await appearance.isVisible()) ? appearance : compactToggle,
    `${description}: header end control`,
  );

  for (const [name, left] of [
    ["hero", heroEyebrow.left],
    ["principles heading", principlesHeading.left],
    ["principles grid", principlesGrid.left],
    ["footer", footerIdentity.left],
  ] as const) {
    expect
      .soft(
        Math.abs(left - headerBrand.left),
        `${description}: ${name} should share the header’s inline start`,
      )
      .toBeLessThanOrEqual(1.5);
  }

  expect
    .soft(
      Math.abs(principlesGrid.right - headerEnd.right),
      `${description}: the principle grid should share the header’s inline end`,
    )
    .toBeLessThanOrEqual(1.5);
  expect
    .soft(headerBrand.left, `${description}: content needs a left gutter`)
    .toBeGreaterThanOrEqual(12);
  expect
    .soft(headerEnd.right, `${description}: header controls need a right gutter`)
    .toBeLessThanOrEqual(viewportWidth - 12);

  const primaryAction = await readBox(
    page.locator(".hero__actions").getByRole("link", { name: /create an account/i }),
    `${description}: primary hero action`,
  );
  const secondaryAction = await readBox(
    page.locator(".hero__actions").getByRole("link", { name: /^sign in$/i }),
    `${description}: secondary hero action`,
  );
  expect
    .soft(
      boxesIntersect(primaryAction, secondaryAction),
      `${description}: hero actions should never overlap`,
    )
    .toBe(false);

  const illustration = await readBox(
    page.locator(".memory-map"),
    `${description}: hero illustration`,
  );
  await expect(page.locator(".hero .lumen-page-container")).toBeVisible();
  expect
    .soft(illustration.left, `${description}: illustration should remain in its container`)
    .toBeGreaterThanOrEqual(headerBrand.left - 1);
  expect
    .soft(illustration.right, `${description}: illustration should not overflow its container`)
    .toBeLessThanOrEqual(headerEnd.right + 1);

  await expectVisiblePrimaryTargetsAreUsable(page, description);
}

async function tabTo(page: Page, target: Locator, description: string): Promise<void> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard focus did not reach ${description}.`);
}

async function expectCompactNavigationUsable(page: Page, description: string): Promise<void> {
  const open = page.getByRole("button", { name: "Open primary navigation" });
  await expect(open).toBeVisible();
  await tabTo(page, open, `${description} navigation toggle`);
  await page.keyboard.press("Enter");

  const close = page.getByRole("button", { name: "Close primary navigation" });
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(close).toBeFocused();
  await expect(close).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  await expect(page.getByText("Appearance", { exact: true })).toBeVisible();

  for (const link of await navigation.getByRole("link").all()) {
    await expect(link).toBeVisible();
    const box = await readBox(link, `${description}: compact navigation link`);
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect.soft(box.left).toBeGreaterThanOrEqual(-1);
    expect.soft(box.right).toBeLessThanOrEqual(viewportWidth + 1);
    await expectMinimumTouchTarget(link, `${description}: compact navigation link`);
  }

  const firstLink = navigation.getByRole("link").first();
  await tabTo(page, firstLink, `${description} first navigation destination`);
  await page.keyboard.press("Escape");
  await expect(open).toBeVisible();
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeHidden();
}

test.describe("public responsive layout", () => {
  test.beforeEach(({}, testInfo) => {
    skipOutsideDesktopProject(testInfo);
  });

  test("the landing page satisfies the complete viewport matrix", async ({ page }) => {
    for (const viewport of viewportMatrix) {
      await test.step(`${viewport.width} × ${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await waitForStableTypography(page);
        await expectLandingLayout(page, `${viewport.width}×${viewport.height}`);

        if (viewport.width >= 1024 && viewport.width <= 1440) {
          expect(
            await readHeroLineCount(page),
            `${viewport.width}×${viewport.height}: the hero should use no more than three balanced lines`,
          ).toBeLessThanOrEqual(3);
        }
      });
    }
  });

  test("compact navigation is keyboard operable at narrow widths", async ({ page }) => {
    for (const viewport of [
      { height: 844, width: 390 },
      { height: 568, width: 320 },
    ] as const) {
      await test.step(`${viewport.width} × ${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await expectCompactNavigationUsable(page, `${viewport.width}×${viewport.height}`);
        await expectNoHorizontalPageOverflow(page, `${viewport.width}×${viewport.height}`);
      });
    }
  });

  test("125 percent browser zoom equivalent preserves the landing layout", async ({ page }) => {
    for (const viewport of [
      { height: 800, width: 1280 },
      { height: 844, width: 390 },
    ] as const) {
      await test.step(`${viewport.width} × ${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await page.addStyleTag({ content: "html { zoom: 1.25; }" });
        await waitForStableTypography(page);
        await expectLandingLayout(page, `${viewport.width}×${viewport.height} at 125% zoom`);
      });
    }
  });

  test("200 percent text and translated-style navigation labels reflow", async ({ page }) => {
    for (const viewport of [
      { height: 768, width: 1024 },
      { height: 844, width: 390 },
      { height: 568, width: 320 },
    ] as const) {
      await test.step(`${viewport.width} × ${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        await page.locator(".site-nav a").evaluateAll(
          (links, labels) => {
            links.forEach((link, index) => {
              if (labels[index]) link.textContent = labels[index];
            });
          },
          [
            "Ausführliche Übersicht",
            "Einem Lernspiel beitreten",
            "Sicherheit und Privatsphäre",
            "Sicher beim Konto anmelden",
          ],
        );
        await waitForStableTypography(page);
        await expectNoHorizontalPageOverflow(page, `${viewport.width}×${viewport.height} at 200%`);
        await expectMainHeadingsWithinViewport(
          page,
          `${viewport.width}×${viewport.height} at 200%`,
        );

        const compactToggle = page.getByRole("button", { name: "Open primary navigation" });
        if (await compactToggle.isVisible()) {
          await compactToggle.click();
          await expectNoHorizontalPageOverflow(
            page,
            `${viewport.width}×${viewport.height} open navigation at 200%`,
          );
          for (const link of await page
            .getByRole("navigation", { name: "Primary" })
            .getByRole("link")
            .all()) {
            const box = await readBox(link, "translated compact navigation link");
            expect.soft(box.right).toBeLessThanOrEqual(viewport.width + 1);
          }
        } else {
          for (const link of await page
            .getByRole("navigation", { name: "Primary" })
            .getByRole("link")
            .all()) {
            await expect(link).toBeVisible();
          }
        }
      });
    }
  });

  test("public and authentication surfaces reflow without page overflow", async ({ page }) => {
    await page.setViewportSize({ height: 568, width: 320 });

    for (const route of publicAndAuthReflowRoutes) {
      await test.step(route, async () => {
        await gotoWithSuspendedNetworkRetry(page, route);
        if (route === "/onboarding") {
          await page.waitForURL(/\/auth\/sign-in\?returnTo=/);
        }
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        await waitForStableTypography(page);
        await expectNoHorizontalPageOverflow(page, `${route} at 320px and 200% text`);
        await expectMainHeadingsWithinViewport(page, `${route} at 320px and 200% text`);
      });
    }
  });
});
