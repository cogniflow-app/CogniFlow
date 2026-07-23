import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runId = process.env.HOSTED_ACCEPTANCE_RUN_ID;
const fixtureConfirmationFile = process.env.HOSTED_FIXTURE_CONFIRMATION_FILE;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!runId || !fixtureConfirmationFile || !baseUrl) {
  throw new Error("The guarded hosted-offline environment is incomplete.");
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

async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

async function dismissGuideInvitation(page: Page): Promise<void> {
  const invitation = page.getByRole("dialog", { name: /Make Lumen yours/i });
  if (!(await invitation.isVisible().catch(() => false))) return;
  const persisted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/guides/progress") && response.request().method() === "POST",
  );
  await invitation.getByRole("button", { name: "Explore on my own" }).click();
  expect((await persisted).status()).toBe(200);
  await page.reload();
  await expect(invitation).toBeHidden();
}

async function openDeckReview(page: Page, deckTitle: string): Promise<void> {
  await dismissGuideInvitation(page);
  const study = page
    .locator(".study-deck-row")
    .filter({ hasText: deckTitle })
    .getByRole("button", { name: "Study" });
  await study.focus();
  await study.press("Enter");
}

async function reconnectAndWaitForSync(
  context: BrowserContext,
  page: Page,
): Promise<{
  readonly request: Record<string, unknown>;
  readonly response: Record<string, unknown>;
}> {
  const request = page.waitForRequest(
    (candidate) => candidate.url().endsWith("/api/sync/v1") && candidate.method() === "POST",
  );
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/sync/v1") && candidate.request().method() === "POST",
  );
  await context.setOffline(false);
  const [syncRequest, syncResponse] = await Promise.all([request, response]);
  expect(syncResponse.status()).toBe(200);
  return {
    request: syncRequest.postDataJSON() as Record<string, unknown>,
    response: (await syncResponse.json()) as Record<string, unknown>,
  };
}

