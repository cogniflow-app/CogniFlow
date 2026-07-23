import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

async function reconnectAndReadSync(context: BrowserContext, page: Page) {
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

test("a pinned deck opens from the neutral shell after the network disappears", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Offline acceptance learner",
    emailPrefix: "phase05-pwa",
    handlePrefix: "offlineaccept",
    returnTo: "/app/decks/new",
  });
  await page
    .getByRole("dialog", { name: /Make Lumen yours/i })
    .getByRole("button", {
      name: "Explore on my own",
    })
    .click();
  await page.getByRole("textbox", { name: "Deck title" }).fill("Offline mitochondria");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  await page
    .getByRole("textbox", { name: "Front / prompt" })
    .fill("Which organelle makes most cellular ATP?");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("The mitochondrion.");
  await page.getByRole("button", { name: "Save card" }).click();

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect((await manifestResponse.json()) as unknown).toEqual(
    expect.objectContaining({ display: "standalone", start_url: "/app?source=pwa" }),
  );
  expect((await page.request.get("/pwa/icons/icon-192.png")).ok()).toBe(true);
  expect((await page.request.get("/sw.js")).ok()).toBe(true);

  await page.goto("/app");
  const deck = page.locator(".deck-tile").filter({ hasText: "Offline mitochondria" });
  await deck.getByRole("button", { name: "Pin Offline mitochondria for offline use" }).click();
  await expect(
    deck.getByRole("button", { name: "Remove Offline mitochondria from offline use" }),
  ).toBeVisible();

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller && registration.active) {
      window.location.reload();
    }
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto("/app/library?offline-acceptance=1");
  await expect(page.getByRole("heading", { name: "Pinned library" })).toBeVisible();
  await page.getByRole("button", { name: /Offline mitochondria/ }).click();
  await expect(page.getByRole("heading", { name: "Offline mitochondria" })).toBeVisible();
  await expect(page.getByText("Which organelle makes most cellular ATP?")).toBeVisible();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.getByText("The mitochondrion.")).toBeVisible();
});

test("review, practice, and content outboxes reconcile after reconnect", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Offline outbox learner",
    emailPrefix: "phase05-outbox",
    handlePrefix: "offlineoutbox",
    returnTo: "/app/decks/new",
  });
  await page
    .getByRole("dialog", { name: /Make Lumen yours/i })
    .getByRole("button", { name: "Explore on my own" })
    .click();
  await page.getByRole("textbox", { name: "Deck title" }).fill("Offline outbox deck");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Outbox prompt");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("Outbox answer");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await expect(page).toHaveURL(/[?&]note=[0-9a-f-]+/u);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Front / prompt" })).toContainText(
    "Outbox prompt",
  );
  await context.setOffline(true);
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Outbox prompt edited offline");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText(/Card saved on this browser and waiting to sync/u)).toBeVisible();
  const editSync = await reconnectAndReadSync(context, page);
  expect(editSync.response).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([expect.objectContaining({ status: "acknowledged" })]),
    }),
  );

  await page.goto("/app/study");
  await page
    .locator(".study-deck-row")
    .filter({ hasText: "Offline outbox deck" })
    .getByRole("button", { name: "Study" })
    .click();
  await expect(page.getByText("Outbox prompt edited offline")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: /Show answer/u }).click();
  await page.getByRole("button", { name: /Good/u }).click();
  await expect(page.getByRole("status", { name: /Offline\. 1 pending change/u })).toHaveAttribute(
    "aria-label",
    "Offline. 1 pending changes.",
  );
  await page.getByRole("button", { name: "Undo pending review" }).click();
  await expect(
    page.getByText("Undo saved locally after the pending review. Both will sync in order."),
  ).toBeVisible();
  await expect(page.getByRole("status", { name: /Offline\. 2 pending changes/u })).toHaveAttribute(
    "aria-label",
    "Offline. 2 pending changes.",
  );
  const reviewSync = await reconnectAndReadSync(context, page);
  expect(reviewSync.response).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({ status: "acknowledged" }),
        expect.objectContaining({ status: "acknowledged" }),
      ]),
    }),
  );
  const origin = new URL(page.url()).origin;
  const duplicate = await page.evaluate(
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
    { batch: reviewSync.request, requestOrigin: origin },
  );
  expect(duplicate.status).toBe(200);
  expect(duplicate.body).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([expect.objectContaining({ status: "duplicate" })]),
    }),
  );

  await page.goto("/app/study");
  await page.locator('[data-guide-id="mode-flashcards"]').click();
  await page.getByLabel("Questions").fill("1");
  await page.getByRole("button", { name: "Start Flashcards" }).click();
  await expect(page.getByText("Outbox prompt edited offline")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: /Show answer/u }).click();
  await page.getByRole("button", { name: /Know it/u }).click();
  const practiceSync = await reconnectAndReadSync(context, page);
  expect(practiceSync.response).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([expect.objectContaining({ status: "acknowledged" })]),
    }),
  );

  await page.goto("/app/decks/new");
  await context.setOffline(true);
  await page.getByRole("textbox", { name: "Deck title" }).fill("Browser restart draft");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  await expect(page.getByRole("heading", { name: "Browser restart draft" })).toBeVisible();
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Offline-created prompt");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("Offline-created answer");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText(/Card saved on this browser and waiting to sync/u)).toBeVisible();
  const contentSync = await reconnectAndReadSync(context, page);
  expect(contentSync.response).toEqual(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({ status: "acknowledged" }),
        expect.objectContaining({ status: "acknowledged" }),
      ]),
    }),
  );
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Browser restart draft" })).toBeVisible();
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
        const counts = await Promise.all(
          [...database.objectStoreNames].map(
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
          rows: counts.reduce((total, count) => total + count, 0),
        };
      }),
    )
    .toEqual({ activeNamespace: null, rows: 0 });
  await page.goto("/offline");
  await expect(page.getByText(/No locally authorized learner is active/u)).toBeVisible();
  await expect(page.getByText("Outbox answer")).toHaveCount(0);
});

