import { createEnvironmentFixture } from "@lumen/test-utils";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_TEST,
} from "next/constants";
import { describe, expect, it } from "vitest";

import { createNextConfigForEnvironment, validateNextEnvironment } from "../next.config";

const requiredProductionValues = [
  "DEPLOYMENT_PROFILE",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "APP_ENCRYPTION_KEY",
  "GUEST_TOKEN_SIGNING_KEY",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
] as const;

function createProductionEnvironmentFixture(overrides: Readonly<Record<string, string>> = {}) {
  return createEnvironmentFixture({
    DEPLOYMENT_PROFILE: "cloudflare",
    NEXT_PUBLIC_APP_URL: "https://learn.example.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test",
    ...overrides,
  });
}

describe("Next environment validation", () => {
  it.each(requiredProductionValues)(
    "rejects a production build without %s even when NODE_ENV says test",
    (name) => {
      const source: Record<string, string | undefined> = {
        ...createEnvironmentFixture(),
        NODE_ENV: "test",
      };
      delete source[name];

      expect(() => validateNextEnvironment(PHASE_PRODUCTION_BUILD, source)).toThrow();
    },
  );

  it.each([PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER, PHASE_EXPORT])(
    "forces production semantics for %s",
    (phase) => {
      const environment = validateNextEnvironment(phase, createProductionEnvironmentFixture());

      expect(environment.nodeEnvironment).toBe("production");
    },
  );

  it("keeps development and test phases usable with safe local defaults", () => {
    expect(validateNextEnvironment(PHASE_DEVELOPMENT_SERVER, {}).nodeEnvironment).toBe(
      "development",
    );
    expect(validateNextEnvironment(PHASE_TEST, {}).nodeEnvironment).toBe("test");
  });

  it("forwards the provider-owned Vercel marker into the child safety gate", () => {
    const environment = validateNextEnvironment(PHASE_PRODUCTION_BUILD, {
      ...createProductionEnvironmentFixture(),
      ENABLE_CHILD_PROFILES: "true",
      PARENTAL_CONSENT_MODE: "external_verified",
      VERCEL: "1",
    });

    expect(environment).toMatchObject({
      enableChildProfiles: false,
      parentalConsentMode: "disabled",
      vercelRuntime: true,
    });
  });

  it("derives and inlines the exact Vercel preview deployment origin", () => {
    const source = {
      ...createProductionEnvironmentFixture(),
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_URL: "cogniflow-preview-123.vercel.app",
    };
    const environment = validateNextEnvironment(PHASE_PRODUCTION_BUILD, source);
    const config = createNextConfigForEnvironment(PHASE_PRODUCTION_BUILD, source);

    expect(environment.public.appUrl).toBe("https://cogniflow-preview-123.vercel.app");
    expect(config.env?.NEXT_PUBLIC_APP_URL).toBe("https://cogniflow-preview-123.vercel.app");
  });

  it("fails closed when a Vercel preview origin is missing or malformed", () => {
    const source = {
      ...createProductionEnvironmentFixture(),
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL: "1",
      VERCEL_ENV: "preview",
    };

    expect(() => validateNextEnvironment(PHASE_PRODUCTION_BUILD, source)).toThrow();
    expect(() =>
      validateNextEnvironment(PHASE_PRODUCTION_BUILD, {
        ...source,
        VERCEL_URL: "example.com/path",
      }),
    ).toThrow(/VERCEL_URL/u);
  });

  it("adds noindex response headers to the beta profile", async () => {
    const config = createNextConfigForEnvironment(PHASE_PRODUCTION_BUILD, {
      ...createProductionEnvironmentFixture(),
      DEPLOYMENT_PROFILE: "vercel_beta",
    });
    const headers = await config.headers?.();
    const global = headers?.find(({ source }) => source === "/((?!embed/deck/).*)");

    expect(global?.headers).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow, noarchive",
    });
  });

  it("allows local signed media only in development image and media directives", async () => {
    const development = createNextConfigForEnvironment(PHASE_DEVELOPMENT_SERVER, {});
    const production = createNextConfigForEnvironment(
      PHASE_PRODUCTION_BUILD,
      createProductionEnvironmentFixture(),
    );
    const developmentPolicy = (await development.headers?.())
      ?.flatMap(({ headers }) => headers)
      .find(({ key }) => key === "Content-Security-Policy")?.value;
    const productionPolicy = (await production.headers?.())
      ?.flatMap(({ headers }) => headers)
      .find(({ key }) => key === "Content-Security-Policy")?.value;
    const directive = (policy: string | undefined, name: string) =>
      policy?.split("; ").find((value) => value.startsWith(`${name} `));

    expect(directive(developmentPolicy, "img-src")).toContain("http://127.0.0.1:*");
    expect(directive(developmentPolicy, "media-src")).toContain("http://127.0.0.1:*");
    expect(directive(productionPolicy, "img-src")).not.toContain("http://127.0.0.1:*");
    expect(directive(productionPolicy, "media-src")).not.toContain("http://127.0.0.1:*");
  });

  it("allows only the dedicated public deck route to be framed", async () => {
    const config = createNextConfigForEnvironment(
      PHASE_PRODUCTION_BUILD,
      createProductionEnvironmentFixture(),
    );
    const headers = await config.headers?.();
    const global = headers?.find(({ source }) => source === "/((?!embed/deck/).*)");
    const embed = headers?.find(({ source }) => source === "/embed/deck/:publicId");

    expect(global?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(global?.headers).toContainEqual({
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=(self)",
    });
    expect(embed?.headers).not.toContainEqual(expect.objectContaining({ key: "X-Frame-Options" }));
    expect(embed?.headers).toContainEqual({
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=()",
    });
    expect(embed?.headers).toContainEqual(
      expect.objectContaining({
        key: "Content-Security-Policy",
        value: expect.stringContaining("frame-ancestors 'self' https:"),
      }),
    );
  });
});
