// @vitest-environment node

import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  assertPreviewHealthProjection,
  createHostedContentSignalController,
  createHostedAcceptanceCleanupSql,
  createHostedAcceptanceIdentity,
  createHostedAcceptancePassword,
  createOnceAsync,
  parsePreviewSecretKey,
  preflightHostedContentTarget,
  provisionHostedAcceptanceFixture,
  resolveHostedContentBaseUrl,
  runHostedContentAcceptance,
} from "../scripts/run-hosted-content-acceptance.mjs";
import { assertHostedPreflightAttestation } from "../scripts/vercel-deployment-ownership.mjs";

const runId = "6d0cf9b2-165e-45d4-8d47-3624e42b9084";

function syntheticModernSecretKey(label: string): string {
  return ["sb", "secret", `${label}_key_that_is_long_enough`].join("_");
}

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
    expect(createHostedAcceptancePassword(runId)).toBe(
      "Preview-only-6d0cf9b2165e45d48d473624e42b9084-Pass!",
    );
    expect(() => createHostedAcceptanceIdentity("'; drop table auth.users; --")).toThrow(/UUIDv4/u);
    expect(() => createHostedAcceptancePassword("not-a-run-id")).toThrow(/UUIDv4/u);
  });

  it("selects a server key without echoing it into an error", () => {
    const serverKey = syntheticModernSecretKey("server");
    expect(
      parsePreviewSecretKey(
        JSON.stringify({
          keys: [
            { api_key: "sb_publishable_public_key", name: "default", type: "publishable" },
            { api_key: serverKey, name: "default", type: "secret" },
          ],
          message: "",
        }),
      ),
    ).toBe(serverKey);
    expect(() => parsePreviewSecretKey("not-json")).toThrow(/invalid API-key inventory/u);
    expect(() =>
      parsePreviewSecretKey(
        JSON.stringify({
          keys: [
            {
              api_key: "legacy-service-role-jwt-that-is-long-enough",
              name: "service_role",
              type: "legacy",
            },
          ],
        }),
      ),
    ).toThrow(/server key is unavailable/u);
    expect(() =>
      parsePreviewSecretKey(
        JSON.stringify({
          keys: [
            { api_key: serverKey, name: "first", type: "secret" },
            { api_key: syntheticModernSecretKey("second"), name: "second", type: "secret" },
          ],
        }),
      ),
    ).toThrow(/server key is unavailable/u);
  });

  it("uses only the established deletion transactions for fixture cleanup", () => {
    const sql = createHostedAcceptanceCleanupSql(runId);
    expect(sql).toContain("public.admin_reject_provisional_account");
    expect(sql).toContain("public.admin_request_account_deletion");
    expect(sql).toContain("public.admin_process_account_deletion");
    expect(sql).toContain("lumen_hosted_acceptance");
    expect(sql).toContain("requested_at = pg_catalog.now() - interval '2 seconds'");
    expect(sql).toContain("execute_after = pg_catalog.now() - interval '1 second'");
    expect(sql).toContain("deck.title <> 'Deleted deck ' || pg_catalog.left(deck.id::text, 8)");
    expect(sql).not.toContain("deck.title <> 'Deleted deck'\n");
    expect(sql).not.toMatch(/truncate|drop table|delete\s+from\s+public\.decks/iu);
  });

  it("provisions only the exact reserved fixture from the parent process", async () => {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = [];
    await provisionHostedAcceptanceFixture(runId, "preview-server-key-that-is-long-enough", {
      fetchImplementation: async (input, init) => {
        const url = String(input);
        requests.push({
          body: init?.body,
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url,
        });
        return new Response(
          JSON.stringify({
            email: createHostedAcceptanceIdentity(runId).email,
            id: "41000000-0000-4000-8000-000000000001",
            user_metadata: { lumen_hosted_acceptance: runId },
          }),
          { status: 201 },
        );
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://cfwddajyjbueggpzfomh.supabase.co/auth/v1/admin/users");
    expect(requests[0]?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      email: createHostedAcceptanceIdentity(runId).email,
      email_confirm: true,
      password: createHostedAcceptancePassword(runId),
      user_metadata: { lumen_hosted_acceptance: runId },
    });
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer preview-server-key-that-is-long-enough",
    );
  });

  it("rejects a mismatched Admin Auth provisioning response without exposing the key", async () => {
    const secretKey = "preview-server-key-that-must-not-appear";
    await expect(
      provisionHostedAcceptanceFixture(runId, secretKey, {
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              email: "different-fixture@example.test",
              id: "41000000-0000-4000-8000-000000000001",
              user_metadata: { lumen_hosted_acceptance: runId },
            }),
            { status: 201 },
          ),
      }),
    ).rejects.toThrow("Preview Auth returned an unexpected fixture identity.");

    try {
      await provisionHostedAcceptanceFixture(runId, secretKey, {
        fetchImplementation: async () => new Response("provider details", { status: 400 }),
      });
    } catch (error) {
      expect(String(error)).not.toContain(secretKey);
      expect(String(error)).not.toContain("provider details");
    }
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
    const events: string[] = [];
    const sandboxCleanup = vi.fn();
    let command = 0;

    const result = runHostedContentAcceptance(
      ["--url", previewUrl],
      {},
      {
        cleanupImplementation: cleanup,
        createChildEnvironmentImplementation: (_environment, additionsFactory) => {
          const additions = additionsFactory({
            sandboxRoot: "/private/browser-runtime",
            temporaryDirectory: "/private/browser-runtime/tmp",
          });
          expect(additions).not.toHaveProperty("HOSTED_PREVIEW_SUPABASE_SECRET_KEY");
          expect(additions).not.toHaveProperty("HOSTED_PREVIEW_SUPABASE_URL");
          expect(additions.HOSTED_CONTENT_PREFLIGHT_FILE).toBe("/private/preflight");
          return {
            cleanup: sandboxCleanup,
            environment: { PATH: "/usr/bin" },
            fixtureConfirmationFile: "/private/fixture-confirmed",
          };
        },
        createPreflightFileImplementation: (_preflight, temporaryDirectory) => {
          expect(temporaryDirectory).toBe("/private/browser-runtime/tmp");
          return "/private/preflight";
        },
        destroyPreflightFileImplementation: destroyPreflight,
        preflightImplementation: async () => "cHJlZmxpZ2h0",
        processImplementation: processLike,
        provisionFixtureImplementation: async () => {
          events.push("provision");
        },
        randomUUIDImplementation: () => runId,
        runCommandImplementation: async (_executable, _arguments, options) => {
          command += 1;
          if (command === 1) {
            return {
              code: 0,
              stdout: JSON.stringify([
                { api_key: syntheticModernSecretKey("preview"), type: "secret" },
              ]),
            };
          }
          events.push("playwright");
          const child = { kill: vi.fn() };
          const stopTracking = options.signalController.trackChild(child);
          processLike.emit("SIGINT");
          expect(child.kill).toHaveBeenCalledWith("SIGINT");
          stopTracking();
          throw new Error("Playwright stopped");
        },
        writeFileImplementation: async () => {
          events.push("marker");
        },
      },
    );

    await expect(result).rejects.toMatchObject({ exitCode: 130, signal: "SIGINT" });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(events).toEqual(["provision", "marker", "playwright"]);
    expect(sandboxCleanup).toHaveBeenCalledOnce();
    expect(destroyPreflight).toHaveBeenCalledOnce();
    expect(processLike.listenerCount("SIGINT")).toBe(0);
    expect(processLike.listenerCount("SIGTERM")).toBe(0);
  });

  it("cleans a possibly-created fixture when Admin Auth provisioning fails", async () => {
    const processLike = Object.assign(new EventEmitter(), {
      stdout: { write: vi.fn() },
    });
    const cleanup = vi.fn(async () => undefined);
    const runCommand = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify([{ api_key: syntheticModernSecretKey("preview"), type: "secret" }]),
    }));

    await expect(
      runHostedContentAcceptance(
        ["--url", previewUrl],
        {},
        {
          cleanupImplementation: cleanup,
          createChildEnvironmentImplementation: (_environment, additionsFactory) => {
            additionsFactory({
              sandboxRoot: "/private/browser-runtime",
              temporaryDirectory: "/private/browser-runtime/tmp",
            });
            return {
              cleanup: vi.fn(),
              environment: { PATH: "/usr/bin" },
              fixtureConfirmationFile: "/private/fixture-confirmed",
            };
          },
          createPreflightFileImplementation: () => "/private/preflight",
          destroyPreflightFileImplementation: vi.fn(),
          preflightImplementation: async () => "cHJlZmxpZ2h0",
          processImplementation: processLike,
          provisionFixtureImplementation: async () => {
            throw new Error("Admin Auth unavailable");
          },
          randomUUIDImplementation: () => runId,
          runCommandImplementation: runCommand,
        },
      ),
    ).rejects.toThrow("Admin Auth unavailable");

    expect(runCommand).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