test("two devices preserve and resolve an overlapping stale review", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(150_000);
  const credentials = await provisionAndSignInLocalAuthor(page, {
    displayName: "Offline conflict learner",
    emailPrefix: "phase05-conflict",
    handlePrefix: "offlineconflict",
    returnTo: "/app/decks/new",
  });
  await page
    .getByRole("dialog", { name: /Make Lumen yours/i })
    .getByRole("button", { name: "Explore on my own" })
    .click();
  await page.getByRole("textbox", { name: "Deck title" }).fill("Two device conflict");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Conflict prompt");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("Conflict answer");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page).toHaveURL(/[?&]note=[0-9a-f-]+/u);
  const deckId = new URL(page.url()).pathname.split("/")[3];
  expect(deckId).toMatch(/^[0-9a-f-]+$/u);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await secondPage.setExtraHTTPHeaders({ "X-Forwarded-For": "192.0.2.241" });
    await secondPage.goto("/auth/sign-in?returnTo=%2Fapp%2Fstudy");
    await secondPage.getByRole("textbox", { name: "Email address" }).fill(credentials.email);
    await secondPage.getByLabel("Password").fill(credentials.password);
    await secondPage.getByRole("button", { name: "Sign in" }).click();
    await expect(secondPage).toHaveURL("/app/study");

    for (const candidate of [page, secondPage]) {
      await candidate.goto(`/app/decks/${deckId}/settings`);
      await expect(
        candidate.getByRole("heading", { name: "Deck details and publication" }),
      ).toBeVisible();
    }
    await context.setOffline(true);
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Description edited while the first device was offline.");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page.getByText(
        "Deck details saved on this browser. Publication still requires a connection.",
      ),
    ).toBeVisible();
    await secondPage.getByRole("combobox", { name: "Deck theme" }).click();
    await secondPage.getByRole("option", { name: "Ocean" }).click();
    await secondPage.getByRole("button", { name: "Save settings" }).click();
    await expect(
      secondPage.getByText(
        "Deck details saved. Publication visibility changes when you publish or unpublish.",
      ),
    ).toBeVisible();
    const contentMerge = await reconnectAndReadSync(context, page);
    expect(contentMerge.response).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({
            authoritativeProjection: expect.objectContaining({
              synchronization: { mergedFields: expect.arrayContaining(["theme"]) },
            }),
            status: "applied_after_replay",
          }),
        ]),
      }),
    );
    await page.goto("/app/offline");
    await expect(page.getByText("Independent edits merged")).toBeVisible();
    await expect(page.getByText(/Preserved both copies of theme/u)).toBeVisible();

    for (const candidate of [page, secondPage]) {
      await candidate.goto("/app/study");
      await candidate
        .locator(".study-deck-row")
        .filter({ hasText: "Two device conflict" })
        .getByRole("button", { name: "Study" })
        .click();
      await expect(candidate.getByText("Conflict prompt")).toBeVisible();
    }

    await context.setOffline(true);
    await secondContext.setOffline(true);
    await secondPage.getByRole("button", { name: /Show answer/u }).click();
    await secondPage.getByRole("button", { name: /Good/u }).click();
    await page.getByRole("button", { name: /Show answer/u }).click();
    await page.getByRole("button", { name: /Good/u }).click();

    const firstSync = await reconnectAndReadSync(context, page);
    expect(firstSync.response).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([expect.objectContaining({ status: "acknowledged" })]),
      }),
    );
    const staleSync = await reconnectAndReadSync(secondContext, secondPage);
    expect(staleSync.response).toEqual(
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
});
