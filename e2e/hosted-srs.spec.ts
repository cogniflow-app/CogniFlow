import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runId = process.env.HOSTED_ACCEPTANCE_RUN_ID;
const fixtureConfirmationFile = process.env.HOSTED_FIXTURE_CONFIRMATION_FILE;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!runId || !fixtureConfirmationFile || !baseUrl) {
  throw new Error("The guarded hosted-SRS environment is incomplete.");
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

async function rateCurrentCard(page: Page, rating: "Again" | "Easy" | "Good" | "Hard") {
  await page.getByRole("button", { name: /Show answer/u }).click();
  const request = page.waitForRequest(
    (candidate) => candidate.url().endsWith("/api/study/reviews") && candidate.method() === "POST",
  );
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/study/reviews") && candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: new RegExp(rating, "u") }).click();
  const canonicalRequest = await request;
  const canonicalResponse = await response;
  expect(canonicalResponse.status()).toBe(200);
  return {
    body: canonicalRequest.postDataJSON() as Record<string, unknown>,
    result: (await canonicalResponse.json()) as Record<string, unknown>,
  };
}

test("Preview commits, deduplicates, undoes, resumes, and isolates canonical SRS reviews", async ({
  page,
}) => {
  const compactRunId = runId.replaceAll("-", "");
  const email = `phase02-preview-${compactRunId}@example.test`;
  const password = `Preview-only-${compactRunId}-Pass!`;
  const deckTitle = `Preview SRS ${compactRunId.slice(0, 8)}`;

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
  await page.getByRole("textbox", { name: "Display name" }).fill("Preview SRS learner");
  await page.getByRole("textbox", { name: "Handle" }).fill(`srs_${compactRunId.slice(0, 12)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();

  await page.getByRole("textbox", { name: "Deck title" }).fill(deckTitle);
  await page.getByRole("button", { name: "Continue" }).click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("textbox", { name: "Front / prompt" }).fill(`Hosted prompt ${index + 1}`);
    await page.getByRole("textbox", { name: "Back / answer" }).fill(`Hosted answer ${index + 1}`);
    const noteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: index === 3 ? "Save card" : "Save and add another" })
      .click();
    expect((await noteResponse).status()).toBe(201);
  }

  await page.goto("/app/study");
  const deckRow = page.locator(".study-deck-row").filter({ hasText: deckTitle });
  await expect(deckRow).toContainText("4");
  await deckRow.getByRole("button", { name: "Study" }).click();
  await expect(page).toHaveURL(/\/app\/study\/session\//u);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page).toHaveURL(/\/app\/study$/u);
  await page.getByRole("button", { name: "Resume session" }).click();
  await expect(page.getByText("Hosted prompt 1")).toBeVisible();

  const first = await rateCurrentCard(page, "Again");
  const duplicate = await page.request.post(`${baseUrl}/api/study/reviews`, {
    data: first.body,
    headers: { Origin: baseUrl, "X-Lumen-CSRF": "1" },
  });
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toEqual(first.result);

  await expect(page.getByText("Hosted prompt 2")).toBeVisible();
  const undoResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/study/reviews/undo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Undo last" }).click();
  expect((await undoResponse).status()).toBe(200);
  await expect(page.getByText("Hosted prompt 1")).toBeVisible();

  await rateCurrentCard(page, "Again");
  await expect(page.getByText("Hosted prompt 2")).toBeVisible();
  await rateCurrentCard(page, "Hard");
  await expect(page.getByText("Hosted prompt 3")).toBeVisible();
  await rateCurrentCard(page, "Good");
  await expect(page.getByText("Hosted prompt 4")).toBeVisible();
  await rateCurrentCard(page, "Easy");
  await expect(page.getByRole("heading", { level: 1, name: "Nice work." })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Nice work." })).toBeVisible();
  await page.getByRole("link", { name: "View statistics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your review picture" })).toBeVisible();
  await expect(page.getByText(deckTitle)).toBeVisible();
  await page.context().clearCookies({ name: /^(?!_vercel_jwt$).+/u });
  const privateStats = await page.request.get(`${baseUrl}/app/stats`, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(privateStats.status());
  expect(privateStats.headers()["location"]).toContain("/auth/sign-in");
});
