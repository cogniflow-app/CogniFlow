import { afterEach, describe, expect, it, vi } from "vitest";

import { getParentalConsentVerifier } from "../lib/server/parental-consent";

describe("local parental-consent adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function configureExternalVerifier() {
    const environment = {
      APP_ENCRYPTION_KEY: "app-encryption-key-with-sufficient-length",
      DATABASE_URL: "postgresql://user:password@db.example.test:5432/postgres",
      DEPLOYMENT_PROFILE: "cloudflare",
      ENABLE_CHILD_PROFILES: "true",
      GUEST_TOKEN_SIGNING_KEY: "guest-signing-key-with-sufficient-length",
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      NODE_ENV: "test",
      PARENTAL_CONSENT_MODE: "external_verified",
      PARENTAL_CONSENT_VERIFIER_API_KEY: "external-consent-verifier-test-key",
      PARENTAL_CONSENT_VERIFIER_URL: "https://consent.example.test/v1/verify",
      SUPABASE_SECRET_KEY: "server-secret-key-with-sufficient-length",
    } as const;

    for (const [name, value] of Object.entries(environment)) {
      vi.stubEnv(name, value);
    }
  }

  it("creates explicitly labelled deterministic test evidence without child contact data", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEPLOYMENT_PROFILE", "test");
    vi.stubEnv("ENABLE_CHILD_PROFILES", "true");
    vi.stubEnv("PARENTAL_CONSENT_MODE", "test_only");
    const verifier = getParentalConsentVerifier();
    const input = {
      accountId: "11111111-1111-4111-8111-111111111111",
      learnerAgeBand: "under_13",
    } as const;

    const first = await verifier.verify(input);
    const second = await verifier.verify(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      method: "local_test",
      policyVersion: "privacy-2026-07-phase-01",
      scope: { analytics: "minimized", public_content: false },
    });
    expect(first.evidenceReference).toMatch(/^local-test:[a-f0-9]{40}$/u);
    expect(JSON.stringify(first)).not.toContain("email");
  });

  it("sends a pseudonymous bounded external request and accepts verified evidence", async () => {
    configureExternalVerifier();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ evidenceReference: "provider-proof-123", verified: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getParentalConsentVerifier().verify({
      accountId: "11111111-1111-4111-8111-111111111111",
      learnerAgeBand: "under_13",
    });

    expect(result).toMatchObject({
      evidenceReference: "provider-proof-123",
      method: "verified_external",
      scope: { analytics: "minimized", public_content: false },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://consent.example.test/v1/verify");
    expect(request).toMatchObject({ method: "POST" });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const requestBody = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      learnerAgeBand: "under_13",
      policyVersion: "privacy-2026-07-phase-01",
      requestedScopes: ["learner_profile"],
    });
    expect(requestBody.subjectHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(String(request.body)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("maps transport failures to an unavailable result", async () => {
    configureExternalVerifier();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await expect(
      getParentalConsentVerifier().verify({
        accountId: "11111111-1111-4111-8111-111111111111",
        learnerAgeBand: "teen",
      }),
    ).rejects.toThrow("EXTERNAL_CONSENT_VERIFIER_UNAVAILABLE");
  });

  it.each([
    ["provider rejection", new Response("denied", { status: 403 })],
    ["oversized response", new Response("x".repeat(8_193), { status: 200 })],
    ["invalid JSON", new Response("not-json", { status: 200 })],
    ["unverified payload", Response.json({ evidenceReference: "provider-proof-123" })],
    ["invalid evidence reference", Response.json({ evidenceReference: "short", verified: true })],
  ])("rejects %s without creating trusted evidence", async (_case, response) => {
    configureExternalVerifier();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      getParentalConsentVerifier().verify({
        accountId: "11111111-1111-4111-8111-111111111111",
        learnerAgeBand: "under_13",
      }),
    ).rejects.toThrow("EXTERNAL_CONSENT_NOT_VERIFIED");
  });
});
