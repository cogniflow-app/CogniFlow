// @vitest-environment node

import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  assertPreviewHealthProjection,
  confirmHostedAcceptanceFixture,
  createHostedContentSignalController,
  createHostedAcceptanceCleanupSql,
  createHostedAcceptanceIdentity,
  createOnceAsync,
  parsePreviewSecretKey,
  preflightHostedContentTarget,
  resolveHostedContentBaseUrl,
  runHostedContentAcceptance,
} from "../scripts/run-hosted-content-acceptance.mjs";
import { assertHostedPreflightAttestation } from "../scripts/vercel-deployment-ownership.mjs";

const runId = "6d0cf9b2-165e-45d4-8d47-3624e42b9084";

describe("hosted content acceptance guard", () => {
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

  it("accepts only this project's Preview-shaped hosts and explicitly rejects Production", () => {
    expect(resolveHostedContentBaseUrl(["--url", previewUrl], {})).toBe(previewUrl);
    expect(() => resolveHostedContentBaseUrl(["--url", "https://recallflash.com"], {})).toThrow(
      /never target a Production alias/u,
    );
    expect(() =>
      resolveHostedContentBaseUrl(["--url", "https://cogniflow-pearl.vercel.app"], {}),
    ).toThrow(/never target a Production alias/u);
    expect(() => resolveHostedContentBaseUrl(["--url", "https://attacker.vercel.app"], {})).toThrow(
      /restricted/u,
    );
    expect(() => resolveHostedContentBaseUrl(["--url"], {})).toThrow(/requires a value/u);
  });

  it("requires Preview runtime and exact Preview data-plane identity", () => {
    const health = {
      buildVersion: "abc123",
      deploymentProfile: "vercel_beta",
      provider: "vercel",
      status: "ok",
      supabaseProjectRef: "cfwddajyjbueggpzfomh",
      vercelEnvironment: "preview",
    };
    expect(() => assertPreviewHealthProjection(health)).not.toThrow();
    expect(() =>
      assertPreviewHealthProjection({ ...health, vercelEnvironment: "production" }),
    ).toThrow(/fixed Preview Supabase project/u);
    expect(() =>
      assertPreviewHealthProjection({ ...health, supabaseProjectRef: "qccbaynfvtyxigiikpmq" }),
    ).toThrow(/fixed Preview Supabase project/u);
  });

  it("sends the optional protection bypass only after authenticated deployment ownership", async () => {
    const events: string[] = [];
    const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`${previewUrl}/api/health`);
      const headers = new Headers(init?.headers);
      if (events.at(-1) === "bypass") {
        events.push("cookie-bootstrap");
        expect(headers.get("x-vercel-protection-bypass")).toBe("operator-secret");
        expect(headers.get("x-vercel-set-bypass-cookie")).toBe("true");
        return new Response(null, {
          headers: {
            Location: `${previewUrl}/api/health`,
            "Set-Cookie":
              "_vercel_jwt=content-cookie-value-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=Lax",
          },
          status: 307,
        });
      }
      events.push("cookie-health");
      expect(headers.get("x-vercel-protection-bypass")).toBeNull();
      expect(headers.get("cookie")).toBe("_vercel_jwt=content-cookie-value-that-is-safely-long");
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

    const preflight = await preflightHostedContentTarget(
      previewUrl,
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
    expect(
      assertHostedPreflightAttestation(preflight, {
        baseURL: previewUrl,
        requiresOwnership: true,
        target: "preview",
      }).storageState?.cookies,
    ).toEqual([
      expect.objectContaining({
        domain: new URL(previewUrl).hostname,
        name: "_vercel_jwt",
        path: "/",
      }),
    ]);
  });

  it("resolves the existing project bypass when no operator override is supplied", async () => {
    const events: string[] = [];
    const preflight = await preflightHostedContentTarget(
      previewUrl,
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
                "_vercel_jwt=resolved-content-cookie-that-is-safely-long; Path=/; Secure; HttpOnly; SameSite=Lax",
            },
            status: 307,
          });
        }
        events.push("cookie-health");
        expect(headers.get("x-vercel-protection-bypass")).toBeNull();
        expect(headers.get("cookie")).toBe(
          "_vercel_jwt=resolved-content-cookie-that-is-safely-long",
        );
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

  it("rejects Production before any protected health request", async () => {
    let requested = false;
    const fetchMock = async () => {
      requested = true;
      return new Response();
    };

    await expect(
      preflightHostedContentTarget(
        "https://recallflash.com",
        { VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret" },
        fetchMock,
        async () => {
          throw new Error("ownership lookup must not run");
        },
      ),
    ).rejects.toThrow(/never target a Production alias/u);
    expect(requested).toBe(false);
  });

  it("does not send the bypass to a project-shaped lookalike when Vercel rejects ownership", async () => {
    let requested = false;
    await expect(
      preflightHostedContentTarget(
        previewUrl,
        { VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret" },
        async () => {
          requested = true;
          return new Response();
        },
        async () => {
          throw new Error("deployment project/team mismatch");
        },
      ),
    ).rejects.toThrow(/project\/team mismatch/u);
    expect(requested).toBe(false);
  });

  it("builds a reserved, non-personal fixture identity from a UUIDv4", () => {
    expect(createHostedAcceptanceIdentity(runId)).toEqual({
      email: "phase02-preview-6d0cf9b2165e45d48d473624e42b9084@example.test",
      runId,
    });
    expect(() => createHostedAcceptanceIdentity("'; drop table auth.users; --")).toThrow(/UUIDv4/u);
  });

  it("selects a server key without echoing it into an error", () => {
    expect(
      parsePreviewSecretKey(
        JSON.stringify([
          { api_key: "public-key-that-is-long-enough", name: "default", type: "publishable" },
          { api_key: "server-key-that-is-long-enough", name: "default", type: "secret" },
        ]),
      ),
    ).toBe("server-key-that-is-long-enough");
    expect(() => parsePreviewSecretKey("not-json")).toThrow(/invalid API-key inventory/u);
  });

  it("uses only the established deletion transactions for fixture cleanup", () => {
    const sql = createHostedAcceptanceCleanupSql(runId);
    expect(sql).toContain("public.admin_reject_provisional_account");
    expect(sql).toContain("public.admin_request_account_deletion");
    expect(sql).toContain("public.admin_process_account_deletion");
    expect(sql).toContain("lumen_hosted_acceptance");
    expect(sql).toContain("deck.title <> 'Deleted deck ' || pg_catalog.left(deck.id::text, 8)");
    expect(sql).not.toContain("deck.title <> 'Deleted deck'\n");
    expect(sql).not.toMatch(/truncate|drop table|delete\s+from\s+public\.decks/iu);
  });

  it("confirms only the exact reserved fixture from the parent process", async () => {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = [];
    let inventoryRead = 0;
    await confirmHostedAcceptanceFixture(runId, "preview-server-key-that-is-long-enough", {
      fetchImplementation: async (input, init) => {
        const url = String(input);
        requests.push({
          body: init?.body,
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url,
        });
        if (init?.method === "PUT") return new Response("{}", { status: 200 });
        inventoryRead += 1;
        return new Response(
          JSON.stringify({
            users:
              inventoryRead === 1
                ? [{ email: "another-user@example.test", id: crypto.randomUUID() }]
                : [
                    {
                      email: createHostedAcceptanceIdentity(runId).email,
                      id: "41000000-0000-4000-8000-000000000001",
                    },
                  ],
          }),
        );
      },
      nowImplementation: () => 1_800_000_000_000,
      waitImplementation: async () => undefined,
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]?.url).toBe(
      "https://cfwddajyjbueggpzfomh.supabase.co/auth/v1/admin/users?page=1&per_page=100",
    );
    expect(requests[2]?.url).toBe(
      "https://cfwddajyjbueggpzfomh.supabase.co/auth/v1/admin/users/41000000-0000-4000-8000-000000000001",
    );
    expect(requests[2]?.method).toBe("PUT");
    expect(JSON.parse(String(requests[2]?.body))).toEqual({
      email_confirm: true,
      user_metadata: { lumen_hosted_acceptance: runId },
    });
    expect(requests[2]?.headers.get("authorization")).toBe(
      "Bearer preview-server-key-that-is-long-enough",
    );
  });

  it("forwards only the first termination signal and never interrupts cleanup", () => {
    const processLike = new EventEmitter();
    const controller = createHostedContentSignalController(processLike);
    const child = { kill: vi.fn() };
    controller.install();
    const stopTracking = controller.trackChild(child);
    processLike.emit("SIGINT");
    processLike.emit("SIGTERM");
    expect(controller.requestedSignal).toBe("SIGINT");
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    stopTracking();
    controller.dispose();
    expect(processLike.listenerCount("SIGINT")).toBe(0);
    expect(processLike.listenerCount("SIGTERM")).toBe(0);

    const cleanupController = createHostedContentSignalController(processLike);
    const cleanupChild = { kill: vi.fn() };
    cleanupController.install();
    cleanupController.trackChild(cleanupChild);
    cleanupController.beginCleanup();
    processLike.emit("SIGTERM");
    expect(cleanupController.requestedSignal).toBe("SIGTERM");
    expect(cleanupChild.kill).not.toHaveBeenCalled();
    cleanupController.dispose();
  });

  it("deduplicates concurrent cleanup requests", async () => {
    const operation = vi.fn(async () => "cleaned");
    const once = createOnceAsync(operation);
    await expect(Promise.all([once(), once(), once()])).resolves.toEqual([
      "cleaned",
      "cleaned",
      "cleaned",
    ]);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("attempts fixture cleanup exactly once after a signaled Playwright failure", async () => {
    const processLike = Object.assign(new EventEmitter(), {
      stdout: { write: vi.fn() },
    });
    const cleanup = vi.fn(async () => undefined);
    const destroyPreflight = vi.fn();
    const sandboxCleanup = vi.fn();
    let command = 0;

    const result = runHostedContentAcceptance(
      ["--url", previewUrl],
      {},
      {
        cleanupImplementation: cleanup,
        confirmFixtureImplementation: async () => undefined,
        createChildEnvironmentImplementation: (_environment, additions) => {
          expect(additions).not.toHaveProperty("HOSTED_PREVIEW_SUPABASE_SECRET_KEY");
          expect(additions).not.toHaveProperty("HOSTED_PREVIEW_SUPABASE_URL");
          return {
            cleanup: sandboxCleanup,
            environment: { PATH: "/usr/bin" },
            fixtureConfirmationFile: "/private/fixture-confirmed",
          };
        },
        createPreflightFileImplementation: () => "/private/preflight",
        destroyPreflightFileImplementation: destroyPreflight,
        preflightImplementation: async () => "cHJlZmxpZ2h0",
        processImplementation: processLike,
        randomUUIDImplementation: () => runId,
        runCommandImplementation: async (_executable, _arguments, options) => {
          command += 1;
          if (command === 1) {
            return {
              code: 0,
              stdout: JSON.stringify([
                { api_key: "preview-server-key-that-is-long-enough", type: "secret" },
              ]),
            };
          }
          const child = { kill: vi.fn() };
          const stopTracking = options.signalController.trackChild(child);
          processLike.emit("SIGINT");
          expect(child.kill).toHaveBeenCalledWith("SIGINT");
          stopTracking();
          throw new Error("Playwright stopped");
        },
        writeFileImplementation: async () => undefined,
      },
    );

    await expect(result).rejects.toMatchObject({ exitCode: 130, signal: "SIGINT" });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(sandboxCleanup).toHaveBeenCalledOnce();
    expect(destroyPreflight).toHaveBeenCalledOnce();
    expect(processLike.listenerCount("SIGINT")).toBe(0);
    expect(processLike.listenerCount("SIGTERM")).toBe(0);
  });
});
