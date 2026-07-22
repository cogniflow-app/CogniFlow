import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator('main[aria-label="Loading page"]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: testInfo.outputPath(`${name}.png`),
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
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
    scroll: document.documentElement.scrollWidth,
  }));
  expect(
    sizes.scroll,
    `Horizontal overflow: ${JSON.stringify(sizes.offenders)}`,
  ).toBeLessThanOrEqual(sizes.client + 1);
}

async function expectPhaseThreeGutters(page: Page, selector: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The responsive viewport is unavailable.");
  const expected = viewport.width <= 700 ? 16 : viewport.width >= 1200 ? 32 : 24;
  const spacing = await page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      paddingTop: Number.parseFloat(style.paddingTop),
    };
  });
  expect(spacing.paddingLeft).toBeGreaterThanOrEqual(expected - 0.5);
  expect(spacing.paddingRight).toBeGreaterThanOrEqual(expected - 0.5);
  expect(spacing.paddingTop).toBeGreaterThanOrEqual((viewport.width <= 700 ? 16 : 24) - 0.5);
}

async function createDeckWithCards(page: Page, title: string) {
  await page.goto("/app/decks/new");
  await page.getByRole("textbox", { name: "Deck title" }).fill(title);
  await page.getByRole("button", { name: "Continue" }).click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;
  const noteIds: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("textbox", { name: "Front / prompt" }).fill(`Visual prompt ${index + 1}`);
    await page.getByRole("textbox", { name: "Back / answer" }).fill(`Visual answer ${index + 1}`);
    const noteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: index === 0 ? "Save and add another" : "Save card" })
      .click();
    const body = (await (await noteResponse).json()) as { data: { id: string } };
    noteIds.push(body.data.id);
  }
  return { deckId, noteIds };
}

