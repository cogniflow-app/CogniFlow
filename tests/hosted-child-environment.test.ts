// @vitest-environment node

import { existsSync, lstatSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createHostedPlaywrightEnvironment } from "../scripts/hosted-child-environment.mjs";

describe("hosted Playwright environment boundary", () => {
  it("uses an exact allowlist and an empty private home instead of operator credential paths", () => {
    const environment = {
      APPDATA: "/operator/appdata",
      APP_ENCRYPTION_KEY: "application-encryption-value",
      AWS_ACCESS_KEY_ID: "operator-access-key-id",
      AWS_SECRET_ACCESS_KEY: "operator-access-key-value",
      CI: "true",
      CLOUDSDK_CONFIG: "/operator/google-cloud",
      DATABASE_URL: "postgresql://operator-database.example/test",
      GITHUB_TOKEN: "github-operator-value",
      HOME: "/operator/home",
      KUBECONFIG: "/operator/kube/config",
      LANG: "en_US.UTF-8",
      LOCALAPPDATA: "/operator/local-appdata",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-browser-value",
      NPM_CONFIG_USERCONFIG: "/operator/npmrc",
      PATH: process.env.PATH ?? "/usr/bin",
      PGPASSWORD: "postgres-operator-value",
      SSH_AUTH_SOCK: "/operator/ssh-agent.sock",
      SUPABASE_ACCESS_TOKEN: "supabase-management-value",
      SUPABASE_SECRET_KEY: "unscoped-application-server-value",
      USERPROFILE: "/operator/profile",
      VERCEL_AUTOMATION_BYPASS_SECRET: "vercel-bypass-value",
      VERCEL_TOKEN: "vercel-management-value",
      XDG_CONFIG_HOME: "/operator/xdg-config",
      XDG_DATA_HOME: "/operator/xdg-data",
    };

    const sandbox = createHostedPlaywrightEnvironment(environment, {
      HOSTED_ACCEPTANCE_RUN_ID: "6d0cf9b2-165e-45d4-8d47-3624e42b9084",
      HOSTED_CONTENT_PREFLIGHT_FILE: "/private/preflight/attestation",
      PLAYWRIGHT_BASE_URL: "https://preview.example.test",
    });

    try {
      const child = sandbox.environment;
      expect(child).toMatchObject({
        CI: "true",
        HOSTED_ACCEPTANCE_RUN_ID: "6d0cf9b2-165e-45d4-8d47-3624e42b9084",
        HOSTED_CONTENT_PREFLIGHT_FILE: "/private/preflight/attestation",
        LANG: "en_US.UTF-8",
        PLAYWRIGHT_BASE_URL: "https://preview.example.test",
      });
      expect(child.HOSTED_FIXTURE_CONFIRMATION_FILE).toBe(sandbox.fixtureConfirmationFile);
      for (const name of [
        "APP_ENCRYPTION_KEY",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "CLOUDSDK_CONFIG",
        "DATABASE_URL",
        "GITHUB_TOKEN",
        "KUBECONFIG",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "NPM_CONFIG_USERCONFIG",
        "PGPASSWORD",
        "SSH_AUTH_SOCK",
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_SECRET_KEY",
        "VERCEL_AUTOMATION_BYPASS_SECRET",
        "VERCEL_TOKEN",
      ]) {
        expect(child).not.toHaveProperty(name);
      }
      for (const name of [
        "APPDATA",
        "HOME",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "TMPDIR",
        "USERPROFILE",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_STATE_HOME",
      ]) {
        expect(String(child[name]).startsWith(sandbox.sandboxRoot)).toBe(true);
        if (process.platform !== "win32") {
          expect(statSync(String(child[name])).mode & 0o077).toBe(0);
        }
      }
      expect(String(child.PLAYWRIGHT_BROWSERS_PATH).startsWith(sandbox.sandboxRoot)).toBe(true);
      expect(lstatSync(String(child.PLAYWRIGHT_BROWSERS_PATH)).isSymbolicLink()).toBe(true);
      const serialized = JSON.stringify(child);
      for (const value of Object.values(environment)) {
        if (value === environment.CI || value === environment.LANG || value === environment.PATH) {
          continue;
        }
        expect(serialized).not.toContain(value);
      }
    } finally {
      sandbox.cleanup();
    }
    expect(existsSync(sandbox.sandboxRoot)).toBe(false);
  });

  it("rejects legacy credential-bearing or unrecognized additions", () => {
    expect(() =>
      createHostedPlaywrightEnvironment(
        { PATH: process.env.PATH ?? "/usr/bin" },
        { HOSTED_CONTENT_PREFLIGHT: "encoded-cookie-bearing-attestation" },
      ),
    ).toThrow(/addition is not allowed/u);
    expect(() =>
      createHostedPlaywrightEnvironment(
        { PATH: process.env.PATH ?? "/usr/bin" },
        { SUPABASE_ACCESS_TOKEN: "management-token" },
      ),
    ).toThrow(/addition is not allowed/u);
  });

  it("resolves generated additions inside the sterile child runtime", () => {
    let generatedTemporaryDirectory: string | undefined;
    const sandbox = createHostedPlaywrightEnvironment(
      { PATH: process.env.PATH ?? "/usr/bin" },
      ({ temporaryDirectory }) => {
        generatedTemporaryDirectory = temporaryDirectory;
        return {
          HOSTED_SMOKE_PREFLIGHT_FILE: `${temporaryDirectory}/lumen-hosted-preflight-test/attestation`,
          HOSTED_SMOKE_TARGET: "preview",
          PLAYWRIGHT_BASE_URL: "https://preview.example.test",
        };
      },
    );

    try {
      expect(generatedTemporaryDirectory).toBe(sandbox.environment.TMPDIR);
      expect(String(sandbox.environment.HOSTED_SMOKE_PREFLIGHT_FILE)).toContain(
        String(sandbox.environment.TMPDIR),
      );
    } finally {
      sandbox.cleanup();
    }
  });
});
