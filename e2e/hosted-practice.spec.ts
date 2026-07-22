import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runId = process.env.HOSTED_ACCEPTANCE_RUN_ID;
const fixtureConfirmationFile = process.env.HOSTED_FIXTURE_CONFIRMATION_FILE;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!runId || !fixtureConfirmationFile || !baseUrl) {
  throw new Error("The guarded hosted-practice environment is incomplete.");
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

async function finishCurrentPracticeItem(page: Page): Promise<void> {
  const showAnswer = page.getByRole("button", { name: /Show answer/u });
  if (await showAnswer.isVisible().catch(() => false)) {
    await showAnswer.click();
    await page.getByRole("button", { name: /Know it/u }).click();
  } else {
    const typed = page.getByRole("textbox", { name: "Your answer" });
    if (await typed.isVisible().catch(() => false)) await typed.fill("ATP");
    else {
      const firstChoice = page.locator(".practice-choices input").first();
      if (await firstChoice.isVisible().catch(() => false)) await firstChoice.check();
    }
    await page.getByRole("button", { name: "Check answer" }).click();
  }
  const next = page.getByRole("button", { name: /Next question/u });
  if (await next.isVisible().catch(() => false)) await next.click();
}

test("Preview guides practice modes, persists results, and preserves SRS isolation", async ({
  page,
}) => {
  const compactRunId = runId.replaceAll("-", "");
  const email = `phase02-preview-${compactRunId}@example.test`;
  const password = `Preview-only-${compactRunId}-Pass!`;
  const deckTitle = `Preview practice ${compactRunId.slice(0, 8)}`;

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
  await page.getByRole("textbox", { name: "Display name" }).fill("Preview practice learner");
  await page.getByRole("textbox", { name: "Handle" }).fill(`practice_${compactRunId.slice(0, 10)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();

  const invitation = page.getByRole("dialog", { name: /Make Lumen yours/i });
  await expect(invitation).toBeVisible();
  const guideWrite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/guides/progress") && response.request().method() === "POST",
  );
  await invitation.getByRole("button", { name: "Explore on my own" }).click();
  expect((await guideWrite).ok()).toBe(true);

  await page.getByRole("textbox", { name: "Deck title" }).fill(deckTitle);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-describedby="card-type-typed_answer-detail"]').click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;
  await page.getByRole("textbox", { name: "Prompt" }).fill("Cellular energy molecule?");
  await page.getByRole("textbox", { name: "Correct answer" }).fill("ATP");
  await page.getByRole("textbox", { name: "Main typed answer" }).fill("ATP");
  const noteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save card" }).click();
  expect((await noteResponse).status()).toBe(201);

  await page.goto("/app/study");
  await expect(page.getByRole("heading", { name: "Choose how you want to learn" })).toBeVisible();
  await expect(page.getByText("Practice only · no due-date changes").first()).toBeVisible();
  const canonicalReviews: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/study/reviews") && request.method() === "POST") {
      canonicalReviews.push(request.url());
    }
  });

  await page.locator('[data-guide-id="mode-flashcards"]').click();
  await page.getByLabel("Questions").fill("1");
  await page.getByRole("button", { name: "Start Flashcards" }).click();
  await expect(page.getByText("ATP", { exact: true })).toHaveCount(0);
  await finishCurrentPracticeItem(page);
  await expect(page.getByRole("heading", { name: "You finished the session" })).toBeVisible();
  expect(canonicalReviews).toEqual([]);

  await page.goto("/app/study/mode/test");
  await page.getByLabel("Questions").fill("1");
  await page.getByLabel("Test layout").selectOption("one_page");
  await page.getByRole("button", { name: "Start Test" }).click();
  await expect(page.getByRole("navigation", { name: "Test questions" })).toBeVisible();
  await finishCurrentPracticeItem(page);
  await expect(page.getByRole("heading", { name: "You finished the session" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review every question" })).toBeVisible();
  expect(canonicalReviews).toEqual([]);

  await page.goto("/app/getting-started");
  await expect(page.getByRole("heading", { name: "Getting started checklist" })).toBeVisible();
  await expect(page.getByText("Try Flashcards", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: /Make Lumen yours/i })).toHaveCount(0);

  const protectionCookie = (await page.context().cookies(baseUrl)).find(
    (cookie) => cookie.name === "_vercel_jwt",
  );
  const anonymous = await fetch(`${baseUrl}/app/getting-started`, {
    headers: protectionCookie
      ? { Cookie: `${protectionCookie.name}=${protectionCookie.value}` }
      : undefined,
    redirect: "manual",
  });
  const anonymousBody = await anonymous.text();
  expect(anonymous.status).toBe(200);
  expect(anonymousBody).toContain("Sign in");
  expect(anonymousBody).not.toContain(deckTitle);
  expect(anonymousBody).not.toContain("Getting started checklist");
});
