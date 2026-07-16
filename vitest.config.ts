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
        // Next route/page adapters and browser components are exercised through
        // Playwright, axe, and integration tests. Unit coverage measures the
        // framework-independent services they delegate to instead.
        "apps/web/app/**",
        "apps/web/components/**",
        "apps/web/proxy.ts",
        "apps/web/lib/auth/**",
        "apps/web/lib/supabase/**",
        "apps/web/lib/server/account-context.ts",
        "apps/web/lib/server/auth-providers.ts",
        "apps/web/lib/server/cookies.ts",
        "apps/web/lib/server/device.ts",
        "apps/web/lib/server/guest-room-adapter.ts",
        "apps/web/lib/server/guest-sessions.ts",
        "apps/web/lib/server/parental-consent.ts",
        "apps/web/lib/server/rate-limit.ts",
        "apps/web/lib/server/reauthentication.ts",
        "apps/web/lib/server/recovery-intent.ts",
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
