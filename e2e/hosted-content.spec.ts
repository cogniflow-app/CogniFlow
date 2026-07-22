import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runId = process.env.HOSTED_ACCEPTANCE_RUN_ID;
const fixtureConfirmationFile = process.env.HOSTED_FIXTURE_CONFIRMATION_FILE;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!runId || !fixtureConfirmationFile || !baseUrl) {
  throw new Error("The guarded hosted-content environment is incomplete.");
}

async function waitForFixtureConfirmation(): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await readFile(fixtureConfirmationFile, "utf8")).trim() === runId;
        } catch {
          return false;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function signOut(page: Page): Promise<void> {
  const response = await page.request.post(`${baseUrl}/api/auth/sign-out`, {
    data: { scope: "current" },
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl!,
      "X-Lumen-CSRF": "1",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "signed_out" });
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  returnTo?: string,
): Promise<void> {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  await page.goto(`/auth/sign-in${query}`);
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new URL(returnTo ?? "/app", baseUrl).toString());
}

async function assertTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("data-color-preference", theme);
}

test("Preview supports the complete disposable Phase 02 account and content path", async ({
  page,
}) => {
  const compactRunId = runId.replaceAll("-", "");
  const email = `phase02-preview-${compactRunId}@example.test`;
  const password = `Preview-only-${compactRunId}-Pass!`;
  const deckTitle = `Preview cell recall ${compactRunId.slice(0, 8)}`;

  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toMatchObject({
    deploymentProfile: "vercel_beta",
    provider: "vercel",
    status: "ok",
    supabaseProjectRef: "cfwddajyjbueggpzfomh",
    vercelEnvironment: "preview",
  });

  await page.goto("/auth/sign-up?returnTo=%2Fapp%2Fdecks%2Fnew");
  await page.getByRole("combobox", { name: /which age range describes you/i }).click();
  await page.getByRole("option", { name: "18 or older" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/check-email$/u);

  await waitForFixtureConfirmation();
  await page.getByRole("link", { name: "Return to sign in" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fapp%2Fdecks%2Fnew$/u);

  await page.getByRole("textbox", { name: "Display name" }).fill("Preview author");
  await page.getByRole("textbox", { name: "Handle" }).fill(`preview_${compactRunId.slice(0, 12)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(page).toHaveURL(/\/app\/decks\/new$/u);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { level: 2, name: "Create your first deck" }),
  ).toBeVisible();
  await expect(page.locator(".library-metric")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New deck" })).toHaveCount(1);
  await signOut(page);
  await signIn(page, email, password);

  await page.getByRole("button", { name: "Appearance" }).last().click();
  const appearanceWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await page.getByLabel("Color theme").last().selectOption("dark");
  expect((await appearanceWrite).ok()).toBe(true);
  await assertTheme(page, "dark");
  await page.goto("/app/settings/profile");
  await assertTheme(page, "dark");
  await page.reload();
  await assertTheme(page, "dark");
  await page.goto("/app");

  await page.getByRole("link", { name: "New deck" }).click();
  await expect(page).toHaveURL(/\/app\/decks\/new$/u);
  await page.getByRole("textbox", { name: "Deck title" }).fill(deckTitle);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A disposable hosted acceptance deck.");
  await page.getByRole("button", { name: "Continue" }).click();
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as { data: { id: string } };
  const deckId = createdBody.data.id;
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/edit\\?type=basic$`, "u"));
  await assertTheme(page, "dark");

  await page
    .getByRole("textbox", { name: "Front / prompt" })
    .fill("What molecule carries cellular energy?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("ATP");
  await page.getByText("Advanced options").click();
  await page.getByRole("textbox", { name: "Source (optional)" }).fill("Hosted acceptance source");
  const noteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save card" }).click();
  const saved = await noteResponse;
  expect(saved.status()).toBe(201);
  const savedBody = (await saved.json()) as { data: { id: string } };
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/app/decks/${deckId}/edit\\?note=${savedBody.data.id}$`, "u"),
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Front / prompt" })).toContainText(
    "What molecule carries cellular energy?",
  );
  await expect(page.getByRole("textbox", { name: "Back / answer" })).toContainText("ATP");
  await page.getByText("Advanced options").click();
  await expect(page.getByRole("textbox", { name: "Source (optional)" })).toHaveValue(
    "Hosted acceptance source",
  );

  await page.getByRole("button", { name: "Open card browser" }).click();
  await expect(page.getByRole("heading", { level: 3 })).toContainText(
    "What molecule carries cellular energy?",
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Publication visibility" }).click();
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

  await signOut(page);
  await page.goto(`${baseUrl}/deck/${publishedBody.data.publicSlug}`);
  await expect(page.getByRole("heading", { level: 1, name: deckTitle })).toBeVisible();
  const card = page.getByRole("group", { name: /Question, card 1 of 1/i });
  await expect(card).toContainText("What molecule carries cellular energy?");
  await card.click();
  await expect(page.getByRole("group", { name: /Answer, card 1 of 1/i })).toContainText("ATP");

  await signIn(page, email, password, `/app/decks/${deckId}/settings`);
  const unpublishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Unpublish" }).click();
  expect((await unpublishResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Unpublish" })).toHaveCount(0);
  await signOut(page);
  const [privatePublicPage, privateEmbedPage] = await Promise.all([
    page.request.get(`${baseUrl}/deck/${publishedBody.data.publicSlug}`),
    page.request.get(`${baseUrl}/embed/deck/${publishedBody.data.publicId}`),
  ]);
  expect(privatePublicPage.status()).toBe(404);
  expect(privateEmbedPage.status()).toBe(404);
  await page.goto(`${baseUrl}/deck/${publishedBody.data.publicSlug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /couldn't find that page/i }),
  ).toBeVisible();

  await signIn(page, email, password, `/app/decks/${deckId}/settings`);

  await page.getByRole("button", { name: "More deck actions" }).click();
  await page.getByRole("menuitem", { name: "Delete deck…" }).click();
  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Delete deck" }).click();
  expect((await deleteResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByText(deckTitle)).toHaveCount(0);
});
