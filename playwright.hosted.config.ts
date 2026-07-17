import { defineConfig, devices } from "@playwright/test";

import {
  assertHostedPreflightAttestation,
  consumeHostedPreflightFile,
} from "./scripts/hosted-preflight.cjs";

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
    parsed.port ||
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
const preflightFile = process.env.HOSTED_SMOKE_PREFLIGHT_FILE;
const legacyPreflight = process.env.HOSTED_SMOKE_PREFLIGHT;
delete process.env.HOSTED_SMOKE_PREFLIGHT_FILE;
delete process.env.HOSTED_SMOKE_PREFLIGHT;
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()) {
  throw new Error("Hosted Playwright must not inherit the long-lived Vercel bypass secret.");
}
if (legacyPreflight) {
  throw new Error("Hosted Playwright must not inherit a credential-bearing preflight value.");
}
const hostedTarget = process.env.HOSTED_SMOKE_TARGET;
const bypassHostname = new URL(baseURL).hostname;
const targetOriginIsValid =
  (hostedTarget === "production" && baseURL === "https://recallflash.com") ||
  (hostedTarget === "preview" &&
    /^cogniflow-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-cogniflow-app-3471s-projects\.vercel\.app$/u.test(
      bypassHostname,
    ));

if (!targetOriginIsValid) {
  throw new Error("Hosted Playwright target does not match its guarded runner environment.");
}
const preflight = assertHostedPreflightAttestation(consumeHostedPreflightFile(preflightFile), {
  baseURL,
  requiresOwnership: true,
  target: hostedTarget,
});

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
    ignoreHTTPSErrors: false,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    storageState: preflight.storageState,
    trace: preflight.storageState ? "off" : "retain-on-failure",
  },
  workers: 1,
});
