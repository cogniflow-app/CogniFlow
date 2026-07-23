import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

const VIEWPORTS = [
  { height: 1080, width: 1920 },
  { height: 1024, width: 1536 },
  { height: 900, width: 1440 },
  { height: 768, width: 1366 },
  { height: 800, width: 1280 },
  { height: 768, width: 1024 },
  { height: 1024, width: 768 },
  { height: 932, width: 430 },
  { height: 844, width: 390 },
  { height: 800, width: 360 },
  { height: 568, width: 320 },
  { height: 640, width: 1366 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          className: element.className,
          left: box.left,
          right: box.right,
          tag: element.tagName,
        };
      })
      .filter((box) => box.left < -1 || box.right > document.documentElement.clientWidth + 1)
      .slice(0, 8),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    result.scrollWidth,
    `Horizontal overflow: ${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}

async function expectInsideViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + Math.min(box.height, viewport.height)).toBeLessThanOrEqual(viewport.height + 1);
}

async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  await expect(page.locator('main[aria-label="Loading page"]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({
    animations: "disabled",
    fullPage,
    path: testInfo.outputPath(`${name}.png`),
  });
}

test("Phase 04 keeps real gutters, compact cards, and usable guides across the acceptance matrix", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "One desktop browser covers the explicit matrix.",
  );
  test.setTimeout(150_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Learner with a deliberately long responsive acceptance name",
    emailPrefix: "phase04-layout",
    handlePrefix: "practicevisual",
    returnTo: "/app/decks/new",
  });

  const invitation = page.getByRole("dialog", { name: /Make Lumen yours/i });
  await expectInsideViewport(page, invitation);
  await capture(page, testInfo, "guide-invitation-desktop");
  const guideWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/guides/progress") && response.request().method() === "POST",
  );
  await invitation.getByRole("button", { name: "Explore on my own" }).click();
  expect((await guideWrite).ok()).toBe(true);

  await page
    .getByRole("textbox", { name: "Deck title" })
    .fill("Cellular energetics and biochemical pathways with a deliberately long title");
  await page.getByRole("button", { name: "Continue" }).click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;
  await page
    .getByRole("textbox", { name: "Front / prompt" })
    .fill("Which molecule is the immediate energy currency used by cells?");
  await page
    .getByRole("textbox", { name: "Back / answer" })
    .fill(
      "Adenosine triphosphate (ATP), which transfers usable chemical energy between reactions.",
    );
  const noteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save card" }).click();
  expect((await noteResponse).status()).toBe(201);

  await page.goto("/app/study");
  await expect(page.getByRole("heading", { name: "Choose how you want to learn" })).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const dashboard = page.locator(".study-dashboard");
    const gutter = await dashboard.evaluate((element) => {
      const style = getComputedStyle(element);
      return Math.min(Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight));
    });
    expect(gutter).toBeGreaterThanOrEqual(viewport.width <= 700 ? 15.5 : 23.5);
  }
  await page.setViewportSize({ height: 900, width: 1440 });
  await capture(page, testInfo, "study-hub-populated");

  await page.locator('[data-guide-id="mode-flashcards"]').click();
  await expect(page.getByRole("heading", { name: "Set up Flashcards" })).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, page.getByRole("button", { name: "Start Flashcards" }));
  }
  await page.setViewportSize({ height: 844, width: 390 });
  await capture(page, testInfo, "flashcards-setup-mobile");
  await page.getByLabel("Questions").fill("1");
  await page.getByRole("button", { name: "Start Flashcards" }).click();
  await expect(page).toHaveURL(/\/app\/practice\/session\//u);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const stage = page.locator(".practice-stage");
    const card = page.locator(".practice-flip-card");
    const [stageBox, cardBox] = await Promise.all([stage.boundingBox(), card.boundingBox()]);
    expect(stageBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (stageBox && cardBox) {
      expect(cardBox.width).toBeLessThanOrEqual(Math.min(900, viewport.width - 24) + 1);
      expect(cardBox.height).toBeLessThanOrEqual(viewport.width <= 700 ? 360 : 440);
      expect(stageBox.x).toBeGreaterThanOrEqual(viewport.width <= 768 ? 15 : 23);
    }
  }
  await page.setViewportSize({ height: 568, width: 320 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
  await expectInsideViewport(page, page.getByRole("button", { name: /Show answer/ }));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    document.documentElement.style.zoom = "1.25";
  });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await capture(page, testInfo, "flashcard-session-mobile", false);

  await page.goto("/app/getting-started");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.seriousMode = "true";
    document.documentElement.dataset.motion = "reduce";
  });
  await page.setViewportSize({ height: 568, width: 320 });
  await expectNoHorizontalOverflow(page);
  const adaptive = page.locator(".guide-library article").filter({ hasText: "Use adaptive Learn" });
  await adaptive.getByRole("button", { name: "Start" }).click();
  const guide = page.getByRole("dialog", { name: "Use adaptive Learn" });
  await expectInsideViewport(page, guide);
  await capture(page, testInfo, "guide-mobile-dark-serious-reduced", false);
  await guide.getByRole("button", { name: "Skip" }).click();
  await expect(guide).toHaveCount(0);
});
