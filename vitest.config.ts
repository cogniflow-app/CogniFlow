import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const sharedSetup = new URL("./tests/setup.ts", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": new URL("./tests/server-only.ts", import.meta.url).pathname,
    },
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: [
        "**/*.d.ts",
        "**/*.config.{ts,mts,mjs}",
        "**/generated/**",
        "**/.next/**",
        "**/.open-next/**",
        "**/tests/**",
        "apps/web/app/global-error.tsx",
        "apps/web/app/not-found.tsx",
      ],
      include: ["apps/web/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        branches: 45,
        functions: 55,
        lines: 70,
        statements: 70,
      },
    },
    environment: "jsdom",
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    mockReset: true,
    restoreMocks: true,
    setupFiles: [sharedSetup],
  },
});
