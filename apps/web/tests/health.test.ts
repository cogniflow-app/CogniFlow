// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/health/route";

describe("health route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns runtime/build information and never serializes server secrets", async () => {
    const sentinel = "sentinel-server-secret-that-must-never-leak";
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEPLOYMENT_PROFILE", "test");
    vi.stubEnv("SUPABASE_SECRET_KEY", sentinel);
    vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "phase-00-test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://cfwddajyjbueggpzfomh.supabase.co");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = GET();
    const body: unknown = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      buildVersion: "phase-00-test",
      deploymentProfile: "test",
      runtime: "nodejs",
      status: "ok",
      supabaseProjectRef: "cfwddajyjbueggpzfomh",
      vercelEnvironment: "preview",
      version: "phase-00-test",
    });
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("databaseUrl");
    expect(serialized).not.toContain("privilegedDatabaseAccess");
    expect(serialized).not.toContain("supabasePublishableKey");
    expect(serialized).not.toContain("supabaseSecretKey");
    expect(serialized).not.toContain("supabaseUrl");
  });

  it("does not invent a hosted identity for local or malformed provider values", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEPLOYMENT_PROFILE", "test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VERCEL", "0");
    vi.stubEnv("VERCEL_ENV", "unexpected");

    await expect(GET().json()).resolves.toMatchObject({
      supabaseProjectRef: null,
      vercelEnvironment: null,
    });
  });
});
