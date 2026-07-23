import { defineConfig, devices } from "@playwright/test";

import {
  assertHostedPreflightAttestation,
  readHostedPreflightFile,
} from "./scripts/hosted-preflight.cjs";

function readTrustedHostedBaseUrl(): string {
  const untrusted = process.env.PLAYWRIGHT_BASE_URL;
  if (!untrusted) throw new Error("PLAYWRIGHT_BASE_URL is required for hosted offline acceptance.");
  let parsed: URL;
  try {
    parsed = new URL(untrusted);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be an absolute HTTPS URL.");
  }
  const trustedHostname =
    /^cogniflow-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-cogniflow-app-3471s-projects\.vercel\.app$/u.test(
      parsed.hostname,
    );
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
    throw new Error("Hosted offline acceptance is restricted to this repository's Vercel project.");
  }
  return parsed.origin;
}

const baseURL = readTrustedHostedBaseUrl();
if (!process.env.HOSTED_ACCEPTANCE_RUN_ID || !process.env.HOSTED_FIXTURE_CONFIRMATION_FILE) {
  throw new Error("Hosted offline acceptance must use its guarded Preview runner.");
}
const preflightFile = process.env.HOSTED_CONTENT_PREFLIGHT_FILE;
const legacyPreflight = process.env.HOSTED_CONTENT_PREFLIGHT;
delete process.env.HOSTED_CONTENT_PREFLIGHT;
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || legacyPreflight) {
  throw new Error("Hosted Playwright must not inherit a credential-bearing preflight value.");
}
const preflight = assertHostedPreflightAttestation(readHostedPreflightFile(preflightFile), {
  baseURL,
  requiresOwnership: true,
  target: "preview",
});

export default defineConfig({
  expect: { timeout: 20_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/hosted-offline",
  reporter: "list",
  retries: 0,
  testDir: "./e2e",
  testMatch: "**/hosted-offline.spec.ts",
  timeout: 360_000,
  use: {
    ...devices["Desktop Chrome"],
    actionTimeout: 30_000,
    baseURL,
    ignoreHTTPSErrors: false,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    storageState: preflight.storageState,
    trace: "off",
    video: "off",
  },
  workers: 1,
});
