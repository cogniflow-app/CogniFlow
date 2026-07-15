import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  outputDir: "test-results/a11y",
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report/a11y" }]]
    : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  testMatch: "**/a11y.spec.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start-test-development-server.mjs",
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 120_000,
    url: `${baseURL}/api/health`,
  },
});