async function startDeckSession(page: Page, title: string) {
  await page.goto("/app/study");
  const row = page.locator(".study-deck-row").filter({ hasText: title });
  await row.getByRole("button", { name: "Study" }).click();
  await expect(page).toHaveURL(/\/app\/study\/session\//u);
}

async function startReviewAheadForDeck(page: Page, title: string) {
  await page.goto("/app/study");
  await page.getByRole("button", { name: "Build a session" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Selected decks/u }).click();
  await dialog.getByRole("checkbox", { name: title }).check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Review ahead" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: /Update my schedule/u }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/app\/study\/session\//u);
}

async function rate(page: Page, rating: "Good") {
  await page.getByRole("button", { name: /Show answer/u }).click();
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/study/reviews") && candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: new RegExp(rating, "u") }).click();
  expect((await response).status()).toBe(200);
}

test("Phase 03 Study surfaces remain calm, responsive, and visually complete", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "reduced-motion",
    "The desktop run switches the real media preference and captures the reduced-motion surface.",
  );
  test.setTimeout(150_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Visual review learner",
    emailPrefix: `phase03-visual-${testInfo.project.name}`,
    handlePrefix: "srsvisual",
    returnTo: "/app/study",
  });

  const welcomeGuide = page.getByRole("dialog", { name: /Make Lumen yours/i });
  await welcomeGuide.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await welcomeGuide.isVisible().catch(() => false)) {
    const guideWrite = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/guides/progress") && response.request().method() === "POST",
    );
    await welcomeGuide.getByRole("button", { name: "Explore on my own" }).click();
    expect((await guideWrite).ok()).toBe(true);
  }

  await expect(page.getByRole("heading", { level: 1, name: /Ready when you are/u })).toBeVisible();
  await expect(page.getByText(/Nothing is scheduled right now/u)).toBeVisible();
  await expectPhaseThreeGutters(page, ".study-dashboard");
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "study-empty");
  await page.goto("/app/stats");
  await expect(
    page.getByRole("heading", { name: "Your first review will start the picture" }),
  ).toBeVisible();
  await capture(page, testInfo, "statistics-zero-state");

  const title = `Visual SRS ${testInfo.project.name}`;
  const { deckId, noteIds } = await createDeckWithCards(page, title);
  await page.goto(`/app/decks/${deckId}`);
  await expect(
    page.locator("#main-content").getByRole("link", { name: "Study", exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "deck-study-entry");

  await page.goto("/app/study");
  await expect(page.locator(".study-deck-row").filter({ hasText: title })).toContainText("2");
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "study-populated");
  await page.getByRole("button", { name: "Build a session" }).click();
  await expect(page.getByRole("heading", { name: "What do you want to study?" })).toBeVisible();
  await capture(page, testInfo, "custom-study");

  if (testInfo.project.name === "chromium-desktop") {
    await page.goto("/app/settings/scheduling");
    await expect(page.getByRole("heading", { level: 1, name: "Memory settings" })).toBeVisible();
    await expect(page.getByLabel("Maximum interval (days)")).not.toBeVisible();
    await capture(page, testInfo, "scheduling-settings");
    await page.getByRole("tab", { name: "Advanced" }).click();
    await expect(page.getByLabel("Maximum interval (days)")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "scheduling-settings-advanced");
  }

  await startDeckSession(page, title);
  const pauseResponse = page.waitForResponse(
    (response) => response.url().endsWith("/control") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Pause" }).click();
  expect((await pauseResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/app\/study$/u, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Continue your session" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Visual prompt 1")).toBeVisible();
  await expect(page.getByText("Visual answer 1")).toHaveCount(0);
  const reviewScene = page.locator(".review-card-scene");
  const compactReviewViewport = (page.viewportSize()?.width ?? 1_000) <= 700;
  const reviewBodySpacing = await page.locator(".review-session__body").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
    };
  });
  expect(reviewBodySpacing.paddingLeft).toBeGreaterThanOrEqual(compactReviewViewport ? 15.5 : 23.5);
  expect(reviewBodySpacing.paddingRight).toBeGreaterThanOrEqual(
    compactReviewViewport ? 15.5 : 23.5,
  );
  const reviewSceneBox = await reviewScene.boundingBox();
  if (!reviewSceneBox) throw new Error("The review card scene is unavailable.");
  expect(reviewSceneBox.width).toBeLessThanOrEqual(801);
  expect(reviewSceneBox.height).toBeLessThanOrEqual(compactReviewViewport ? 353 : 417);
  const cardFlipper = page.locator('.review-card-flipper[data-flipped="false"]');
  await expect(cardFlipper).toBeVisible();
  const flipMotion = await cardFlipper.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      duration: Number.parseFloat(style.transitionDuration),
      transformStyle: style.transformStyle,
    };
  });
  expect(flipMotion.transformStyle).toBe("preserve-3d");
  expect(flipMotion.duration).toBeGreaterThanOrEqual(0.22);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "review-prompt");
  await reviewScene.click();
  await expect(page.getByText("Visual answer 1")).toBeVisible();
  await expect(page.locator('.review-card-flipper[data-flipped="true"]')).toBeVisible();
  await expect(page.locator(".review-card--prompt")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Again/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Hard/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Good/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Easy/u })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "review-answer-ratings");
  if (testInfo.project.name === "chromium-desktop") {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await capture(page, testInfo, "review-reduced-motion");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }

  const firstReview = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/study/reviews") && candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Good/u }).click();
  expect((await firstReview).status()).toBe(200);
  await expect(page.getByText("Visual prompt 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo last" })).toBeVisible();
  await capture(page, testInfo, "review-undo-available");
  const undo = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/study/reviews/undo") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Undo last" }).click();
  expect((await undo).status()).toBe(200);
  await expect(page.getByText("Visual prompt 1")).toBeVisible();
  await capture(page, testInfo, "review-after-undo");
  await rate(page, "Good");
  await expect(page.getByText("Visual prompt 2")).toBeVisible();
  await rate(page, "Good");
  await expect(page.getByRole("heading", { level: 1, name: "That’s the queue." })).toBeVisible();
  await expect(page.getByText("Again").locator("..")).toContainText("0");
  await expect(page.getByText("Good").locator("..")).toContainText("2");
  await expect(page.getByText("Today remaining")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo last review" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "session-completion");

  await page.goto("/app/stats");
  await expect(page.getByRole("heading", { level: 1, name: "Your review picture" })).toBeVisible();
  await capture(page, testInfo, "study-statistics");
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.getByText("Recent review timeline").click();
  await expect(page.getByRole("link", { name: "Edit card" }).first()).toBeVisible();
  await capture(page, testInfo, "card-history");

  if (testInfo.project.name === "chromium-desktop") {
    const statisticsDeck = "Statistics history sample";
    await createDeckWithCards(page, statisticsDeck);
    await startDeckSession(page, statisticsDeck);
    await rate(page, "Good");
    await rate(page, "Good");
    await page.goto("/app/stats");
    await expect(page.getByRole("tab", { name: "Memory" })).toBeVisible();
    await page.getByRole("tab", { name: "Memory" }).click();
    await capture(page, testInfo, "statistics-sufficient-history");

    for (let index = 0; index < noteIds.length; index += 1) {
      await page.goto(`/app/decks/${deckId}/edit?note=${noteIds[index]}`);
      const answer = page.getByRole("textbox", { name: "Back / answer" });
      await answer.fill(`Changed visual answer ${index + 1}`);
      await page.getByRole("button", { name: "Save card" }).click();
      await expect(page.getByText("All changes saved.")).toBeVisible();
    }
    await startReviewAheadForDeck(page, title);
    await expect(page.getByLabel("Content change decision")).toBeVisible();
    await page.getByRole("button", { name: /Show answer/u }).click();
    await capture(page, testInfo, "content-change-decision");

    const appearanceWrite = await page.request.patch("/api/settings/appearance", {
      data: { reduceMotion: false, seriousMode: true, theme: "system" },
      headers: { Origin: new URL(page.url()).origin, "X-Lumen-CSRF": "1" },
    });
    expect(appearanceWrite.status()).toBe(200);
    await page.reload();
    await expect(page.locator(".review-session--serious")).toBeVisible();
    await capture(page, testInfo, "review-serious-mode");
  }

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
});
