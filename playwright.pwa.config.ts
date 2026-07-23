import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  outputDir: "test-results/pwa",
  preserveOutput: "always",
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report/pwa" }]]
    : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  testMatch: "**/phase-five-*.spec.ts",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start-local-production-test-server.mjs",
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 120_000,
    url: `${baseURL}/api/health`,
  },
  workers: 1,
});
