import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test("guided learners complete Flashcards and adaptive Learn without a silent SRS update", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const externalHosts = new Set<string>();
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(host)) externalHosts.add(host);
  });

  await provisionAndSignInLocalAuthor(page, {
    displayName: `Guided learner with a deliberately long name ${testInfo.project.name}`,
    emailPrefix: `phase04-${testInfo.project.name}`,
    handlePrefix: "guided",
    returnTo: "/app/decks/new",
  });

  await expect(page.getByRole("dialog", { name: /Make Lumen yours/i })).toBeVisible();
  const dismissGuide = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/guides/progress") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Explore on my own" }).click();
  expect((await dismissGuide).ok()).toBe(true);
  await expect(page.getByRole("dialog", { name: /Make Lumen yours/i })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Deck title" }).fill("Cell energy practice");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-describedby="card-type-typed_answer-detail"]').click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;
  await page
    .getByRole("textbox", { name: "Prompt" })
    .fill("What molecule carries cellular energy?");
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
  await expect(page.getByText(/Due dates change only when you explicitly save/i)).toBeVisible();
  await page.locator('[data-guide-id="mode-flashcards"]').click();
  await expect(page.getByRole("heading", { name: "Set up Flashcards" })).toBeVisible();
  await page.getByLabel("Questions").fill("1");
  const flashSessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/practice/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start Flashcards" }).click();
  expect((await flashSessionResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/app\/practice\/session\//u);
  await expect(page.getByText("ATP", { exact: true })).toHaveCount(0);
  const starResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/practice/stars") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Star$/u }).click();
  expect((await starResponse).ok()).toBe(true);
  await page.getByRole("button", { name: /Show answer/ }).click();
  await expect(page.getByText("ATP", { exact: true })).toBeVisible();
  const flashAttempt = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/practice/attempts") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Know it/ }).click();
  const flashAttemptBody = (await (await flashAttempt).json()) as {
    data: { qualification: { eligible: boolean } };
  };
  expect(flashAttemptBody.data.qualification.eligible).toBe(false);
  await page.getByRole("button", { name: /Next question/ }).click();
  await expect(page.getByRole("heading", { name: "You finished the session" })).toBeVisible();

  await page.getByRole("link", { name: "Return to Study" }).click();
  await page.locator('[data-guide-id="mode-learn"]').click();
  await expect(page.getByRole("heading", { name: "Set up Learn" })).toBeVisible();
  await page.getByLabel("Questions").fill("2");
  const learnSessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/practice/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start Learn" }).click();
  expect((await learnSessionResponse).ok()).toBe(true);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog", { name: "Session paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume session" }).click();
  await expect(page.getByRole("dialog", { name: "Session paused" })).toHaveCount(0);

  await page.getByLabel("ATP", { exact: true }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("heading", { name: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: /Next question/ }).click();
  await page.getByRole("textbox", { name: "Your answer" }).fill("ATP");
  const recallAttempt = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/practice/attempts") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Check answer" }).click();
  const recallBody = (await (await recallAttempt).json()) as {
    data: { qualification: { eligible: boolean; suggestedRating: string | null } };
  };
  expect(recallBody.data.qualification).toMatchObject({ eligible: true });
  expect(recallBody.data.qualification.suggestedRating).toBeTruthy();
  await expect(
    page.getByText(/Nothing changes unless you explicitly accept a rating/i),
  ).toBeVisible();
  const qualificationResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/practice/qualifications") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save review rating" }).click();
  expect((await qualificationResponse).ok()).toBe(true);
  await expect(page.getByText("Review schedule updated.")).toBeVisible();
  await page.getByRole("button", { name: /Next question/ }).click();
  await expect(page.getByRole("heading", { name: "You finished the session" })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByRole("dialog", { name: /Make Lumen yours/i })).toHaveCount(0);
  await page.goto("/app/getting-started");
  await expect(page.getByRole("heading", { name: "Getting started checklist" })).toBeVisible();
  await expect(page.getByText("Try Flashcards", { exact: true })).toBeVisible();
  await expect(page.getByText("Complete a short Learn session", { exact: true })).toBeVisible();
  const adaptiveGuide = page
    .locator(".guide-library article")
    .filter({ hasText: "Use adaptive Learn" });
  await adaptiveGuide.getByRole("button", { name: "Start" }).click();
  const adaptiveGuideDialog = page.getByRole("dialog", { name: "Use adaptive Learn" });
  await expect(adaptiveGuideDialog).toBeVisible();
  await adaptiveGuideDialog.getByRole("button", { name: "Skip" }).click();
  await expect(adaptiveGuideDialog).toHaveCount(0);

  await expectNoHorizontalOverflow(page);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
  expect([...externalHosts]).toEqual([]);
});

