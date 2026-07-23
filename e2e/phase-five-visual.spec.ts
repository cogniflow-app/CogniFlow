import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { provisionAndSignInLocalAuthor } from "./support/local-account";

const viewports = [
  { height: 1080, width: 1920 },
  { height: 1024, width: 1536 },
  { height: 900, width: 1440 },
  { height: 768, width: 1366 },
  { height: 800, width: 1280 },
  { height: 768, width: 1024 },
  { height: 1024, width: 768 },
  { height: 932, width: 430 },
  { height: 844, width: 390 },
  { height: 800, width: 360 },
  { height: 568, width: 320 },
] as const;

async function expectInsideViewport(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const actionable = [
      ...document.querySelectorAll<HTMLElement>(
        "button:not([hidden]), a[href]:not([hidden]), input:not([hidden]), select:not([hidden])",
      ),
    ].filter((element) => {
      const style = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rectangle.height > 0;
    });
    return {
      clippedActionCount: actionable.filter((element) => {
        const rectangle = element.getBoundingClientRect();
        return rectangle.left < -1 || rectangle.right > window.innerWidth + 1;
      }).length,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.clippedActionCount).toBe(0);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const directory = resolve("test-results/phase-five-visual-captures");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ animations: "disabled", fullPage: true, path });
  await testInfo.attach(name, {
    path,
    contentType: "image/png",
  });
}

test("Offline & sync and the neutral shell remain usable across the required matrix", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await provisionAndSignInLocalAuthor(page, {
    displayName: "Offline visual learner",
    emailPrefix: "phase05-visual",
    handlePrefix: "offlinevisual",
    returnTo: "/app/decks/new",
  });
  await page
    .getByRole("dialog", { name: /Make Lumen yours/i })
    .getByRole("button", { name: "Explore on my own" })
    .click();
  await page.getByRole("textbox", { name: "Deck title" }).fill("Offline visual deck");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create deck and add cards" }).click();
  await page.getByRole("textbox", { name: "Front / prompt" }).fill("Responsive offline prompt");
  await page.getByRole("textbox", { name: "Back / answer" }).fill("Responsive offline answer");
  await page.getByRole("button", { name: "Save card" }).click();
  await page.goto("/app");
  const deck = page.locator(".deck-tile").filter({ hasText: "Offline visual deck" });
  await deck.getByRole("button", { name: "Pin Offline visual deck for offline use" }).click();
  await expect(
    deck.getByRole("button", { name: "Remove Offline visual deck from offline use" }),
  ).toBeVisible();
  await page.goto("/app/offline");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Offline & sync" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conflict Center" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
    await expectInsideViewport(page);
    await capture(page, testInfo, `offline-${String(viewport.width)}x${String(viewport.height)}`);
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await expectInsideViewport(page);
  await capture(page, testInfo, "offline-mobile-dark");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const reducedTransitionDuration = await page
    .locator(".offline-status")
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(reducedTransitionDuration).toMatch(/^(0s|0\.0+s)$/u);
  await capture(page, testInfo, "offline-mobile-reduced-motion");

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectInsideViewport(page);
  await capture(page, testInfo, "offline-mobile-200-percent-text");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  await page.setViewportSize({ height: 768, width: 1024 });
  for (const zoom of [1.25, 1.5]) {
    await page.evaluate((value) => {
      document.documentElement.style.zoom = String(value);
    }, zoom);
    await expectInsideViewport(page);
    await capture(page, testInfo, `offline-${String(Math.round(zoom * 100))}-percent-zoom`);
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller && registration.active) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    }
  });
  await context.setOffline(true);
  await page.setViewportSize({ height: 568, width: 320 });
  await page.goto("/app/library?visual-offline=1");
  await expect(page.getByRole("heading", { name: "Pinned library" })).toBeVisible();
  await page.getByRole("button", { name: /Offline visual deck/u }).click();
  await expect(page.getByText("Responsive offline prompt")).toBeVisible();
  await expectInsideViewport(page);
  await capture(page, testInfo, "neutral-shell-320x568");
});
