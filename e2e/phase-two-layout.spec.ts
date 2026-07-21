import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const VIEWPORTS = [
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
  { height: 700, width: 1366 },
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

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${name}.png`) });
}

async function createAdultAccount(page: Page): Promise<void> {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.65" });
  await page.goto("/auth/sign-up?returnTo=%2Fapp");
  await page.getByRole("combobox", { name: /which age range describes you/i }).click();
  await page.getByRole("option", { name: "18 or older" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`phase02-layout-${suffix}@example.test`);
  await page.getByLabel("Password").fill(`Local-only-password-${suffix}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fapp$/u);
  await page.getByRole("textbox", { name: "Display name" }).fill("Layout learner");
  await page.getByRole("textbox", { name: "Handle" }).fill(`layout_${suffix.slice(0, 12)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(page).toHaveURL(/\/app$/u);
}

async function createDeck(page: Page, title: string, type: "basic" | "image_occlusion") {
  await page.goto("/app/decks/new");
  await page.getByRole("textbox", { name: "Deck title" }).fill(title);
  await page.getByRole("button", { name: "Continue" }).click();
  if (type === "image_occlusion") {
    await page.locator('[aria-describedby="card-type-image_occlusion-detail"]').click();
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck" }).click();
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
  await expect(page.locator(".library-metric")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "empty-dashboard-desktop");

  await page.setViewportSize({ height: 700, width: 1366 });
  await expectInsideViewport(page, page.getByRole("button", { name: "Appearance" }));
  await expectInsideViewport(page, page.getByRole("button", { name: "Sign out" }));

  await page.setViewportSize({ height: 900, width: 1440 });
  const deckId = await createDeck(page, "Layout biology", "basic");
  await expect(page.getByRole("heading", { level: 1, name: "New note" })).toBeVisible();
  await capture(page, testInfo, "editor-desktop");
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("What surrounds a cell?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("The cell membrane");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.goto(`/app/decks/${deckId}/edit?type=basic`);
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Where is DNA stored?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("In the nucleus");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.goto(`/app/decks/${deckId}/settings`);
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
  await capture(page, testInfo, "populated-dashboard-mobile");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.25";
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

  const visualDeckId = await createDeck(page, "Visual anatomy", "image_occlusion");
  await expect(page.getByRole("button", { name: "Add rectangle mask" })).toBeDisabled();
  await expect(page.locator(".geometry-stage")).toHaveCount(0);
  await capture(page, testInfo, "image-occlusion-empty");
  const toolbarButtons = page
    .getByRole("toolbar", { name: "image occlusion region tools" })
    .getByRole("button");
  const toolbarBoxes = await toolbarButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width };
    }),
  );
  expect(toolbarBoxes.every((box) => box.width > 0)).toBe(true);
  const toolbarGaps = await page
    .locator(".geometry-toolbar__group")
    .evaluateAll((groups) =>
      groups.map((group) => Number.parseFloat(getComputedStyle(group).columnGap)),
    );
  expect(toolbarGaps.every((gap) => gap > 0)).toBe(true);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator('input[type="file"]').setInputFiles({
    buffer: png,
    mimeType: "image/png",
    name: "sanitized-cell.png",
  });
  await page.getByRole("textbox", { name: "Image description" }).fill("A simple cell diagram");
  await page.getByRole("button", { name: "Upload and attach" }).click();
  await expect(page.getByText("Image attached.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".geometry-stage img")).toHaveCSS("object-fit", "contain");
  await page.getByRole("button", { name: "Add rectangle mask" }).click();
  await expect(page.getByRole("button", { name: /Select Region 1/i })).toBeVisible();
  await capture(page, testInfo, "image-occlusion-with-mask");
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
  await capture(page, testInfo, "public-player-back");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();

  await page.setViewportSize({ height: 844, width: 390 });
  await expectNoHorizontalOverflow(page);
  await expectInsideViewport(page, page.locator(".flashcard-scene"));
  const mobileCardWidth = await page
    .locator(".flashcard-scene")
    .evaluate((scene) => scene.getBoundingClientRect().width);
  expect(mobileCardWidth / 390).toBeGreaterThan(0.85);
  await capture(page, testInfo, "public-player-mobile");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".public-preview")).toHaveAttribute("data-reduced-motion", "true");
  await page.getByRole("group", { name: /Question, card 1 of 2/i }).click();
  expect(
    await page.locator(".flashcard-inner").evaluate((inner) => getComputedStyle(inner).transform),
  ).toBe("none");
  await capture(page, testInfo, "public-player-reduced-motion");
});
