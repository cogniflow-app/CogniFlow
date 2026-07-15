import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createEnvironmentFixture } from "@lumen/test-utils";

import { deriveServerCapabilities, sanitizeCapabilities } from "../src/capabilities";
import { parsePublicEnvironment } from "../src/public-env";
import { parseServerEnvironment } from "../src/server-environment-parser";

const productionEnvironment = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_NAME: "Lumen",
  NEXT_PUBLIC_APP_URL: "https://learn.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_value",
  SUPABASE_SECRET_KEY: "server-secret-key-with-sufficient-length",
  DATABASE_URL: "postgresql://user:password@db.example.test:5432/postgres",
  APP_ENCRYPTION_KEY: "app-encryption-key-with-sufficient-length",
  GUEST_TOKEN_SIGNING_KEY: "guest-signing-key-with-sufficient-length",
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
} as const;

describe("public environment", () => {
  it("provides safe local defaults", () => {
    expect(parsePublicEnvironment({ NODE_ENV: "test" })).toMatchObject({
      appName: "Lumen",
      appUrl: "http://127.0.0.1:3100",
      supabaseUrl: "http://127.0.0.1:54321",
    });
  });

  it("reads only explicit public process variables", async () => {
    const { readPublicEnvironment } = await import("../src/public-env");
    expect(readPublicEnvironment().appName).toBeTruthy();
  });

  it("fails fast when production public values are absent", () => {
    expect(() => parsePublicEnvironment({ NODE_ENV: "production" })).toThrow();
  });
});

describe("server environment and capabilities", () => {
  it("forces all child-facing capabilities off on Vercel beta", () => {
    const environment = parseServerEnvironment({
      ...productionEnvironment,
      DEPLOYMENT_PROFILE: "vercel_beta",
      ENABLE_CHILD_PROFILES: "true",
      ENABLE_PUBLIC_CHILD_CONTENT: "true",
      ENABLE_FREE_TEXT_GAME_CHAT: "true",
    });

    expect(environment).toMatchObject({
      enableChildProfiles: false,
      enablePublicChildContent: false,
      enableFreeTextGameChat: false,
    });
  });

  it("parses the literal false as false", () => {
    const environment = parseServerEnvironment(createEnvironmentFixture());

    expect(environment.enableChildProfiles).toBe(false);
  });

  it("rejects ambiguous feature flag strings", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        ENABLE_CHILD_PROFILES: "yes",
      }),
    ).toThrow(/ENABLE_CHILD_PROFILES/u);
  });

  it("requires an explicit deployment profile in production", () => {
    expect(() => parseServerEnvironment(productionEnvironment)).toThrow(/DEPLOYMENT_PROFILE/u);
  });

  it("rejects malformed Server Action encryption keys", () => {
    expect(() =>
      parseServerEnvironment({
        ...productionEnvironment,
        DEPLOYMENT_PROFILE: "test",
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "not-base64-even-when-long-enough-0000000000",
      }),
    ).toThrow(/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/u);
  });

  it("can expose child capabilities only on the explicit portable profile", () => {
    const environment = parseServerEnvironment({
      ...productionEnvironment,
      DEPLOYMENT_PROFILE: "cloudflare",
      ENABLE_CHILD_PROFILES: "true",
      ENABLE_PUBLIC_CHILD_CONTENT: "true",
    });

    expect(environment).toMatchObject({
      enableChildProfiles: true,
      enablePublicChildContent: true,
    });
  });

  it("sanitizes capabilities through an explicit allow-list", () => {
    fc.assert(
      fc.property(fc.string(), (suffix) => {
        const serverSecret = `test-server-secret-value-00000000-${suffix}`;
        const environment = parseServerEnvironment({
          NODE_ENV: "test",
          SUPABASE_SECRET_KEY: serverSecret,
        });
        const publicCapabilities = sanitizeCapabilities(deriveServerCapabilities(environment));
        const serialized = JSON.stringify(publicCapabilities);

        expect(serialized).not.toContain("test-server-secret-value");
        expect(serialized).not.toContain("privilegedDatabaseAccess");
      }),
    );
  });
});
