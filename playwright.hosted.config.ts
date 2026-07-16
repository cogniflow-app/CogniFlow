import { defineConfig, devices } from "@playwright/test";

function readHostedBaseUrl(): string {
  const untrusted = process.env.PLAYWRIGHT_BASE_URL;
  if (!untrusted) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL is required for hosted smoke tests; no local fallback is permitted.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(untrusted);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be an absolute HTTPS URL.");
  }

  const localHostnames = new Set(["127.0.0.1", "[::1]", "localhost", "0.0.0.0"]);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    localHostnames.has(parsed.hostname) ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname.endsWith(".localhost")
  ) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL must be a non-local HTTPS origin without credentials, a path, query, or fragment.",
    );
  }

  return parsed.origin;
}

const baseURL = readHostedBaseUrl();
const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const bypassHostname = new URL(baseURL).hostname;
const trustedBypassOrigin =
  bypassHostname === "cogniflow-pearl.vercel.app" ||
  /^cogniflow-[a-z0-9]+-cogniflow-app-3471s-projects\.vercel\.app$/u.test(bypassHostname);

if (protectionBypass && !trustedBypassOrigin) {
  throw new Error(
    "VERCEL_AUTOMATION_BYPASS_SECRET may be sent only to this repository's trusted Vercel project origins.",
  );
}

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/hosted",
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report/hosted" }]]
    : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  testMatch: "**/hosted.spec.ts",
  timeout: 45_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    extraHTTPHeaders: protectionBypass
      ? {
          "x-vercel-protection-bypass": protectionBypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
    ignoreHTTPSErrors: false,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    trace: protectionBypass ? "off" : "retain-on-failure",
  },
  workers: 1,
});