test("Match uses a shuffled card board and Test submits one mixed answer sheet", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: `Match and test learner ${testInfo.project.name}`,
    emailPrefix: `phase04-board-${testInfo.project.name}`,
    handlePrefix: "matchtest",
    returnTo: "/app/decks/new",
  });

  const invitation = page.getByRole("dialog", { name: /Make Lumen yours/i });
  await expect(invitation).toBeVisible();
  await invitation.getByRole("button", { name: "Explore on my own" }).click();

  await page.getByRole("textbox", { name: "Deck title" }).fill("Cell structures");
  await page.getByRole("button", { name: "Continue" }).click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;
  const pairs = [
    ["Cell energy organelle", "Mitochondrion"],
    ["Genetic material organelle", "Nucleus"],
    ["Protein assembly structure", "Ribosome"],
  ] as const;
  for (const [index, [prompt, answer]] of pairs.entries()) {
    await page.getByRole("textbox", { name: "Front / prompt" }).fill(prompt);
    await page.getByRole("textbox", { name: "Back / answer" }).fill(answer);
    const noteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: index === pairs.length - 1 ? "Save card" : "Save and add another",
      })
      .click();
    expect((await noteResponse).status()).toBe(201);
  }

  const canonicalReviews: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/study/reviews") && request.method() === "POST")
      canonicalReviews.push(request.url());
  });

  await page.goto("/app/study/mode/match");
  await page.getByLabel("Questions").fill("3");
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByRole("heading", { name: "Match the cards" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Shuffled matching cards" }).getByRole("button"),
  ).toHaveCount(6);
  const matchAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    matchAxe.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
  for (const [prompt, answer] of pairs) {
    await page.getByRole("button", { name: `Term: ${prompt}` }).click();
    const attempt = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/practice/attempts") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: `Definition: ${answer}` }).click();
    expect((await attempt).ok()).toBe(true);
  }
  await expect(page.getByRole("heading", { name: "Board cleared" })).toBeVisible();

  await page.goto("/app/study/mode/test");
  await page.getByLabel("Questions").fill("3");
  await page.getByRole("button", { name: "Start Test" }).click();
  await expect(page.getByRole("heading", { name: "Show what you know" })).toBeVisible();
  const questions = page.locator(".practice-test-question");
  await expect(questions).toHaveCount(3);
  const testAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    testAxe.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
  const answerByPrompt = new Map(pairs);
  for (let index = 0; index < 2; index += 1) {
    const question = questions.nth(index);
    const prompt = await question.getByRole("heading").innerText();
    const expected = [...answerByPrompt.entries()].find(([term]) => prompt.includes(term))?.[1];
    expect(expected).toBeTruthy();
    await question.getByLabel(expected ?? "").check();
  }
  await questions.nth(2).getByLabel("True", { exact: true }).check();
  let submittedAttempts = 0;
  page.on("response", (response) => {
    if (response.url().endsWith("/api/practice/attempts") && response.request().method() === "POST")
      submittedAttempts += 1;
  });
  await page.getByRole("button", { name: "Submit test" }).click();
  await expect.poll(() => submittedAttempts).toBe(3);
  await expect(page.getByRole("heading", { name: "100% on this test" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review every question" })).toBeVisible();
  expect(canonicalReviews).toEqual([]);
  await expectNoHorizontalOverflow(page);
});