test("Preview keeps private offline work isolated and reconciles typed outboxes", async ({
  browser,
  context,
  page,
}) => {
  const compactRunId = runId.replaceAll("-", "");
  const email = `phase02-preview-${compactRunId}@example.test`;
  const password = `Preview-only-${compactRunId}-Pass!`;
  const deckTitle = `Preview offline ${compactRunId.slice(0, 8)}`;

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
  await page.getByRole("textbox", { name: "Display name" }).fill("Preview offline learner");
  await page.getByRole("textbox", { name: "Handle" }).fill(`offline_${compactRunId.slice(0, 10)}`);
  await page.getByRole("button", { name: "Finish account setup" }).click();

  await expect(page.getByRole("dialog", { name: /Make Lumen yours/i })).toBeVisible();
  await dismissGuideInvitation(page);
  await page.getByRole("textbox", { name: "Deck title" }).fill(deckTitle);
  await page.getByRole("button", { name: "Continue" }).click();
  const deckResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content/decks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  const deckId = ((await (await deckResponse).json()) as { data: { id: string } }).data.id;
  const cardPairs = [
    ["Offline hosted conflict prompt", "Offline hosted conflict answer"],
    ["Offline hosted prompt", "Offline hosted answer"],
  ] as const;
  for (const [index, [prompt, answer]] of cardPairs.entries()) {
    await page.getByRole("textbox", { name: "Front / prompt" }).fill(prompt);
    await page.getByRole("textbox", { name: "Back / answer" }).fill(answer);
    const noteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/content/decks/${deckId}/notes`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: index === cardPairs.length - 1 ? "Save card" : "Save and add another",
      })
      .click();
    expect((await noteResponse).status()).toBe(201);
  }

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toEqual(
    expect.objectContaining({ display: "standalone", start_url: "/app?source=pwa" }),
  );
  expect((await page.request.get("/pwa/icons/icon-192.png")).status()).toBe(200);
  expect((await page.request.get("/sw.js")).status()).toBe(200);

  await page.goto("/app");
  const deck = page.locator(".deck-tile").filter({ hasText: deckTitle });
  await deck.getByRole("button", { name: `Pin ${deckTitle} for offline use` }).click();
  await expect(
    deck.getByRole("button", { name: `Remove ${deckTitle} from offline use` }),
  ).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller && registration.active)
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      });
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await goOffline(context);
  await page.goto("/app/library?hosted-offline=1");
  await expect(page.getByRole("heading", { name: "Pinned library" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(deckTitle, "u") }).click();
  const offlinePrompt = await page.getByRole("heading", { level: 2 }).textContent();
  const offlinePair = cardPairs.find(([prompt]) => prompt === offlinePrompt);
  if (!offlinePair) throw new Error("The pinned projection presented an unexpected card.");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.getByText(offlinePair[1], { exact: true })).toBeVisible();
  await context.setOffline(false);

  await page.goto("/app/study");
  await openDeckReview(page, deckTitle);
  const reviewPrompt = page.getByText(/^Offline hosted (?:conflict )?prompt$/u, { exact: true });
  await expect(reviewPrompt).toBeVisible();
  const reviewPromptText = await reviewPrompt.textContent();
  const reviewedPair = cardPairs.find(([prompt]) => prompt === reviewPromptText);
  if (!reviewedPair) throw new Error("The review queue presented an unexpected card.");
  const remainingPair = cardPairs.find(([prompt]) => prompt !== reviewedPair[0]);
  if (!remainingPair) throw new Error("The review fixture did not retain a second card.");
  await goOffline(context);
  await page.getByRole("button", { name: /Show answer/u }).click();
  await page.getByRole("button", { name: /Good/u }).click();
  const reviewSync = await reconnectAndWaitForSync(context, page);
  const exactRetry = await page.evaluate(
    async ({ batch, requestOrigin }) => {
      const response = await fetch("/api/sync/v1", {
        body: JSON.stringify(batch),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Origin: requestOrigin,
          "X-Lumen-CSRF": "1",
        },
        method: "POST",
      });
      return { body: (await response.json()) as unknown, status: response.status };
    },
    { batch: reviewSync.request, requestOrigin: baseUrl },
  );
  expect(exactRetry.status).toBe(200);
  expect(exactRetry.body).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([expect.objectContaining({ status: "duplicate" })]),
    }),
  );

  const secondContext = await browser.newContext({ baseURL: baseUrl });
  try {
    await secondContext.addCookies(await context.cookies(baseUrl));
    const secondPage = await secondContext.newPage();
    await secondPage.goto("/app/study");
    await expect(secondPage).toHaveURL("/app/study");

    for (const candidate of [page, secondPage]) {
      await candidate.goto("/app/study");
      await openDeckReview(candidate, deckTitle);
      await expect(candidate.getByText(remainingPair[0], { exact: true })).toBeVisible();
    }
    await context.setOffline(true);
    await secondContext.setOffline(true);
    await secondPage.getByRole("button", { name: /Show answer/u }).click();
    await secondPage.getByRole("button", { name: /Good/u }).click();
    await page.getByRole("button", { name: /Show answer/u }).click();
    await page.getByRole("button", { name: /Good/u }).click();
    const canonicalDevice = await reconnectAndWaitForSync(context, page);
    expect(canonicalDevice.response).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([expect.objectContaining({ status: "acknowledged" })]),
      }),
    );
    const staleDevice = await reconnectAndWaitForSync(secondContext, secondPage);
    expect(staleDevice.response).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([expect.objectContaining({ status: "conflict" })]),
      }),
    );
    await secondPage.goto("/app/offline");
    await expect(secondPage.getByText("This card was reviewed on another device")).toBeVisible();
    await secondPage.getByRole("button", { name: "Accept server schedule" }).click();
    await expect(
      secondPage.getByText("No unresolved review, content, media, or permission conflicts."),
    ).toBeVisible();
  } finally {
    await secondContext.close();
  }

  await page.goto("/app/study");
  await dismissGuideInvitation(page);
  await page.locator('[data-guide-id="mode-flashcards"]').click();
  await page.getByLabel("Questions").fill("1");
  await page.getByRole("button", { name: "Start Flashcards" }).click();
  await expect(page).toHaveURL(/\/app\/practice\/session\//u);
  const practiceShowAnswer = page.getByRole("button", { name: /Show answer/u });
  await expect(practiceShowAnswer).toBeVisible();
  await goOffline(context);
  await practiceShowAnswer.click();
  await page.getByRole("button", { name: /Know it/u }).click();
  const practiceSync = await reconnectAndWaitForSync(context, page);
  expect(practiceSync.response).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([expect.objectContaining({ status: "acknowledged" })]),
    }),
  );

  await page.goto("/app/decks/new");
  const offlineDeckTitle = page.getByRole("textbox", { name: "Deck title" });
  await expect(offlineDeckTitle).toBeVisible();
  await goOffline(context);
  await offlineDeckTitle.fill(`Offline draft ${compactRunId.slice(0, 8)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Hosted offline-created prompt");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("Hosted offline-created answer");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText(/Card saved on this browser and waiting to sync/u)).toBeVisible();
  const contentSync = await reconnectAndWaitForSync(context, page);
  expect(contentSync.response).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({ status: "acknowledged" }),
        expect.objectContaining({ status: "acknowledged" }),
      ]),
    }),
  );

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/u);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const request = indexedDB.open("lumen-offline-v1");
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const privateStores = [...database.objectStoreNames];
        const counts = await Promise.all(
          privateStores.map(
            (name) =>
              new Promise<number>((resolve, reject) => {
                const count = database.transaction(name, "readonly").objectStore(name).count();
                count.onerror = () => reject(count.error);
                count.onsuccess = () => resolve(count.result);
              }),
          ),
        );
        database.close();
        return {
          activeNamespace: localStorage.getItem("lumen:private:active-namespace:v1"),
          privateRows: counts.reduce((total, count) => total + count, 0),
        };
      }),
    )
    .toEqual({ activeNamespace: null, privateRows: 0 });

  const protectionCookie = (await page.context().cookies(baseUrl)).find(
    (cookie) => cookie.name === "_vercel_jwt",
  );
  const anonymous = await fetch(`${baseUrl}/offline`, {
    headers: protectionCookie
      ? { Cookie: `${protectionCookie.name}=${protectionCookie.value}` }
      : undefined,
    redirect: "manual",
  });
  expect(await anonymous.text()).not.toContain("Offline hosted answer");
});
