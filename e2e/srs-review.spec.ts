import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

test("desktop and mobile learners complete a keyboard review through the canonical path", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "reduced-motion",
    "Reduced motion is covered by unit and accessibility suites.",
  );
  test.setTimeout(90_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Review learner",
    emailPrefix: `phase03-${testInfo.project.name}`,
    handlePrefix: "reviewer",
    returnTo: "/app/decks/new",
  });

  await page.getByRole("textbox", { name: "Deck title" }).fill("Canonical review check");
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
  const deckRow = page.locator(".study-deck-row").filter({ hasText: "Canonical review check" });
  await expect(deckRow).toContainText("1");
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/study/sessions") && response.request().method() === "POST",
  );
  await deckRow.getByRole("button", { name: "Study" }).click();
  expect((await sessionResponse).status()).toBe(201);
  await expect(page).toHaveURL(/\/app\/study\/session\//u);

  await expect(page.getByText("What molecule carries cellular energy?")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page).toHaveURL(/\/app\/study$/u);
  await expect(page.getByRole("heading", { name: "Continue your session" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page).toHaveURL(/\/app\/study\/session\//u);
  await expect(page.getByText("What molecule carries cellular energy?")).toBeVisible();
  await expect(page.getByText("ATP", { exact: true })).toHaveCount(0);
  const lazyControlResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/study/schedules/control") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Star" }).click();
  expect((await lazyControlResponse).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Unstar" })).toBeVisible();
  await expect(page.getByText("ATP", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Typed answer" }).fill("atp");
  await page.getByRole("button", { name: /Show answer/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("ATP", { exact: true })).toBeVisible();
  await expect(page.getByText("Matches an accepted answer")).toBeVisible();
  await expect(page.getByRole("button", { name: /Good/ })).toBeVisible();

  const reviewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/study/reviews") && response.request().method() === "POST",
  );
  await page.keyboard.press("3");
  expect((await reviewResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "That’s the queue." })).toBeVisible();
  for (const label of ["Again", "Hard", "Good", "Easy", "Today remaining"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Undo last review" })).toBeVisible();

  await page.getByRole("link", { name: "View statistics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your review picture" })).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
});
