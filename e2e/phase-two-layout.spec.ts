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
  { height: 700, width: 1366 },
] as const;

const CARD_TYPES = [
  "basic",
  "basic_reversed",
  "optional_reversed",
  "bidirectional",
  "typed_answer",
  "multiple_choice",
  "select_all",
  "true_false",
  "cloze",
  "ordering",
  "list_answer",
  "image_occlusion",
  "diagram",
  "audio_prompt",
  "pronunciation",
  "drawing",
  "custom",
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
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
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `Horizontal overflow: ${JSON.stringify(overflow)}`,
  ).toBe(true);
}

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!bounds || !viewport) return;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectHorizontallyInsideViewport(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!bounds || !viewport) return;
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${name}.png`) });
}

async function captureLocator(locator: Locator, testInfo: TestInfo, name: string): Promise<void> {
  await locator.screenshot({ animations: "disabled", path: testInfo.outputPath(`${name}.png`) });
}

async function expectTextNotClipped(locator: Locator): Promise<void> {
  const dimensions = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
}

async function expectButtonContentInside(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  const result = await button.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    return Array.from(element.children).map((child) => {
      const inner = child.getBoundingClientRect();
      return {
        bottom: inner.bottom <= outer.bottom + 1,
        left: inner.left >= outer.left - 1,
        right: inner.right <= outer.right + 1,
        top: inner.top >= outer.top - 1,
      };
    });
  });
  expect(result.every((edge) => Object.values(edge).every(Boolean))).toBe(true);
}

async function createAdultAccount(page: Page): Promise<void> {
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Layout learner",
    emailPrefix: "phase02-layout",
    handlePrefix: "layout",
    returnTo: "/app",
  });
}

async function createDeck(
  page: Page,
  title: string,
  type: "basic" | "image_occlusion",
  testInfo?: TestInfo,
) {
  await page.goto("/app/decks/new");
  await expect(page.getByRole("heading", { level: 1, name: "Create a deck" })).toBeVisible();
  if (testInfo) await capture(page, testInfo, "new-deck-details");
  await page.getByRole("textbox", { name: "Deck title" }).fill(title);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose what to add first" }),
  ).toBeVisible();
  if (testInfo) await capture(page, testInfo, "new-deck-card-types");
  if (type === "image_occlusion") {
    await page.locator('[aria-describedby="card-type-image_occlusion-detail"]').click();
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data: { id: string } };
  await expect(page).toHaveURL(new RegExp(`/app/decks/${body.data.id}/edit\\?type=${type}$`, "u"));
  return body.data.id;
}

test("Phase 02 product surfaces remain intentional across viewports, themes, and motion settings", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "One Chromium run covers the layout matrix.",
  );
  test.setTimeout(180_000);

  await createAdultAccount(page);
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New deck" })).toHaveCount(1);
  await expectButtonContentInside(page.getByRole("link", { name: "New deck" }));
  await expect(page.locator(".library-metric")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "empty-dashboard-desktop");

  await page.setViewportSize({ height: 700, width: 1366 });
  await expectInsideViewport(page, page.getByRole("button", { name: "Appearance" }));
  await expectInsideViewport(page, page.getByRole("button", { name: "Sign out" }));

  await page.setViewportSize({ height: 900, width: 1440 });
  const deckId = await createDeck(page, "Layout biology", "basic", testInfo);
  await expect(page.getByRole("heading", { level: 1, name: "Add cards" })).toBeVisible();
  await expectButtonContentInside(page.getByRole("button", { name: "Save card" }));
  await capture(page, testInfo, "editor-desktop");
  await page.setViewportSize({ height: 568, width: 320 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
  await expectHorizontallyInsideViewport(page, page.locator(".workspace-mobile-brand"));
  await expectInsideViewport(page, page.getByRole("button", { name: "Open workspace navigation" }));
  const editorTopbarActions = page.locator(".note-editor-topbar__actions");
  await editorTopbarActions.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, editorTopbarActions);
  await expectInsideViewport(page, editorTopbarActions.getByRole("button", { name: "Preview" }));
  await expectInsideViewport(page, editorTopbarActions.getByRole("button", { name: "Save card" }));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("What surrounds a cell?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("The cell membrane");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.goto(`/app/decks/${deckId}/edit?type=basic`);
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Where is DNA stored?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("In the nucleus");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.goto(`/app/decks/${deckId}`);
  await expect(page.getByRole("heading", { level: 2, name: "Card-type mix" })).toBeVisible();
  await capture(page, testInfo, "deck-overview-desktop");
  await page.goto(`/app/decks/${deckId}/cards`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Card entries and previews" }),
  ).toBeVisible();
  await capture(page, testInfo, "card-browser-desktop");
  await page.goto(`/app/decks/${deckId}/history`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Content version history" }),
  ).toBeVisible();
  await capture(page, testInfo, "deck-history-desktop");
  await page.goto(`/app/decks/${deckId}/settings`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Deck details and publication" }),
  ).toBeVisible();
  await capture(page, testInfo, "deck-settings-desktop");
  await page.getByRole("combobox", { name: "Publication visibility" }).click();
  await page.getByRole("option", { name: "Public" }).click();
  const publishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Publish current version" }).click();
  expect((await publishResponse).ok()).toBe(true);
  const publicHref = await page
    .getByRole("link", { name: "Open public preview" })
    .getAttribute("href");
  expect(publicHref).toBeTruthy();

  await page.goto("/app/published");
  await expect(page.getByRole("heading", { level: 1, name: "Published" })).toBeVisible();
  await capture(page, testInfo, "published-decks-desktop");

  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 3, name: "Layout biology" })).toBeVisible();
  const filterBoxes = await page.locator(".library-filter-tabs button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right };
    }),
  );
  for (let index = 1; index < filterBoxes.length; index += 1) {
    expect(filterBoxes[index]!.left).toBeGreaterThanOrEqual(filterBoxes[index - 1]!.right);
  }
  const gridWidth = await page
    .locator(".deck-grid")
    .evaluate((grid) => grid.getBoundingClientRect().width);
  expect(gridWidth).toBeGreaterThan(700);
  await capture(page, testInfo, "populated-dashboard-desktop");

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => ({
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
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `${String(viewport.width)}×${String(viewport.height)} overflow: ${JSON.stringify(overflow)}`,
    ).toBe(true);
    await expectInsideViewport(
      page,
      viewport.width <= 960
        ? page.getByRole("button", { name: "Open workspace navigation" })
        : page.getByRole("button", { name: "Appearance" }),
    );
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await expectTextNotClipped(page.getByRole("link", { name: "New deck" }).locator("span"));
  await capture(page, testInfo, "populated-dashboard-mobile");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.25";
  });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.seriousMode = "true";
    document.documentElement.dataset.motion = "reduce";
  });
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "populated-dashboard-dark-serious");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.seriousMode = "false";
    document.documentElement.dataset.motion = "full";
  });

  await page.setViewportSize({ height: 900, width: 1440 });
  for (const cardType of CARD_TYPES) {
    await page.goto(`/app/decks/${deckId}/edit?type=${cardType}`);
    await expect(page.getByRole("heading", { level: 1, name: "Add cards" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectButtonContentInside(page.getByRole("button", { name: "Save card" }));
    await capture(page, testInfo, `composer-${cardType}-desktop`);
  }

  const visualDeckId = await createDeck(page, "Visual anatomy", "image_occlusion");
  await expect(page.getByRole("toolbar", { name: "image occlusion region tools" })).toHaveCount(0);
  await expect(page.locator(".geometry-stage")).toHaveCount(0);
  await capture(page, testInfo, "image-occlusion-empty");

  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable for the visual fixture.");
      context.fillStyle = "#dff4ff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#7dd3fc";
      context.beginPath();
      context.ellipse(320, 180, 210, 125, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#4f46e5";
      context.beginPath();
      context.arc(320, 180, 58, 0, Math.PI * 2);
      context.fill();
      return canvas.toDataURL("image/png").split(",", 2)[1] ?? "";
    }),
    "base64",
  );
  await page.locator('input[type="file"]').setInputFiles({
    buffer: png,
    mimeType: "image/png",
    name: "sanitized-cell.png",
  });
  await page
    .getByRole("group", { name: "Image" })
    .getByRole("textbox", { name: "Image description" })
    .fill("A simple cell diagram");
  await page.getByRole("button", { name: "Upload and attach" }).click();
  await expect(page.getByText("Image attached.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("textbox", { name: "Image description" })).toHaveCount(1);
  await expectTextNotClipped(page.getByRole("button", { name: "Remove" }).locator("span"));
  const uploadedStageImage = page.locator(".geometry-stage img");
  await expect(uploadedStageImage).toHaveCSS("object-fit", "contain");
  await expect.poll(() => uploadedStageImage.evaluate((image) => image.naturalWidth)).toBe(640);
  await expect(page.locator('.geometry-image-plane[data-image-ready="true"]')).toBeVisible();
  const toolbarButtons = page
    .getByRole("toolbar", { name: "image occlusion region tools" })
    .getByRole("button");
  const toolbarBoxes = await toolbarButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width };
    }),
  );
  expect(toolbarBoxes.every((box) => box.width > 0)).toBe(true);
  const toolbarGaps = await page
    .locator(".geometry-toolbar__group")
    .evaluateAll((groups) =>
      groups.map((group) => Number.parseFloat(getComputedStyle(group).columnGap)),
    );
  expect(toolbarGaps.every((gap) => gap > 0)).toBe(true);
  await page.getByRole("button", { name: "Add rectangle mask" }).click();
  await expect(page.getByRole("button", { name: "Select Region 1", exact: true })).toBeVisible();
  await capture(page, testInfo, "image-occlusion-with-mask");
  await captureLocator(
    page.locator(".geometry-stage"),
    testInfo,
    "image-occlusion-stage-with-mask",
  );
  await expectNoHorizontalOverflow(page);
  expect(visualDeckId).toBeTruthy();

  if (!publicHref) throw new Error("Expected a public deck link.");
  await page.goto(publicHref);
  await expect(page.getByRole("group", { name: /Question, card 1 of 2/i })).toBeVisible();
  const front = page.locator(".flashcard-front");
  const back = page.locator(".flashcard-back");
  const [frontBounds, backBounds] = await Promise.all([front.boundingBox(), back.boundingBox()]);
  expect(frontBounds).toEqual(backBounds);
  expect(await front.evaluate((face) => getComputedStyle(face).backfaceVisibility)).toBe("hidden");
  expect(await back.evaluate((face) => getComputedStyle(face).backfaceVisibility)).toBe("hidden");
  expect(
    await page.locator(".flashcard-inner").evaluate((inner) => getComputedStyle(inner).transform),
  ).toBe("none");
  await capture(page, testInfo, "public-player-front");

  await page.getByRole("group", { name: /Question, card 1 of 2/i }).click();
  await expect(page.getByRole("group", { name: /Answer, card 1 of 2/i })).toBeVisible();
  await page.waitForTimeout(500);
  expect(
    await page
      .locator(".flashcard-back .study-rich-document")
      .evaluate((content) => getComputedStyle(content).transform),
  ).toBe("none");
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, "public-player-back");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".flashcard-inner").evaluate((inner) => getComputedStyle(inner).transform),
    )
    .toBe("none");

  await page.setViewportSize({ height: 844, width: 390 });
  await expectNoHorizontalOverflow(page);
  const normalMobileScene = page.getByRole("group", { name: /Question, card 2 of 2/i });
  await expectHorizontallyInsideViewport(page, normalMobileScene);
  const normalMobileCardWidth = await normalMobileScene.evaluate(
    (scene) => scene.getBoundingClientRect().width,
  );
  expect(normalMobileCardWidth / 390).toBeGreaterThan(0.85);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, "public-player-mobile");

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => {
    localStorage.setItem(
      "lumen:appearance:v1",
      JSON.stringify({ color: "dark", reduceMotion: true, seriousMode: true }),
    );
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-serious-mode", "true");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  const mobilePreview = page.getByRole("region", { name: "Flashcard player" });
  await expect(mobilePreview).toHaveAttribute("data-reduced-motion", "true");
  await expectNoHorizontalOverflow(page);

  const mobileScene = mobilePreview.getByRole("group", { name: /Question, card 1 of 2/i });
  await expectHorizontallyInsideViewport(page, mobileScene);
  const reducedFaceTransforms = await mobilePreview
    .locator(".flashcard-face")
    .evaluateAll((faces) => faces.map((face) => getComputedStyle(face).transform));
  expect(reducedFaceTransforms).toEqual(["none", "none"]);
  await expect(mobilePreview.locator(".flashcard-front")).toBeVisible();
  await expect(mobilePreview.locator(".flashcard-back")).toBeHidden();
  await expectTextNotClipped(mobilePreview.locator(".flashcard-front .flashcard-face__content"));
  expect(
    await mobilePreview
      .locator(".flashcard-inner")
      .evaluate((inner) => getComputedStyle(inner).transform),
  ).toBe("none");

  await mobileScene.click();
  await expect(mobilePreview.getByRole("group", { name: /Answer, card 1 of 2/i })).toBeVisible();
  await expect(mobilePreview.locator('.flashcard-inner[data-flipped="true"]')).toHaveCount(1);
  await expect(mobilePreview.locator(".flashcard-front")).toBeHidden();
  await expect(mobilePreview.locator(".flashcard-back")).toBeVisible();
  await expectTextNotClipped(mobilePreview.locator(".flashcard-back .flashcard-face__content"));
  expect(
    await mobilePreview
      .locator(".flashcard-back .study-rich-document")
      .evaluate((content) => getComputedStyle(content).transform),
  ).toBe("none");
  expect(
    await mobilePreview
      .locator(".flashcard-inner")
      .evaluate((inner) => getComputedStyle(inner).transform),
  ).toBe("none");
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, "public-player-reduced-motion");

  await page.reload();
  await page.setViewportSize({ height: 568, width: 320 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const enlargedPreview = page.getByRole("region", { name: "Flashcard player" });
  await expect(enlargedPreview).toHaveAttribute("data-reduced-motion", "true");
  expect(
    await page
      .locator("html")
      .evaluate((root) => Number.parseFloat(getComputedStyle(root).fontSize)),
  ).toBeGreaterThanOrEqual(31);
  await expectNoHorizontalOverflow(page);
  const enlargedScene = enlargedPreview.getByRole("group", { name: /Question, card 1 of 2/i });
  const enlargedControls = enlargedPreview.locator(".public-preview__controls");
  await expectHorizontallyInsideViewport(page, enlargedScene);
  await enlargedControls.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, enlargedControls);
  for (const control of await enlargedControls.getByRole("button").all()) {
    await expectInsideViewport(page, control);
  }
  await expectTextNotClipped(enlargedPreview.locator(".flashcard-front .flashcard-face__content"));
  await enlargedScene.click();
  await expect(enlargedPreview.getByRole("group", { name: /Answer, card 1 of 2/i })).toBeVisible();
  await expectTextNotClipped(enlargedPreview.locator(".flashcard-back .flashcard-face__content"));
  expect(
    await enlargedPreview
      .locator(".flashcard-back .study-rich-document")
      .evaluate((content) => getComputedStyle(content).transform),
  ).toBe("none");
  await expectNoHorizontalOverflow(page);
});
