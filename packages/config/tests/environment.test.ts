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
  PARENTAL_CONSENT_VERIFIER_API_KEY: "external-consent-verifier-test-key",
  PARENTAL_CONSENT_VERIFIER_URL: "https://consent.example.test/v1/verify",
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

  it("requires HTTPS for both public production origins", () => {
    expect(() =>
      parsePublicEnvironment({
        ...productionEnvironment,
        NEXT_PUBLIC_APP_URL: "http://learn.example.test",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL must use HTTPS/u);
    expect(() =>
      parsePublicEnvironment({
        ...productionEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "http://project.supabase.test",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL must use HTTPS/u);
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
      PARENTAL_CONSENT_MODE: "external_verified",
    });

    expect(environment).toMatchObject({
      parentalConsentMode: "disabled",
      enableChildProfiles: false,
      enablePublicChildContent: false,
      enableFreeTextGameChat: false,
    });
  });

  it("forces child-facing capabilities off inside the actual Vercel runtime", () => {
    const environment = parseServerEnvironment({
      ...productionEnvironment,
      DEPLOYMENT_PROFILE: "cloudflare",
      VERCEL: "1",
      ENABLE_CHILD_PROFILES: "true",
      ENABLE_PUBLIC_CHILD_CONTENT: "true",
      ENABLE_FREE_TEXT_GAME_CHAT: "true",
    });

    expect(environment).toMatchObject({
      vercelRuntime: true,
      parentalConsentMode: "disabled",
      enableChildProfiles: false,
      enablePublicChildContent: false,
      enableFreeTextGameChat: false,
    });
    expect(sanitizeCapabilities(deriveServerCapabilities(environment))).toMatchObject({
      childConsentReady: false,
      parentalConsentMode: "disabled",
    });
  });

  it("allows test-only consent only for enabled local child profiles", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "test",
      DEPLOYMENT_PROFILE: "test",
      ENABLE_CHILD_PROFILES: "true",
      PARENTAL_CONSENT_MODE: "test_only",
    });

    expect(environment).toMatchObject({
      enableChildProfiles: true,
      parentalConsentMode: "test_only",
    });
    expect(deriveServerCapabilities(environment)).toMatchObject({
      childConsentReady: true,
      parentalConsentMode: "test_only",
    });
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        ENABLE_CHILD_PROFILES: "false",
        PARENTAL_CONSENT_MODE: "test_only",
      }),
    ).toThrow(/test_only/u);
  });

  it("keeps managed child identities off in every production deployment", () => {
    const environment = parseServerEnvironment({
      ...productionEnvironment,
      DEPLOYMENT_PROFILE: "cloudflare",
      ENABLE_CHILD_PROFILES: "true",
      PARENTAL_CONSENT_MODE: "external_verified",
    });

    expect(environment).toMatchObject({
      enableChildProfiles: false,
      enablePublicChildContent: false,
      parentalConsentMode: "disabled",
      parentalConsentVerifierApiKey: null,
      parentalConsentVerifierUrl: null,
      productionManagedProfileSafetyGate: true,
    });
    expect(deriveServerCapabilities(environment).childConsentReady).toBe(false);
  });

  it("refuses external consent mode without a complete server-only verifier", () => {
    expect(() =>
      parseServerEnvironment({
        ...productionEnvironment,
        NODE_ENV: "test",
        DEPLOYMENT_PROFILE: "cloudflare",
        ENABLE_CHILD_PROFILES: "true",
        PARENTAL_CONSENT_MODE: "external_verified",
        PARENTAL_CONSENT_VERIFIER_API_KEY: undefined,
      }),
    ).toThrow(/PARENTAL_CONSENT_VERIFIER/u);
  });

  it("maps configured Microsoft OAuth to the Supabase azure provider identifier", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "test",
      AUTH_OAUTH_AZURE_ENABLED: "true",
      AUTH_OAUTH_GITHUB_ENABLED: "1",
      AUTH_OAUTH_GOOGLE_ENABLED: "false",
    });

    expect(environment.enabledOAuthProviders).toEqual(["github", "azure"]);
  });

  it("uses bounded privacy and rate-limit defaults", () => {
    const environment = parseServerEnvironment({ NODE_ENV: "test" });

    expect(environment.privacyRetention).toEqual({
      auditEventDays: 365,
      deletionGraceDays: 30,
      exportDownloadDays: 7,
      guestSessionHours: 24,
      profileSessionMinutes: 30,
    });
    expect(environment.rateLimits).toEqual({
      destructiveRequestAttempts: 3,
      guestCreationAttempts: 20,
      passwordResetAttempts: 5,
      profilePinAttempts: 5,
      signupAttempts: 5,
      windowSeconds: 900,
    });
  });

  it("parses configured privacy and rate-limit bounds", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "test",
      DELETION_GRACE_PERIOD_DAYS: "14",
      PROFILE_SESSION_TTL_MINUTES: "20",
      RATE_LIMIT_PROFILE_PIN_ATTEMPTS: "4",
      RATE_LIMIT_WINDOW_SECONDS: "600",
    });

    expect(environment.privacyRetention).toMatchObject({
      deletionGraceDays: 14,
      profileSessionMinutes: 20,
    });
    expect(environment.rateLimits).toMatchObject({
      profilePinAttempts: 4,
      windowSeconds: 600,
    });
  });

  it("rejects unsafe privacy and rate-limit values", () => {
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "test", DELETION_GRACE_PERIOD_DAYS: "0" }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "test", PROFILE_SESSION_TTL_MINUTES: "31" }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "test", GUEST_SESSION_RETENTION_HOURS: "25" }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "test", RATE_LIMIT_WINDOW_SECONDS: "forever" }),
    ).toThrow();
  });

  it("parses the literal false as false", () => {
    const environment = parseServerEnvironment(createEnvironmentFixture());

    expect(environment.enableChildProfiles).toBe(false);
  });

  it("keeps child profiles disabled until a consent mode is ready", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "test",
      ENABLE_CHILD_PROFILES: "true",
      PARENTAL_CONSENT_MODE: "disabled",
    });

    expect(environment.enableChildProfiles).toBe(false);
    expect(deriveServerCapabilities(environment).childConsentReady).toBe(false);
  });

  it("rejects ambiguous feature flag strings", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        ENABLE_CHILD_PROFILES: "yes",
      }),
    ).toThrow(/ENABLE_CHILD_PROFILES/u);

    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "test",
        AUTH_OAUTH_GOOGLE_ENABLED: "enabled",
      }),
    ).toThrow(/AUTH_OAUTH_GOOGLE_ENABLED/u);
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

  it("can exercise external consent locally without enabling production managed identity", () => {
    const environment = parseServerEnvironment({
      ...productionEnvironment,
      NODE_ENV: "test",
      DEPLOYMENT_PROFILE: "cloudflare",
      ENABLE_CHILD_PROFILES: "true",
      ENABLE_PUBLIC_CHILD_CONTENT: "true",
      PARENTAL_CONSENT_MODE: "external_verified",
    });

    expect(environment).toMatchObject({
      enableChildProfiles: true,
      enablePublicChildContent: true,
      parentalConsentMode: "external_verified",
      productionManagedProfileSafetyGate: false,
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
        expect(serialized).not.toContain("rateLimits");
      }),
    );
  });
});
