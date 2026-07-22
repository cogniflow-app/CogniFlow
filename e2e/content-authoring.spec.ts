import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

async function revealSiteNavigation(page: Page): Promise<void> {
  const compactToggle = page.getByRole("button", { name: "Open workspace navigation" });
  if (await compactToggle.isVisible()) {
    await compactToggle.click();
    await expect(page.getByRole("dialog", { name: "Workspace" })).toBeVisible();
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function expectNoSevereAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const severe = result.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
}

test("desktop and mobile authors can create, publish, preview, and clean up a typed-answer deck", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "reduced-motion",
    "Desktop and mobile authoring run here; reduced motion is covered by the appearance suite.",
  );
  test.setTimeout(90_000);
  const clientRenderedScriptWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Encountered a script tag while rendering React component")) {
      clientRenderedScriptWarnings.push(message.text());
    }
  });
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Content author",
    emailPrefix: `phase02-${testInfo.project.name}`,
    handlePrefix: "author",
    returnTo: "/app/decks/new",
  });

  await expect(page.getByRole("heading", { level: 1, name: "Create a deck" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSevereAxeViolations(page);

  await revealSiteNavigation(page);
  await page.getByRole("button", { name: "Appearance" }).last().click();
  const appearanceWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await page.getByLabel("Color theme").last().selectOption("dark");
  expect((await appearanceWrite).ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  const workspaceDialog = page.getByRole("dialog", { name: "Workspace" });
  if (await workspaceDialog.isVisible()) await page.keyboard.press("Escape");

  await page.getByRole("textbox", { name: "Deck title" }).fill("Cell energy recall");
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A focused, published test deck about cellular energy.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".card-type-option")).toHaveCount(17);
  const typedAnswer = page.locator('[aria-describedby="card-type-typed_answer-detail"]');
  await typedAnswer.focus();
  await page.keyboard.press("Space");
  await expect(typedAnswer).toHaveAttribute("aria-pressed", "true");
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as { data: { id: string } };
  const deckId = createdBody.data.id;

  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/edit\\?type=typed_answer$`, "u"), {
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { level: 1, name: "Add cards" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("textbox", { name: "Prompt" })
    .fill("What molecule carries usable cellular energy?");
  await page.getByRole("textbox", { name: "Correct answer" }).fill("ATP");
  await page.getByRole("textbox", { name: "Main typed answer" }).fill("ATP");
  await page.getByRole("button", { name: "Add accepted variation" }).click();
  await page.getByRole("textbox", { name: "Accepted variation 1" }).fill("adenosine triphosphate");
  await page.getByText("Advanced options").click();
  await page.getByRole("textbox", { name: "Tags (optional)" }).fill("cells, energy");
  await page.getByRole("textbox", { name: "Source (optional)" }).fill("Open biology, chapter 6");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Card 1")).toBeVisible();

  const noteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save card" }).click();
  expect((await noteResponse).status()).toBe(201);
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/edit\\?note=`, "u"));
  await expectNoSevereAxeViolations(page);

  await page.getByRole("button", { name: "View card previews" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/cards$`, "u"));
  await expect(
    page.getByRole("heading", { level: 2, name: "Card entries and previews" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toContainText(
    "What molecule carries usable cellular energy?",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/settings$`, "u"));
  await page.getByRole("combobox", { name: "Visibility" }).click();
  await page.getByRole("option", { name: "Public" }).click();
  const publishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Publish current version" }).click();
  const published = await publishResponse;
  expect(published.ok()).toBe(true);
  const publishedBody = (await published.json()) as {
    data: { publicId: string; publicSlug: string };
  };
  const publicId = publishedBody.data.publicId;
  const publicSlug = publishedBody.data.publicSlug;
  expect(publicId).toBeTruthy();
  expect(publicSlug).toBeTruthy();
  await page.goto("/app/published");
  await expect(page.getByRole("heading", { level: 1, name: "Published" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Cell energy recall" })).toBeVisible();
  const publicLink = page.getByRole("link", { name: "Open player" });
  await expect(publicLink).toBeVisible();
  await expect(publicLink).toHaveAttribute("href", `/deck/${publicSlug}`);
  await page.context().grantPermissions(["clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied for Cell energy recall.")).toBeVisible();
  await publicLink.click();

  await expect(page).toHaveURL(new RegExp(`/deck/${publicSlug}$`, "u"));
  await expect(page.getByRole("heading", { level: 1, name: "Cell energy recall" })).toBeVisible();
  const previewCard = page.getByRole("group", { name: /Question, card 1 of 1/i });
  await expect(previewCard).toContainText("What molecule carries usable cellular energy?");
  await previewCard.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("group", { name: /Answer, card 1 of 1/i })).toContainText("ATP", {
    timeout: 20_000,
  });
  await expect(page.getByText(/does not create learner progress/i)).toHaveCount(0);
  await expect(page.getByText("Tap to flip", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reveal answer" })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText(deckId)).toHaveCount(0);
  await expect(page.getByText(publicId)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSevereAxeViolations(page);

  await page.goto(`/embed/deck/${publicId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Cell energy recall" })).toBeAttached();
  await expect(page.getByRole("group", { name: /Question, card 1 of 1/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/app/decks/${deckId}/settings`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const unpublishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Unpublish" }).click();
  expect((await unpublishResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Unpublish" })).toHaveCount(0);
  const [privatePublicPage, privateEmbedPage] = await Promise.all([
    page.request.get(`/deck/${publicSlug}`),
    page.request.get(`/embed/deck/${publicId}`),
  ]);
  expect(privatePublicPage.status()).toBe(404);
  expect(privateEmbedPage.status()).toBe(404);

  await page.getByRole("button", { name: "More deck actions" }).click();
  await page.getByRole("menuitem", { name: "Delete deck…" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this deck?" })).toBeVisible();
  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Delete deck" }).click();
  expect((await deleteResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByText("Cell energy recall")).toHaveCount(0);
  expect(clientRenderedScriptWarnings).toEqual([]);
});
