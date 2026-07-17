// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assertHostedSmokeHealthProjection,
  isHostedSmokeOriginForTarget,
  isCandidateVercelAutomationOrigin,
  normalizeHostedBaseUrl,
  preflightHostedSmokeTarget,
  resolveHostedSmokeRun,
} from "../scripts/run-hosted-smoke.mjs";
import {
  assertHostedPreflightAttestation,
  assertVercelDeploymentMetadata,
  authenticateVercelDeploymentOwnership,
  parseVercelBypassCookie,
  readVercelAccessToken,
  resolveVercelAutomationBypass,
  selectVercelAutomationBypass,
} from "../scripts/vercel-deployment-ownership.mjs";

const previewUrl =
  "https://cogniflow-git-codex-phase-02-ab12cd-cogniflow-app-3471s-projects.vercel.app";
const automationBypass = "existing-automation-bypass-token-123";
const ownedDeployment = Object.freeze({
  baseURL: previewUrl,
  deploymentId: "dpl_ownedPreview123",
  projectId: "prj_ownedProject123",
  projectName: "cogniflow",
  target: "preview",
  teamId: "team_ownedTeam123",
});

describe("hosted smoke runner", () => {
  it("normalizes an explicit hosted HTTPS origin", () => {
    expect(normalizeHostedBaseUrl(" https://preview.example.test/ ")).toBe(
      "https://preview.example.test",
    );
    expect(
      resolveHostedSmokeRun(["preview"], {
        HOSTED_PREVIEW_URL: previewUrl,
      }),
    ).toEqual({ baseURL: previewUrl, target: "preview" });
  });

  it.each([
    "http://preview.example.test",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://preview.local",
    "https://preview.example.test:444",
    "https://preview.example.test/path",
    "https://preview.example.test?target=other",
    "https://user:password@preview.example.test",
  ])("rejects a non-hosted or non-origin URL: %s", (value) => {
    expect(() => normalizeHostedBaseUrl(value)).toThrow(/non-local HTTPS origin/u);
  });

  it("supports a deliberate URL override and rejects ambiguous arguments", () => {
    expect(
      resolveHostedSmokeRun(["production", "--url", "https://recallflash.com"], {
        HOSTED_PRODUCTION_URL: "https://ignored.example.test",
      }),
    ).toEqual({ baseURL: "https://recallflash.com", target: "production" });
    expect(() => resolveHostedSmokeRun([], {})).toThrow(/preview or production/u);
    expect(() => resolveHostedSmokeRun(["toString"], {})).toThrow(/preview or production/u);
    expect(() => resolveHostedSmokeRun(["preview"], {})).toThrow(/base URL is required/u);
    expect(() =>
      resolveHostedSmokeRun(["preview", "--url", "https://one.example.test", "--url"], {}),
    ).toThrow(/unknown or repeated option/iu);
    expect(() =>
      resolveHostedSmokeRun(["preview", "--url", "https://recallflash.com"], {}),
    ).toThrow(/fixed hosted environment/iu);
    expect(() => resolveHostedSmokeRun(["production", "--url", previewUrl], {})).toThrow(
      /fixed hosted environment/iu,
    );
  });

  it("binds each runner target to its exact runtime and Supabase data plane", () => {
    const health = {
      buildVersion: "abc123",
      deploymentProfile: "vercel_beta",
      provider: "vercel",
      status: "ok",
      supabaseProjectRef: "cfwddajyjbueggpzfomh",
      vercelEnvironment: "preview",
    };
    expect(isHostedSmokeOriginForTarget(previewUrl, "preview")).toBe(true);
    expect(isHostedSmokeOriginForTarget("https://recallflash.com", "production")).toBe(true);
    expect(isHostedSmokeOriginForTarget("https://recallflash.com", "preview")).toBe(false);
    expect(() => assertHostedSmokeHealthProjection(health, "preview")).not.toThrow();
    expect(() => assertHostedSmokeHealthProjection(health, "production")).toThrow(
      /fixed hosted environment/u,
    );
  });

  it("preflights health with protection headers only after target validation", async () => {
    const events: string[] = [];
    const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`${previewUrl}/api/health`);
      const headers = new Headers(init?.headers);
      if (events.at(-1) === "bypass") {
        events.push("cookie-bootstrap");
        expect(init?.redirect).toBe("manual");
        expect(headers.get("x-vercel-protection-bypass")).toBe("operator-secret");
        expect(headers.get("x-vercel-set-bypass-cookie")).toBe("true");
        return new Response(null, {
          headers: {
            Location: `${previewUrl}/api/health`,
            "Set-Cookie":
              "_vercel_jwt=preview-cookie-value-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=Lax",
          },
          status: 307,
        });
      }
      events.push("cookie-health");
      expect(init?.redirect).toBe("error");
      expect(headers.get("x-vercel-protection-bypass")).toBeNull();
      expect(headers.get("cookie")).toBe("_vercel_jwt=preview-cookie-value-that-is-safely-long");
      return new Response(
        JSON.stringify({
          buildVersion: "abc123",
          deploymentProfile: "vercel_beta",
          provider: "vercel",
          status: "ok",
          supabaseProjectRef: "cfwddajyjbueggpzfomh",
          vercelEnvironment: "preview",
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    };
    const authenticateOwnership = async () => {
      events.push("ownership");
      return ownedDeployment;
    };
    const preflight = await preflightHostedSmokeTarget(
      { baseURL: previewUrl, target: "preview" },
      { VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret" },
      fetchMock,
      authenticateOwnership,
      async (ownership, environment) => {
        events.push("bypass");
        expect(ownership).toBe(ownedDeployment);
        expect(environment.VERCEL_AUTOMATION_BYPASS_SECRET).toBe("operator-secret");
        return "operator-secret";
      },
    );
    expect(events).toEqual(["ownership", "bypass", "cookie-bootstrap", "cookie-health"]);
    const parsedPreflight = assertHostedPreflightAttestation(preflight, {
      baseURL: previewUrl,
      requiresOwnership: true,
      target: "preview",
    });
    expect(parsedPreflight.storageState).toEqual({
      cookies: [
        expect.objectContaining({
          domain: new URL(previewUrl).hostname,
          name: "_vercel_jwt",
          path: "/",
          secure: true,
        }),
      ],
      origins: [],
    });
    expect(() =>
      assertHostedPreflightAttestation(preflight, {
        baseURL: previewUrl,
        requiresOwnership: true,
        target: "preview",
      }),
    ).not.toThrow();

    events.length = 0;
    await expect(
      preflightHostedSmokeTarget(
        { baseURL: "https://recallflash.com", target: "preview" },
        { VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret" },
        fetchMock,
        authenticateOwnership,
      ),
    ).rejects.toThrow(/not valid/u);
    expect(events).toEqual([]);
  });

  it("resolves the existing project bypass after ownership even when no override is supplied", async () => {
    const events: string[] = [];
    const preflight = await preflightHostedSmokeTarget(
      { baseURL: previewUrl, target: "preview" },
      {},
      async (input, init) => {
        expect(String(input)).toBe(`${previewUrl}/api/health`);
        const headers = new Headers(init?.headers);
        if (events.at(-1) === "bypass") {
          events.push("cookie-bootstrap");
          expect(headers.get("x-vercel-protection-bypass")).toBe(automationBypass);
          return new Response(null, {
            headers: {
              Location: `${previewUrl}/api/health`,
              "Set-Cookie":
                "_vercel_jwt=resolved-cookie-value-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=Lax",
            },
            status: 307,
          });
        }
        events.push("cookie-health");
        expect(headers.get("x-vercel-protection-bypass")).toBeNull();
        expect(headers.get("cookie")).toBe("_vercel_jwt=resolved-cookie-value-that-is-safely-long");
        return new Response(
          JSON.stringify({
            buildVersion: "abc123",
            deploymentProfile: "vercel_beta",
            provider: "vercel",
            status: "ok",
            supabaseProjectRef: "cfwddajyjbueggpzfomh",
            vercelEnvironment: "preview",
          }),
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      async () => {
        events.push("ownership");
        return ownedDeployment;
      },
      async (ownership, environment) => {
        events.push("bypass");
        expect(ownership).toBe(ownedDeployment);
        expect(environment.VERCEL_AUTOMATION_BYPASS_SECRET).toBeUndefined();
        return automationBypass;
      },
    );

    expect(events).toEqual(["ownership", "bypass", "cookie-bootstrap", "cookie-health"]);
    expect(
      assertHostedPreflightAttestation(preflight, {
        baseURL: previewUrl,
        requiresOwnership: true,
        target: "preview",
      }),
    ).toMatchObject({ verification: "vercel-api", storageState: { cookies: [{}] } });
  });

  it("treats project-shaped origins only as candidates for authenticated ownership", () => {
    expect(isCandidateVercelAutomationOrigin("https://recallflash.com")).toBe(true);
    expect(isCandidateVercelAutomationOrigin("https://cogniflow-pearl.vercel.app")).toBe(true);
    expect(
      isCandidateVercelAutomationOrigin(
        "https://cogniflow-abc123-cogniflow-app-3471s-projects.vercel.app",
      ),
    ).toBe(true);
    expect(
      isCandidateVercelAutomationOrigin(
        "https://cogniflow-git-codex-phase-02-ab12cd-cogniflow-app-3471s-projects.vercel.app",
      ),
    ).toBe(true);
    expect(isCandidateVercelAutomationOrigin("https://www.recallflash.com")).toBe(false);
    expect(isCandidateVercelAutomationOrigin("http://recallflash.com")).toBe(false);
    expect(isCandidateVercelAutomationOrigin("https://recallflash.com:444")).toBe(false);
    expect(isCandidateVercelAutomationOrigin("https://attacker.vercel.app")).toBe(false);
    expect(
      isCandidateVercelAutomationOrigin(
        "https://cogniflow-owned-shape-cogniflow-app-3471s-projects.vercel.app.attacker.example",
      ),
    ).toBe(false);
    expect(() =>
      resolveHostedSmokeRun(["preview", "--url", "https://attacker.example"], {
        VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret",
      }),
    ).toThrow(/fixed hosted environment/u);
  });

  it("authenticates the exact deployment project, team, alias, readiness, and target", () => {
    const linkedProject = {
      orgId: "team_ownedTeam123",
      projectId: "prj_ownedProject123",
      projectName: "cogniflow",
    };
    const deployment = {
      alias: [previewUrl.slice("https://".length)],
      id: "dpl_ownedPreview123",
      name: "cogniflow",
      ownerId: linkedProject.orgId,
      project: { id: linkedProject.projectId, name: "cogniflow" },
      projectId: linkedProject.projectId,
      readyState: "READY",
      target: null,
      team: { id: linkedProject.orgId },
      url: "cogniflow-canonical123-cogniflow-app-3471s-projects.vercel.app",
    };

    expect(
      assertVercelDeploymentMetadata(deployment, {
        baseURL: previewUrl,
        linkedProject,
        target: "preview",
      }),
    ).toMatchObject({
      deploymentId: "dpl_ownedPreview123",
      projectId: linkedProject.projectId,
      teamId: linkedProject.orgId,
    });
    expect(
      assertVercelDeploymentMetadata(
        {
          ...deployment,
          alias: ["recallflash.com"],
          id: "dpl_ownedProduction123",
          target: "production",
          url: "cogniflow-production123-cogniflow-app-3471s-projects.vercel.app",
        },
        {
          baseURL: "https://recallflash.com",
          linkedProject,
          target: "production",
        },
      ),
    ).toMatchObject({ deploymentId: "dpl_ownedProduction123", target: "production" });
    for (const lookalike of [
      { ...deployment, projectId: "prj_attackerProject123" },
      { ...deployment, team: { id: "team_attackerTeam123" } },
      { ...deployment, ownerId: "team_attackerTeam123" },
      { ...deployment, alias: [], url: "attacker.vercel.app" },
      { ...deployment, target: "production" },
      { ...deployment, readyState: "BUILDING" },
    ]) {
      expect(() =>
        assertVercelDeploymentMetadata(lookalike, {
          baseURL: previewUrl,
          linkedProject,
          target: "preview",
        }),
      ).toThrow(/linked project\/team and target/u);
    }
  });

  it("uses the authenticated Vercel API before trusting a lookalike deployment host", async () => {
    const apiRequests: Array<{ headers: Headers; url: string }> = [];
    const readMissingFile = async () => {
      const error = new Error("missing") as Error & { code: string };
      error.code = "ENOENT";
      throw error;
    };
    const fetchVercel = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      apiRequests.push({ headers, url });
      return new Response(
        JSON.stringify({
          alias: [previewUrl.slice("https://".length)],
          id: "dpl_ownedPreview123",
          name: "cogniflow",
          ownerId: "team_ownedTeam123",
          project: { id: "prj_ownedProject123", name: "cogniflow" },
          projectId: "prj_ownedProject123",
          readyState: "READY",
          target: null,
          team: { id: "team_ownedTeam123" },
          url: previewUrl.slice("https://".length),
        }),
      );
    };

    await expect(
      authenticateVercelDeploymentOwnership(
        previewUrl,
        "preview",
        {
          VERCEL_AUTOMATION_BYPASS_SECRET: "must-not-leave-for-target-yet",
          VERCEL_ORG_ID: "team_ownedTeam123",
          VERCEL_PROJECT_ID: "prj_ownedProject123",
          VERCEL_TOKEN: "vercel-api-token",
        },
        { fetchImplementation: fetchVercel, readFileImplementation: readMissingFile },
      ),
    ).resolves.toMatchObject({ deploymentId: "dpl_ownedPreview123" });
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0]?.url).toMatch(/^https:\/\/api\.vercel\.com\/v13\/deployments\//u);
    expect(apiRequests[0]?.url).toContain("teamId=team_ownedTeam123");
    expect(apiRequests[0]?.headers.get("authorization")).toBe("Bearer vercel-api-token");
    expect(apiRequests[0]?.headers.get("x-vercel-protection-bypass")).toBeNull();
  });

  it("accepts a CI token without reading local auth and requires a fresh local OAuth session", async () => {
    let localAuthRead = false;
    await expect(
      readVercelAccessToken(
        { VERCEL_TOKEN: "ci-vercel-access-token" },
        {
          readFileImplementation: async () => {
            localAuthRead = true;
            throw new Error("local auth must not be read");
          },
        },
      ),
    ).resolves.toBe("ci-vercel-access-token");
    expect(localAuthRead).toBe(false);

    const nowMilliseconds = 1_800_000_000_000;
    const readFreshLocalAuth = async (path: unknown) => {
      expect(String(path)).toBe("/tmp/vercel-operator/.local/share/com.vercel.cli/auth.json");
      return JSON.stringify({
        expiresAt: Math.floor(nowMilliseconds / 1_000) + 120,
        refreshToken: "local-refresh-token-that-stays-in-the-cli",
        token: "fresh-local-access-token",
      });
    };
    await expect(
      readVercelAccessToken(
        {},
        {
          homeDirectory: "/tmp/vercel-operator",
          nowImplementation: () => nowMilliseconds,
          platform: "linux",
          readFileImplementation: readFreshLocalAuth,
        },
      ),
    ).resolves.toBe("fresh-local-access-token");

    await expect(
      readVercelAccessToken(
        {},
        {
          homeDirectory: "/tmp/vercel-operator",
          nowImplementation: () => nowMilliseconds,
          platform: "linux",
          readFileImplementation: async () =>
            JSON.stringify({
              expiresAt: Math.floor(nowMilliseconds / 1_000),
              refreshToken: "expired-refresh-token",
              token: "expired-access-token",
            }),
        },
      ),
    ).rejects.toThrow(/access token has expired.*immediately before the hosted run/iu);

    for (const invalidSession of [
      { expiresAt: Math.floor(nowMilliseconds / 1_000) + 120, token: "missing-refresh" },
      { refreshToken: "missing-expiry", token: "access-token" },
      { expiresAt: "not-seconds", refreshToken: "refresh-token", token: "access-token" },
    ]) {
      await expect(
        readVercelAccessToken(
          {},
          {
            homeDirectory: "/tmp/vercel-operator",
            nowImplementation: () => nowMilliseconds,
            platform: "linux",
            readFileImplementation: async () => JSON.stringify(invalidSession),
          },
        ),
      ).rejects.toThrow(/invalid OAuth session/u);
    }
  });

  it("selects exactly one existing automation bypass from the authenticated project", () => {
    const project = {
      accountId: ownedDeployment.teamId,
      id: ownedDeployment.projectId,
      name: ownedDeployment.projectName,
      protectionBypass: {
        [automationBypass]: { scope: "automation-bypass" },
        "shareable-link-token-456": { scope: "shareable-link" },
      },
    };
    expect(selectVercelAutomationBypass(project, ownedDeployment)).toBe(automationBypass);

    for (const mismatch of [
      { ...project, accountId: "team_anotherOwner123" },
      { ...project, id: "prj_anotherProject123" },
      { ...project, name: "another-project" },
      { ...project, protectionBypass: null },
    ]) {
      expect(() => selectVercelAutomationBypass(mismatch, ownedDeployment)).toThrow(
        /project bypass inventory does not match/u,
      );
    }
    expect(() => selectVercelAutomationBypass(project, undefined)).toThrow(
      /project bypass inventory does not match/u,
    );

    for (const unsafeInventory of [
      { "shareable-link-token-456": { scope: "shareable-link" } },
      {
        [automationBypass]: { scope: "automation-bypass" },
        "second-automation-bypass-token-456": { scope: "automation-bypass" },
      },
      { "malformed;bypass-token": { scope: "automation-bypass" } },
      {
        [automationBypass]: { scope: "automation-bypass" },
        "malformed;bypass-token": { scope: "automation-bypass" },
      },
    ]) {
      expect(() =>
        selectVercelAutomationBypass(
          { ...project, protectionBypass: unsafeInventory },
          ownedDeployment,
        ),
      ).toThrow(/exactly one existing automation bypass/u);
    }
  });

  it("reads the existing bypass with one fixed-origin GET and permits only a matching override", async () => {
    const requests: Array<{ init: RequestInit | undefined; url: string }> = [];
    const fetchProject = async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ init, url: String(input) });
      return new Response(
        JSON.stringify({
          accountId: ownedDeployment.teamId,
          id: ownedDeployment.projectId,
          name: ownedDeployment.projectName,
          protectionBypass: {
            [automationBypass]: { scope: "automation-bypass" },
          },
        }),
      );
    };

    await expect(
      resolveVercelAutomationBypass(
        ownedDeployment,
        {
          VERCEL_AUTOMATION_BYPASS_SECRET: automationBypass,
          VERCEL_TOKEN: "ci-vercel-access-token",
        },
        { fetchImplementation: fetchProject },
      ),
    ).resolves.toBe(automationBypass);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://api.vercel.com/v9/projects/prj_ownedProject123?teamId=team_ownedTeam123",
    );
    expect(requests[0]?.init).toMatchObject({
      cache: "no-store",
      method: "GET",
      redirect: "error",
    });
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer ci-vercel-access-token");
    expect(headers.get("x-vercel-protection-bypass")).toBeNull();
    expect(requests[0]?.init?.body).toBeUndefined();

    await expect(
      resolveVercelAutomationBypass(
        ownedDeployment,
        {
          VERCEL_AUTOMATION_BYPASS_SECRET: "different-automation-bypass-token-456",
          VERCEL_TOKEN: "ci-vercel-access-token",
        },
        { fetchImplementation: fetchProject },
      ),
    ).rejects.toThrow(/supplied automation bypass does not match/u);
  });

  it.each([
    ["a failed response", () => new Response("forbidden", { status: 403 }), /lookup failed/u],
    ["invalid JSON", () => new Response("{"), /response was invalid/u],
    [
      "an oversized response",
      () => new Response(`{"padding":"${"a".repeat(1_048_576)}"}`),
      /exceeded its size limit/u,
    ],
  ])("rejects %s from the Vercel project lookup", async (_case, response, expected) => {
    await expect(
      resolveVercelAutomationBypass(
        ownedDeployment,
        { VERCEL_TOKEN: "ci-vercel-access-token" },
        { fetchImplementation: async () => response() },
      ),
    ).rejects.toThrow(expected);
  });

  it("does not contact a project-shaped target when ownership authentication fails", async () => {
    let targetRequested = false;
    await expect(
      preflightHostedSmokeTarget(
        { baseURL: previewUrl, target: "preview" },
        { VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret" },
        async () => {
          targetRequested = true;
          return new Response();
        },
        async () => {
          throw new Error("deployment belongs to another project");
        },
      ),
    ).rejects.toThrow(/another project/u);
    expect(targetRequested).toBe(false);
  });

  it("rejects direct-config attestations that are missing, cross-target, or health-only", () => {
    expect(() =>
      assertHostedPreflightAttestation(undefined, {
        baseURL: previewUrl,
        requiresOwnership: true,
        target: "preview",
      }),
    ).toThrow(/guarded runner/u);
    const healthOnly = Buffer.from(
      JSON.stringify({
        baseURL: previewUrl,
        deploymentId: null,
        nonce: "6d0cf9b2-165e-45d4-8d47-3624e42b9084",
        projectId: null,
        target: "preview",
        teamId: null,
        verification: "public-health",
        version: 1,
      }),
    ).toString("base64url");
    expect(() =>
      assertHostedPreflightAttestation(healthOnly, {
        baseURL: previewUrl,
        requiresOwnership: true,
        target: "preview",
      }),
    ).toThrow(/exact deployment target/u);
    expect(() =>
      assertHostedPreflightAttestation(healthOnly, {
        baseURL: "https://recallflash.com",
        requiresOwnership: false,
        target: "production",
      }),
    ).toThrow(/exact deployment target/u);
  });

  it("scopes the derived bypass cookie to the exact host and never installs global headers", async () => {
    expect(
      parseVercelBypassCookie(
        [
          "_vercel_jwt=host-scoped-cookie-value-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=Lax",
        ],
        previewUrl,
      ),
    ).toMatchObject({
      domain: new URL(previewUrl).hostname,
      name: "_vercel_jwt",
      path: "/",
    });
    for (const unsafeCookie of [
      "_vercel_jwt=host-scoped-cookie-value-that-is-safely-long; Domain=.vercel.app; Path=/; Secure; HttpOnly; SameSite=Lax",
      "_vercel_jwt=host-scoped-cookie-value-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=None",
      "attacker_cookie=host-scoped-cookie-value-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]) {
      expect(() => parseVercelBypassCookie([unsafeCookie], previewUrl)).toThrow(
        /invalid or ambiguous/u,
      );
    }

    const scopedMarker = Buffer.from(
      JSON.stringify({
        baseURL: previewUrl,
        bypassCookie: {
          domain: new URL(previewUrl).hostname,
          expires: -1,
          httpOnly: true,
          name: "_vercel_jwt",
          path: "/",
          sameSite: "Lax",
          secure: true,
          value: "host-scoped-cookie-value-that-is-safely-long",
        },
        deploymentId: "dpl_ownedPreview123",
        nonce: "6d0cf9b2-165e-45d4-8d47-3624e42b9084",
        projectId: "prj_ownedProject123",
        target: "preview",
        teamId: "team_ownedTeam123",
        verification: "vercel-api",
        version: 1,
      }),
    ).toString("base64url");
    const scoped = assertHostedPreflightAttestation(scopedMarker, {
      baseURL: previewUrl,
      requiresOwnership: true,
      target: "preview",
    });
    expect(scoped.storageState?.cookies[0]?.domain).toBe(new URL(previewUrl).hostname);
    expect(scoped.storageState?.cookies[0]?.domain).not.toBe("assets.attacker.example");

    const configurationSources = await Promise.all([
      readFile(new URL("../playwright.hosted.config.ts", import.meta.url), "utf8"),
      readFile(new URL("../playwright.hosted-content.config.ts", import.meta.url), "utf8"),
    ]);
    for (const source of configurationSources) {
      expect(source).not.toContain("extraHTTPHeaders");
      expect(source).not.toContain("x-vercel-protection-bypass");
      expect(source).not.toContain("x-vercel-set-bypass-cookie");
      expect(source).not.toContain("requiresOwnership: false");
      expect(source).toContain("requiresOwnership: true");
      expect(source).toContain("readHostedPreflightFile");
      expect(source).not.toMatch(/delete process\.env\.HOSTED_(?:SMOKE|CONTENT)_PREFLIGHT_FILE/u);
    }

    const contentSpec = await readFile(
      new URL("../e2e/hosted-content.spec.ts", import.meta.url),
      "utf8",
    );
    expect(contentSpec).not.toContain("HOSTED_CONTENT_PREFLIGHT");
    expect(contentSpec).not.toContain("_vercel_jwt");
    expect(contentSpec).not.toContain("assertHostedPreflightAttestation");
    expect(contentSpec).not.toContain("HOSTED_PREVIEW_SUPABASE_SECRET_KEY");

    const runnerSources = await Promise.all([
      readFile(new URL("../scripts/run-hosted-smoke.mjs", import.meta.url), "utf8"),
      readFile(new URL("../scripts/run-hosted-content-acceptance.mjs", import.meta.url), "utf8"),
    ]);
    for (const source of runnerSources) {
      expect(source).toContain("createHostedPlaywrightEnvironment");
      expect(source).toContain("createHostedPreflightFile");
      expect(source).not.toMatch(/HOSTED_(?:SMOKE|CONTENT)_PREFLIGHT:/u);
    }
  });
});
