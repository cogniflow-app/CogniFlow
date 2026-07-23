import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runId = process.env.HOSTED_ACCEPTANCE_RUN_ID;
const fixtureConfirmationFile = process.env.HOSTED_FIXTURE_CONFIRMATION_FILE;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!runId || !fixtureConfirmationFile || !baseUrl) {
  throw new Error("The guarded hosted-portability environment is incomplete.");
}

interface ExportResponse {
  readonly artifact: {
    readonly fileName: string;
    readonly id: string;
  };
}

async function waitForFixtureConfirmation(): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return (await readFile(fixtureConfirmationFile, "utf8")).trim() === runId;
      } catch {
        return false;
      }
    })
    .toBe(true);
}

async function signInAndOnboard(
  page: Page,
  input: {
    readonly displayName: string;
    readonly email: string;
    readonly handle: string;
    readonly password: string;
  },
) {
  await page.goto("/auth/sign-in?returnTo=%2Fapp%2Fportability");
  await page.getByRole("textbox", { name: "Email address" }).fill(input.email);
  await page.getByLabel("Password").fill(input.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Fapp%2Fportability$/u);
  await page.getByRole("textbox", { name: "Display name" }).fill(input.displayName);
  await page.getByRole("textbox", { name: "Handle" }).fill(input.handle);
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(page).toHaveURL("/app/portability");
  const invitation = page.getByRole("dialog", { name: /Make Lumen yours/i });
  if (
    await invitation
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await invitation.getByRole("button", { name: "Explore on my own" }).click();
    await expect(invitation).toBeHidden();
  }
}

async function signOut(page: Page) {
  const response = await page.request.post("/api/auth/sign-out", {
    data: { scope: "current" },
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl!,
      "X-Lumen-CSRF": "1",
    },
  });
  expect(response.status()).toBe(200);
}

async function completeImport(page: Page) {
  await page.getByRole("button", { name: "Continue to mapping" }).click();
  await page.getByRole("button", { name: "Review import" }).click();
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/portability/import") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Import now" }).click();
  expect([201, 202]).toContain((await response).status());
  await expect(
    page.getByRole("heading", { level: 2, name: "Your material is ready" }),
  ).toBeVisible();
}

async function importFile(
  page: Page,
  input: {
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly name: string;
    readonly source: "Anki package" | "CSV or TSV" | "Lumen backup";
  },
) {
  await page.goto("/app/portability");
  await page.getByRole("button", { name: input.source }).click();
  await page.locator('input[type="file"]').setInputFiles({
    buffer: input.buffer,
    mimeType: input.mimeType,
    name: input.name,
  });
  const inspection = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/portability/inspect") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Inspect source" }).click();
  expect((await inspection).status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 2, name: "This is what Lumen found" }),
  ).toBeVisible();
  await completeImport(page);
}

async function generateDeckExport(page: Page, format: "Anki package" | "JSON" | "Markdown") {
  await page.goto("/app/portability?tab=export");
  await page.getByRole("button", { name: new RegExp(`^${format}`, "u") }).click();
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/portability/export") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: `Generate ${format}` }).click();
  const completed = await response;
  expect(completed.status()).toBe(201);
  return (await completed.json()) as ExportResponse;
}

test("Preview round-trips portable formats and cleans private artifacts", async ({ page }) => {
  test.setTimeout(360_000);
  const compact = runId.replaceAll("-", "");
  const sourceEmail = `phase02-preview-${compact}@example.test`;
  const sourcePassword = `Preview-only-${compact}-Pass!`;
  const restoreEmail = `phase06-restore-${compact}@example.test`;
  const restorePassword = `${sourcePassword}-Restore`;

  await waitForFixtureConfirmation();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    supabaseProjectRef: "cfwddajyjbueggpzfomh",
    vercelEnvironment: "preview",
  });

  await signInAndOnboard(page, {
    displayName: "Preview portability source",
    email: sourceEmail,
    handle: `portable_${compact.slice(0, 10)}`,
    password: sourcePassword,
  });

  await page
    .getByRole("textbox", { name: "Paste term and definition pairs" })
    .fill("ATP\tCellular energy carrier\nDNA\tGenetic material");
  await page.getByRole("button", { name: "Inspect source" }).click();
  await expect(page.getByText("ATP", { exact: true })).toBeVisible();
  await completeImport(page);

  await importFile(page, {
    buffer: Buffer.from("Front,Back\nRibosome,Builds proteins\nNucleus,Stores DNA\n", "utf8"),
    mimeType: "text/csv",
    name: "synthetic-phase06.csv",
    source: "CSV or TSV",
  });

  const json = await generateDeckExport(page, "JSON");
  expect(json.artifact.fileName).toBe("lumen-decks.json");
  const markdown = await generateDeckExport(page, "Markdown");
  expect(markdown.artifact.fileName).toMatch(/\.zip$/u);
  const anki = await generateDeckExport(page, "Anki package");
  expect(anki.artifact.fileName).toMatch(/\.apkg$/u);
  const ankiDownload = await page.request.get(`/api/portability/artifacts/${anki.artifact.id}`);
  expect(ankiDownload.status()).toBe(200);
  const ankiBytes = await ankiDownload.body();

  await page.goto("/app/portability?tab=backups");
  const backupResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/portability/export") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create full backup" }).click();
  const backupCompleted = await backupResponse;
  expect(backupCompleted.status()).toBe(201);
  const backup = (await backupCompleted.json()) as ExportResponse;
  const backupDownload = await page.request.get(`/api/portability/artifacts/${backup.artifact.id}`);
  expect(backupDownload.status()).toBe(200);
  const backupBytes = await backupDownload.body();

  await page.getByLabel("Archive passphrase").fill("preview-synthetic-passphrase");
  const encryptedResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/portability/export") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create encrypted backup" }).click();
  const encryptedCompleted = await encryptedResponse;
  expect(encryptedCompleted.status()).toBe(201);
  const encrypted = (await encryptedCompleted.json()) as ExportResponse;

  const deletion = await page.request.delete(
    `/api/portability/artifacts/${encrypted.artifact.id}`,
    {
      headers: { Origin: baseUrl!, "X-Lumen-CSRF": "1" },
    },
  );
  expect(deletion.status()).toBe(200);
  expect(
    (await page.request.get(`/api/portability/artifacts/${encrypted.artifact.id}`)).status(),
  ).toBe(404);

  await page.goto("/app/portability?tab=jobs");
  await expect(page.getByRole("heading", { name: "Jobs survive a reload" })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();

  await signOut(page);
  await signInAndOnboard(page, {
    displayName: "Preview portability restore",
    email: restoreEmail,
    handle: `restore_${compact.slice(0, 10)}`,
    password: restorePassword,
  });
  expect(
    (await page.request.get(`/api/portability/artifacts/${backup.artifact.id}`)).status(),
  ).toBe(404);

  await importFile(page, {
    buffer: backupBytes,
    mimeType: "application/vnd.lumen.archive+zip",
    name: "synthetic-account-backup.lumen",
    source: "Lumen backup",
  });
  await expect(page.getByText(/entries created/u)).toBeVisible();

  await importFile(page, {
    buffer: ankiBytes,
    mimeType: "application/vnd.anki",
    name: "synthetic-export.apkg",
    source: "Anki package",
  });
  await expect(page.getByText(/study cards/u)).toBeVisible();

  await page.goto("/app/portability?tab=print");
  await page.getByRole("link", { name: "Open print preview →" }).first().click();
  await expect(page.getByRole("region", { name: "Study guide" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
});
