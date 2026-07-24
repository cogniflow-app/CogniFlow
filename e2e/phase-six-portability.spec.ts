import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function expectNoSevereAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
}

async function dismissInvitation(page: Page) {
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

test("an owner imports text, exports open formats/backups, inspects jobs, and opens print", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Portability owner",
    emailPrefix: `phase06-${testInfo.project.name}`,
    handlePrefix: "portable",
    returnTo: "/app/portability",
  });
  await expect(page.getByRole("heading", { level: 1, name: "Import & export" })).toBeVisible();
  await dismissInvitation(page);

  await expect(page.getByText("No scraping. No shared credentials.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Paste term and definition pairs" })
    .fill("ATP\tCellular energy carrier\nDNA\tGenetic material");
  await page.getByRole("button", { name: "Inspect source" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "This is what Lumen found" }),
  ).toBeVisible();
  await expect(page.getByText("ATP", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to mapping" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose how this import behaves" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Tags" }).fill("synthetic, phase06");
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  const importResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/portability/import") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Import now" }).click();
  expect((await importResponse).status()).toBe(201);
  await expect(
    page.getByRole("heading", { level: 2, name: "Your material is ready" }),
  ).toBeVisible();
  await expect(page.getByText(/2 entries created 2 study cards/u)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSevereAxeViolations(page);

  await page.goto("/app/portability?tab=export");
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose useful, open output" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^JSON/u }).click();
  const jsonExport = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/portability/export") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate JSON" }).click();
  expect((await jsonExport).status()).toBe(201);
  await expect(page.getByText("lumen-decks.json", { exact: true })).toBeVisible();

  await page.goto("/app/portability?tab=backups");
  await expect(
    page.getByRole("heading", { level: 2, name: "Back up your complete account" }),
  ).toBeVisible();
  const fullBackup = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/portability/export") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create full backup" }).click();
  expect((await fullBackup).status()).toBe(201);
  await expect(page.getByText("lumen-account-backup.lumen", { exact: true })).toBeVisible();
  await page.getByLabel("Archive passphrase").fill("synthetic-only-passphrase");
  const encryptedBackup = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/portability/export") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create encrypted backup" }).click();
  expect((await encryptedBackup).status()).toBe(201);
  await expect(page.getByText("lumen-account-backup.lumen.enc", { exact: true })).toBeVisible();

  await page.goto("/app/portability?tab=jobs");
  await expect(
    page.getByRole("heading", { level: 2, name: "Jobs survive a reload" }),
  ).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete file" }).first()).toBeVisible();

  await page.goto("/app/portability?tab=print");
  await expect(
    page.getByRole("heading", { level: 2, name: "Paper-ready study material" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open print preview →" }).first().click();
  await expect(page.getByRole("region", { name: "Print controls" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Study guide" })).toBeVisible();
  await expect(page.getByLabel("Paper size")).toBeVisible();
  await expect(page.getByLabel("Orientation")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expectNoHorizontalOverflow(page);
});

test("a clean account restores a full archive and reimports a real Anki export", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "round-trip runs once on desktop");
  test.setTimeout(120_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Round-trip source",
    emailPrefix: "phase06-roundtrip-source",
    handlePrefix: "roundtrip_source",
    returnTo: "/app/portability",
  });
  await dismissInvitation(page);

  await page
    .getByRole("textbox", { name: "Paste term and definition pairs" })
    .fill("Mitochondria\tProduces cellular energy\nRibosome\tBuilds proteins");
  await page.getByRole("button", { name: "Inspect source" }).click();
  await page.getByRole("button", { name: "Continue to mapping" }).click();
  await page.getByRole("button", { name: "Review import" }).click();
  await page.getByRole("button", { name: "Import now" }).click();
  await expect(page.getByRole("heading", { name: "Your material is ready" })).toBeVisible();

  await page.goto("/app/portability?tab=export");
  await page.getByRole("button", { name: /^Anki package/u }).click();
  const ankiResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/portability/export") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate Anki package" }).click();
  const ankiBody = (await (await ankiResponse).json()) as { artifact: { id: string } };
  const ankiDownload = await page.request.get(`/api/portability/artifacts/${ankiBody.artifact.id}`);
  expect(ankiDownload.status()).toBe(200);
  const ankiBytes = await ankiDownload.body();

  await page.goto("/app/portability?tab=backups");
  const backupResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/portability/export") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create full backup" }).click();
  const backupBody = (await (await backupResponse).json()) as { artifact: { id: string } };
  const backupDownload = await page.request.get(
    `/api/portability/artifacts/${backupBody.artifact.id}`,
  );
  expect(backupDownload.status()).toBe(200);
  const backupBytes = await backupDownload.body();

  const restoreContext = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const restorePage = await restoreContext.newPage();
    await provisionAndSignInLocalAuthor(restorePage, {
      displayName: "Round-trip destination",
      emailPrefix: "phase06-roundtrip-destination",
      handlePrefix: "roundtrip_dest",
      returnTo: "/app/portability",
    });
    await dismissInvitation(restorePage);

    await restorePage.getByRole("button", { name: "Lumen backup" }).click();
    await restorePage.locator('input[type="file"]').setInputFiles({
      buffer: backupBytes,
      mimeType: "application/vnd.lumen.archive+zip",
      name: "round-trip.lumen",
    });
    await restorePage.getByRole("button", { name: "Inspect source" }).click();
    await expect(
      restorePage.getByRole("heading", { name: "This is what Lumen found" }),
    ).toBeVisible();
    await restorePage.getByRole("button", { name: "Continue to mapping" }).click();
    await restorePage.getByRole("button", { name: "Review import" }).click();
    await restorePage.getByRole("button", { name: "Import now" }).click();
    await expect(
      restorePage.getByRole("heading", { name: "Your material is ready" }),
    ).toBeVisible();
    await expect(restorePage.getByText(/2 entries created 2 study cards/u)).toBeVisible();

    await restorePage.goto("/app/portability");
    await restorePage.getByRole("button", { name: "Anki package" }).click();
    await restorePage.locator('input[type="file"]').setInputFiles({
      buffer: ankiBytes,
      mimeType: "application/vnd.anki",
      name: "round-trip.apkg",
    });
    await restorePage.getByRole("button", { name: "Inspect source" }).click();
    await expect(restorePage.getByText("Anki Apkg", { exact: true })).toBeVisible();
    await restorePage.getByRole("button", { name: "Continue to mapping" }).click();
    await restorePage.getByRole("button", { name: "Review import" }).click();
    await restorePage.getByRole("button", { name: "Import now" }).click();
    await expect(
      restorePage.getByRole("heading", { name: "Your material is ready" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(restorePage);
  } finally {
    await restoreContext.close();
  }
});
