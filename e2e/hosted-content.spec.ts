import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const runId = process.env.HOSTED_ACCEPTANCE_RUN_ID;
const supabaseUrl = process.env.HOSTED_PREVIEW_SUPABASE_URL;
const supabaseSecretKey = process.env.HOSTED_PREVIEW_SUPABASE_SECRET_KEY;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!runId || !supabaseUrl || !supabaseSecretKey || !baseUrl) {
  throw new Error("The guarded hosted-content environment is incomplete.");
}

interface AdminUser {
  readonly email?: string;
  readonly id: string;
}

function adminHeaders(): Readonly<Record<string, string>> {
  return {
    apikey: supabaseSecretKey!,
    Authorization: `Bearer ${supabaseSecretKey}`,
    "Content-Type": "application/json",
  };
}

async function readAdminUsers(): Promise<readonly AdminUser[]> {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw new Error("Preview Auth fixture lookup failed.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("users" in body) || !Array.isArray(body.users)) {
    throw new Error("Preview Auth returned an invalid user inventory.");
  }
  return body.users.filter(
    (candidate): candidate is AdminUser =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      "id" in candidate &&
      typeof candidate.id === "string",
  );
}

async function confirmAndMarkFixture(email: string): Promise<void> {
  let user: AdminUser | undefined;
  await expect
    .poll(
      async () => {
        user = (await readAdminUsers()).find((candidate) => candidate.email === email);
        return Boolean(user);
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user!.id}`, {
    body: JSON.stringify({
      email_confirm: true,
      user_metadata: { lumen_hosted_acceptance: runId },
    }),
    headers: adminHeaders(),
    method: "PUT",
  });
  if (!response.ok) throw new Error("Preview Auth fixture confirmation failed.");
}

function protectedContextHeaders(): Readonly<Record<string, string>> | undefined {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return bypass
    ? {
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      }
    : undefined;
}

async function assertTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("data-color-preference", theme);
}

test("Preview supports the complete disposable Phase 02 account and content path", async ({
  browser,
  page,
}) => {
  const compactRunId = runId.replaceAll("-", "");
  const email = `phase02-preview-${compactRunId}@example.test`;
  const password = `Preview-only-${compactRunId}-Pass!`;
  const deckTitle = `Preview cell recall ${compactRunId.slice(0, 8)}`;

  await page.goto("/auth/sign-up?returnTo=%2Fapp");
  await page.getByRole("combobox", { name: /which age range describes you/i }).click();
  await page.getByRole("option", { name: "18 or older" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/check-email$/u);

  await confirmAndMarkFixture(email);
  await page.getByRole("link", { name: "Return to sign in" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fapp$/u);

  await page.getByRole("textbox", { name: "Display name" }).fill("Preview author");
  await page.getByRole("textbox", { name: "Handle" }).fill(`preview_${compactRunId.slice(0, 12)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole("heading", { level: 2, name: "Create your first deck" }),
  ).toBeVisible();
  await expect(page.locator(".library-metric strong")).toHaveText(["0", "0", "0", "0", "0"]);

  const workspaceAppearance = page.locator(".workspace-appearance").last();
  await workspaceAppearance.locator("> summary").click();
  const appearanceWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings/appearance") &&
      response.request().method() === "PATCH",
  );
  await workspaceAppearance.getByLabel("Color theme").selectOption("dark");
  expect((await appearanceWrite).ok()).toBe(true);
  await assertTheme(page, "dark");
  await page.goto("/app/settings/profile");
  await assertTheme(page, "dark");
  await page.reload();
  await assertTheme(page, "dark");
  await page.goto("/app");

  await page.getByRole("button", { name: "Create deck", exact: true }).first().click();
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  const createDialog = page.getByRole("dialog", { name: "Create a deck" });
  await createDialog.getByRole("textbox", { name: "Deck title" }).fill(deckTitle);
  await createDialog
    .getByRole("textbox", { name: "Description" })
    .fill("A disposable hosted acceptance deck.");
  await createDialog.getByRole("button", { name: "Create deck" }).click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as { data: { id: string } };
  const deckId = createdBody.data.id;
  await expect(page).toHaveURL(new RegExp(`/app/decks/${deckId}/edit$`, "u"));
  await assertTheme(page, "dark");

  const privateDeckContext = await browser.newContext({
    extraHTTPHeaders: protectedContextHeaders(),
  });
  try {
    const [publicPage, embedPage] = await Promise.all([
      privateDeckContext.request.get(`${baseUrl}/deck/${deckId}`),
      privateDeckContext.request.get(`${baseUrl}/embed/deck/${deckId}`),
    ]);
    expect(publicPage.status()).toBe(404);
    expect(embedPage.status()).toBe(404);
  } finally {
    await privateDeckContext.close();
  }

  await page
    .getByRole("textbox", { name: "Front / prompt" })
    .fill("What molecule carries cellular energy?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("ATP");
  await page
    .getByRole("textbox", { name: "Source or citation note" })
    .fill("Hosted acceptance source");
  const noteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save note" }).click();
  expect((await noteResponse).status()).toBe(201);
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Front / prompt" })).toContainText(
    "What molecule carries cellular energy?",
  );
  await expect(page.getByRole("textbox", { name: "Back / answer" })).toContainText("ATP");
  await expect(page.getByRole("textbox", { name: "Source or citation note" })).toHaveValue(
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

  let anonymousContext: BrowserContext | undefined;
  try {
    anonymousContext = await browser.newContext({ extraHTTPHeaders: protectedContextHeaders() });
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`${baseUrl}/deck/${publishedBody.data.publicSlug}`);
    await expect(anonymousPage.getByRole("heading", { level: 1, name: deckTitle })).toBeVisible();
    const card = anonymousPage.getByRole("region", { name: "Prompt card preview" });
    await expect(card).toContainText("What molecule carries cellular energy?");
    await anonymousPage.getByRole("button", { name: "Reveal answer" }).click();
    await expect(anonymousPage.getByRole("region", { name: "Answer card preview" })).toContainText(
      "ATP",
    );

    await page.goto(`/app/decks/${deckId}/settings`);
    const unpublishResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/content/decks/${deckId}`) &&
        response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Unpublish" }).click();
    expect((await unpublishResponse).ok()).toBe(true);
    await anonymousPage.reload();
    await expect(
      anonymousPage.getByRole("heading", { level: 1, name: /couldn't find that page/i }),
    ).toBeVisible();
  } finally {
    await anonymousContext?.close();
  }

  await page.getByRole("button", { name: "Delete", exact: true }).click();
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
