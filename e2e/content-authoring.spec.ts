import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function revealSiteNavigation(page: Page): Promise<void> {
  const compactToggle = page.getByRole("button", { name: "Open primary navigation" });
  if (await compactToggle.isVisible()) {
    await compactToggle.click();
    await expect(page.getByRole("button", { name: "Close primary navigation" })).toBeVisible();
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

async function createAdultAccount(page: Page, projectName: string): Promise<void> {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const forwardedFor = projectName === "mobile-chrome" ? "198.51.100.62" : "198.51.100.61";
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": forwardedFor });
  await page.goto("/auth/sign-up?returnTo=%2Fapp%2Fdecks%2Fnew");
  await page.getByRole("combobox", { name: /which age range describes you/i }).click();
  await page.getByRole("option", { name: "18 or older" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(`phase02-${suffix}@example.test`);
  await page.getByLabel("Password").fill(`Local-only-password-${suffix}`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fapp%2Fdecks%2Fnew$/u);
  await page.getByRole("textbox", { name: "Display name" }).fill("Content author");
  await page.getByRole("textbox", { name: "Handle" }).fill(`author_${suffix.slice(0, 12)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(page).toHaveURL(/\/app\/decks\/new$/u, { timeout: 20_000 });
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
  await createAdultAccount(page, testInfo.project.name);

  await expect(
    page.getByRole("heading", { level: 1, name: "Start with the way you want to recall" }),
  ).toBeVisible();
  await expect(page.locator(".card-type-option")).toHaveCount(17);
  await expectNoHorizontalOverflow(page);
  await expectNoSevereAxeViolations(page);

  await revealSiteNavigation(page);
  const workspaceAppearance = page.locator(".workspace-appearance").last();
  await workspaceAppearance.locator("> summary").click();
  const appearanceWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Color theme").selectOption("dark");
  expect((await appearanceWrite).ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const closeNavigation = page.getByRole("button", { name: "Close primary navigation" });
  if (await closeNavigation.isVisible()) await closeNavigation.click();

  const typedAnswer = page.locator('[aria-describedby="card-type-typed_answer-detail"]');
  await typedAnswer.focus();
  await page.keyboard.press("Space");
  await expect(typedAnswer).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Deck title" }).fill("Cell energy recall");
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A focused, published test deck about cellular energy.");
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and continue" }).click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as { data: { id: string } };
  const deckId = createdBody.data.id;

  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/edit\\?type=typed_answer$`, "u"), {
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { level: 1, name: "Typed answer" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("textbox", { name: "Prompt" })
    .fill("What molecule carries usable cellular energy?");
  await page.getByRole("textbox", { name: "Displayed answer" }).fill("ATP");
  await page
    .getByRole("textbox", { name: "Accepted typed answers" })
    .fill("ATP\nadenosine triphosphate");
  await page.getByRole("textbox", { name: "Tags" }).fill("cells, energy");
  await page
    .getByRole("textbox", { name: "Source or citation note" })
    .fill("Open biology notes, chapter 6");
  await expect(page.getByText("Sibling 1")).toBeVisible();

  const noteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save note" }).click();
  expect((await noteResponse).status()).toBe(201);
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/edit\\?note=`, "u"));
  await expectNoSevereAxeViolations(page);

  await page.getByRole("button", { name: "Open card browser" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/cards$`, "u"));
  await expect(
    page.getByRole("heading", { level: 2, name: "Notes and generated siblings" }),
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
  const publicLink = page.getByRole("link", { name: "Open public preview" });
  await expect(publicLink).toBeVisible();
  await publicLink.click();

  await expect(page).toHaveURL(new RegExp(`/deck/${publicSlug}$`, "u"));
  await expect(page.getByRole("heading", { level: 1, name: "Cell energy recall" })).toBeVisible();
  const previewCard = page.getByRole("region", { name: "Prompt card preview" });
  await expect(previewCard).toContainText("What molecule carries usable cellular energy?");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.getByRole("region", { name: "Answer card preview" })).toContainText("ATP", {
    timeout: 20_000,
  });
  await expect(page.getByText(/does not create learner progress/i)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText(deckId)).toHaveCount(0);
  await expect(page.getByText(publicId)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSevereAxeViolations(page);

  await page.goto(`/embed/deck/${publicId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Cell energy recall" })).toBeAttached();
  await expect(page.getByRole("region", { name: "Prompt card preview" })).toBeVisible();
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

  await page.getByRole("button", { name: "Delete", exact: true }).click();
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
