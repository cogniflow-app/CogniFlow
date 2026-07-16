import { defineConfig, devices } from "@playwright/test";

function readTrustedHostedBaseUrl(): string {
  const untrusted = process.env.PLAYWRIGHT_BASE_URL;
  if (!untrusted) {
    throw new Error("PLAYWRIGHT_BASE_URL is required for hosted content acceptance.");
  }
  let parsed: URL;
  try {
    parsed = new URL(untrusted);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be an absolute HTTPS URL.");
  }
  const trustedHostname =
    parsed.hostname === "recallflash.com" ||
    parsed.hostname === "cogniflow-pearl.vercel.app" ||
    /^cogniflow-[a-z0-9]+-cogniflow-app-3471s-projects\.vercel\.app$/u.test(parsed.hostname);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !trustedHostname
  ) {
    throw new Error("Hosted content acceptance is restricted to this repository's Vercel project.");
  }
  return parsed.origin;
}

const baseURL = readTrustedHostedBaseUrl();
if (!process.env.HOSTED_ACCEPTANCE_RUN_ID || !process.env.HOSTED_PREVIEW_SUPABASE_SECRET_KEY) {
  throw new Error("Hosted content acceptance must be started through its guarded Preview runner.");
}

const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/hosted-content",
  reporter: "list",
  retries: 0,
  testDir: "./e2e",
  testMatch: "**/hosted-content.spec.ts",
  timeout: 180_000,
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
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    trace: "off",
    video: "off",
  },
  workers: 1,
});
