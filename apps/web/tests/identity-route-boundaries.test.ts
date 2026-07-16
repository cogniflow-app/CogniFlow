// @vitest-environment node

import { createEnvironmentFixture } from "@lumen/test-utils";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pendingAuthAgeGateCookieName,
  pendingRecoveryIntentCookieName,
} from "../lib/server/cookies";

const mocks = vi.hoisted(() => ({
  applyDeviceCookie: vi.fn((response: unknown) => response),
  createNextRouteDatabaseContext: vi.fn(),
  createPrivilegedDatabaseClient: vi.fn(),
  deviceMaybeSingle: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  privilegedFrom: vi.fn(),
  privilegedRpc: vi.fn(),
  registerRequestDevice: vi.fn(),
  requireRequestRateLimit: vi.fn(),
  routeFrom: vi.fn(),
  routeRpc: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@lumen/database/server", () => ({
  createPrivilegedDatabaseClient: mocks.createPrivilegedDatabaseClient,
}));

vi.mock("@/lib/server/device", () => ({
  applyDeviceCookie: mocks.applyDeviceCookie,
  registerRequestDevice: mocks.registerRequestDevice,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  requireRequestRateLimit: mocks.requireRequestRateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createNextRouteDatabaseContext: mocks.createNextRouteDatabaseContext,
}));

import { POST as passwordPost } from "../app/api/auth/password/route";
import { POST as emailLinkPost } from "../app/api/auth/email-link/route";
import { POST as oauthPost } from "../app/api/auth/oauth/route";
import { POST as learnerPost } from "../app/api/settings/learners/route";
import { PATCH as profilePatch } from "../app/api/settings/profile/route";

function mutationRequest(
  pathname: string,
  body: unknown,
  origin = "http://127.0.0.1:3100",
): NextRequest {
  return new NextRequest(`http://127.0.0.1:3100${pathname}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "Sec-Fetch-Site": origin === "http://127.0.0.1:3100" ? "same-origin" : "cross-site",
    },
    method: "POST",
  });
}

function stubEnvironment(overrides: Readonly<Record<string, string>> = {}) {
  for (const [name, value] of Object.entries(
    createEnvironmentFixture({
      AUTH_OAUTH_AZURE_ENABLED: "false",
      AUTH_OAUTH_GITHUB_ENABLED: "false",
      AUTH_OAUTH_GOOGLE_ENABLED: "false",
      ENABLE_CHILD_PROFILES: "false",
      PARENTAL_CONSENT_MODE: "disabled",
      ...overrides,
    }),
  )) {
    vi.stubEnv(name, value);
  }
  vi.stubEnv("VERCEL", overrides.VERCEL ?? "");
}

describe("identity route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEnvironment();
    const deviceQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: mocks.deviceMaybeSingle,
      select: vi.fn(),
    };
    deviceQuery.select.mockReturnValue(deviceQuery);
    deviceQuery.eq.mockReturnValue(deviceQuery);
    deviceQuery.is.mockReturnValue(deviceQuery);
    mocks.createNextRouteDatabaseContext.mockReturnValue({
      applyCookies: (response: unknown) => response,
      client: {
        auth: {
          getClaims: mocks.getClaims,
          getUser: mocks.getUser,
          signInWithOAuth: mocks.signInWithOAuth,
          signInWithOtp: mocks.signInWithOtp,
          signInWithPassword: mocks.signInWithPassword,
          signOut: mocks.signOut,
          signUp: mocks.signUp,
          resetPasswordForEmail: mocks.resetPasswordForEmail,
        },
        from: mocks.routeFrom,
        rpc: mocks.routeRpc,
      },
    });
    mocks.createPrivilegedDatabaseClient.mockReturnValue({
      from: mocks.privilegedFrom,
      rpc: mocks.privilegedRpc,
    });
    mocks.privilegedFrom.mockReturnValue(deviceQuery);
    mocks.deviceMaybeSingle.mockResolvedValue({
      data: { id: "22222222-2222-4222-8222-222222222222" },
      error: null,
    });
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          session_id: "44444444-4444-4444-8444-444444444444",
          sub: "11111111-1111-4111-8111-111111111111",
        },
      },
      error: null,
    });
    mocks.requireRequestRateLimit.mockResolvedValue(undefined);
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.registerRequestDevice.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mocks.routeRpc.mockResolvedValue({
      data: "11111111-1111-4111-8111-111111111111",
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes an under-13 signup neutrally without contacting Auth, rate limits, or storage", async () => {
    const response = await passwordPost(
      mutationRequest("/api/auth/password", {
        ageBand: "under_13",
        email: "child-address-must-not-be-used@example.test",
        intent: "sign_up",
        password: "local-test-password-only",
        returnTo: "/app",
      }),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ next: "/auth/guardian-required", status: "guardian_required" });
    expect(JSON.stringify(body)).not.toContain("child-address-must-not-be-used@example.test");
    expect(mocks.requireRequestRateLimit).not.toHaveBeenCalled();
    expect(mocks.createNextRouteDatabaseContext).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin password mutation before any account service runs", async () => {
    const response = await passwordPost(
      mutationRequest(
        "/api/auth/password",
        {
          email: "adult@example.test",
          intent: "sign_in",
          password: "not-sent-to-auth",
          returnTo: "/app",
        },
        "https://attacker.example",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.requireRequestRateLimit).not.toHaveBeenCalled();
    expect(mocks.createNextRouteDatabaseContext).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "/app"],
    ["/app/library?view=list", "/app/library?view=list"],
    ["/auth/sign-in", "/app"],
    ["https://attacker.example/steal", "/app"],
  ])("finishes password sign-in at the safe destination %s", async (returnTo, expected) => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: "server-applied-session" },
        user: { email: "learner@example.test", id: accountId },
      },
      error: null,
    });
    mocks.privilegedRpc
      .mockResolvedValueOnce({
        data: [{ onboarding_completed_at: "2026-07-01T00:05:00Z", profile_exists: true }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await passwordPost(
      mutationRequest("/api/auth/password", {
        email: "learner@example.test",
        intent: "sign_in",
        password: "correct horse battery staple",
        ...(returnTo === undefined ? {} : { returnTo }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ next: expected, status: "authenticated" });
    expect(mocks.registerRequestDevice).toHaveBeenCalledWith(
      expect.any(NextRequest),
      accountId,
      expect.anything(),
    );
  });

  it("binds an eligible password signup to an HttpOnly callback age gate", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    const response = await passwordPost(
      mutationRequest("/api/auth/password", {
        ageBand: "teen",
        email: "teen@example.test",
        intent: "sign_up",
        password: "correct horse battery staple",
        returnTo: "/app/today",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "verification_required" });
    expect(response.cookies.get(pendingAuthAgeGateCookieName)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
    });
    const options = mocks.signUp.mock.calls[0]?.[0]?.options as
      { emailRedirectTo?: string } | undefined;
    const callback = new URL(options?.emailRedirectTo ?? "");
    expect(callback.origin).toBe("http://127.0.0.1:3100");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("authFlow")).toBe("password_signup");
    expect(callback.searchParams.get("ageGate")).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
  });

  it("rejects an unconfigured OAuth provider before opening a provider session", async () => {
    const response = await oauthPost(
      mutationRequest("/api/auth/oauth", {
        intent: "sign_in",
        provider: "google",
        returnTo: "/app",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createNextRouteDatabaseContext).not.toHaveBeenCalled();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("routes an under-13 OAuth signup neutrally before provider configuration or Auth", async () => {
    const response = await oauthPost(
      mutationRequest("/api/auth/oauth", {
        ageBand: "under_13",
        intent: "sign_up",
        provider: "google",
        returnTo: "/app",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      next: "/auth/guardian-required",
      status: "guardian_required",
    });
    expect(mocks.createNextRouteDatabaseContext).not.toHaveBeenCalled();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("returns the same neutral email-link result when an account is missing or accepted", async () => {
    mocks.signInWithOtp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: {
        code: "user_not_found",
        message: "private-address@example.test is not registered",
        status: 400,
      },
    });
    const missingResponse = await emailLinkPost(
      mutationRequest("/api/auth/email-link", {
        email: "private-address@example.test",
        intent: "magic_link",
        returnTo: "/app",
      }),
    );
    const missingBody: unknown = await missingResponse.json();

    mocks.signInWithOtp.mockResolvedValueOnce({ data: {}, error: null });
    const acceptedResponse = await emailLinkPost(
      mutationRequest("/api/auth/email-link", {
        email: "registered@example.test",
        intent: "magic_link",
        returnTo: "/app",
      }),
    );
    const acceptedBody: unknown = await acceptedResponse.json();

    expect(missingResponse.status).toBe(200);
    expect(acceptedResponse.status).toBe(200);
    expect(missingBody).toEqual(acceptedBody);
    expect(JSON.stringify(missingBody)).not.toContain("private-address@example.test");
    expect(missingBody).toMatchObject({
      message: expect.stringMatching(/if that address can use this flow/i),
      status: "email_sent",
    });
    for (const call of mocks.signInWithOtp.mock.calls) {
      const callback = new URL(call[0]?.options?.emailRedirectTo as string);
      expect(callback.origin).toBe("http://127.0.0.1:3100");
      expect(callback.pathname).toBe("/auth/callback");
    }
  });

  it("binds a recovery email callback to an HttpOnly pending state", async () => {
    const response = await emailLinkPost(
      mutationRequest("/api/auth/email-link", {
        email: "recovery@example.test",
        intent: "forgot_password",
        returnTo: "/app/settings/security",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(pendingRecoveryIntentCookieName)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
    });
    const callback = new URL(mocks.resetPasswordForEmail.mock.calls[0]?.[1]?.redirectTo as string);
    expect(callback.origin).toBe("http://127.0.0.1:3100");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("intent")).toBe("recovery");
    expect(callback.searchParams.get("recoveryState")).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
  });

  it("maps configured Microsoft sign-in to Azure and normalizes an unsafe return URL", async () => {
    stubEnvironment({ AUTH_OAUTH_AZURE_ENABLED: "true" });
    mocks.signInWithOAuth.mockResolvedValue({
      data: { provider: "azure", url: "https://identity.example.test/authorize" },
      error: null,
    });

    const response = await oauthPost(
      mutationRequest("/api/auth/oauth", {
        intent: "sign_in",
        provider: "microsoft",
        returnTo: "https://attacker.example/steal",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      next: "https://identity.example.test/authorize",
      status: "provider_redirect",
    });
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ scopes: "email", skipBrowserRedirect: true }),
        provider: "azure",
      }),
    );
    const options = mocks.signInWithOAuth.mock.calls[0]?.[0]?.options as
      { redirectTo?: string } | undefined;
    const callback = new URL(options?.redirectTo ?? "");
    expect(callback.origin).toBe("http://127.0.0.1:3100");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("returnTo")).toBe("/app");
    expect(callback.searchParams.get("authFlow")).toBe("oauth");
    expect(callback.searchParams.get("provider")).toBe("microsoft");
    expect(callback.searchParams.get("ageGate")).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    expect(response.cookies.get(pendingAuthAgeGateCookieName)).toMatchObject({ httpOnly: true });
  });

  it("keeps child creation disabled when Vercel flags are tampered on the server", async () => {
    stubEnvironment({
      DEPLOYMENT_PROFILE: "vercel_beta",
      ENABLE_CHILD_PROFILES: "true",
      ENABLE_PUBLIC_CHILD_CONTENT: "true",
      PARENTAL_CONSENT_MODE: "external_verified",
      VERCEL: "1",
    });
    const response = await learnerPost(
      mutationRequest("/api/settings/learners", {
        ageBand: "under_13",
        avatarSeed: "safe-avatar-1",
        displayName: "Young learner",
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        preferences: {
          readingStyle: "standard",
          reduceMotion: true,
          seriousMode: true,
          theme: "system",
        },
        pseudonym: "Quiet Finch",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/disabled in this deployment/i),
    });
    expect(mocks.createNextRouteDatabaseContext).not.toHaveBeenCalled();
    expect(mocks.createPrivilegedDatabaseClient).not.toHaveBeenCalled();
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
  });

  it("exchanges verified local consent for one opaque child-creation proof", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const learnerProfileId = "66666666-6666-4666-8666-666666666666";
    stubEnvironment({
      ENABLE_CHILD_PROFILES: "true",
      PARENTAL_CONSENT_MODE: "test_only",
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: accountId } }, error: null });
    mocks.routeRpc
      .mockResolvedValueOnce({ data: accountId, error: null })
      .mockResolvedValueOnce({ data: learnerProfileId, error: null });
    mocks.privilegedRpc.mockResolvedValue({
      data: "77777777-7777-4777-8777-777777777777",
      error: null,
    });

    const response = await learnerPost(
      mutationRequest("/api/settings/learners", {
        ageBand: "under_13",
        avatarSeed: "safe-avatar-1",
        displayName: "Young learner",
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        preferences: {
          readingStyle: "standard",
          reduceMotion: true,
          seriousMode: true,
          theme: "system",
        },
        pseudonym: "Quiet Finch",
      }),
    );

    const body: unknown = await response.json();
    expect(response.status).toBe(201);
    expect(body).toEqual({ learnerProfileId, status: "created" });
    expect(mocks.privilegedRpc).toHaveBeenCalledWith(
      "admin_issue_verified_child_creation_authorization",
      expect.objectContaining({
        p_actor_account_id: accountId,
        p_auth_session_id: "44444444-4444-4444-8444-444444444444",
        p_proof_hash: expect.stringMatching(/^\\x[0-9a-f]{64}$/u),
      }),
    );
    expect(mocks.routeRpc).toHaveBeenNthCalledWith(1, "current_assert_self_context");
    const issuedProof = (
      mocks.privilegedRpc.mock.calls[0]?.[1] as { p_proof_hash?: string } | undefined
    )?.p_proof_hash;
    expect(mocks.routeRpc).toHaveBeenNthCalledWith(
      2,
      "current_create_child_learner_configured",
      expect.objectContaining({ p_authorization_proof_hash: issuedProof }),
    );
    expect(JSON.stringify(body)).not.toContain(issuedProof);
  });

  it("rejects an account-profile mutation from a device-bound managed learner session", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const deviceId = "22222222-2222-4222-8222-222222222222";
    mocks.getUser.mockResolvedValue({ data: { user: { id: accountId } }, error: null });
    mocks.routeRpc.mockResolvedValue({ data: null, error: { message: "managed context" } });
    const request = mutationRequest("/api/settings/profile", {
      displayName: "Guardian change blocked",
    });
    request.cookies.set("lumen_device", deviceId);
    request.cookies.set("lumen_profile_session", "managed-learner-token-at-least-20-characters");

    const response = await profilePatch(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      message: "Profile changes could not be saved.",
    });
    expect(mocks.routeRpc).toHaveBeenCalledWith("current_assert_self_context");
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
    expect(mocks.routeFrom).not.toHaveBeenCalled();
  });

  it("rejects an account-profile mutation when a self session is bound to another device", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    mocks.getUser.mockResolvedValue({ data: { user: { id: accountId } }, error: null });
    mocks.routeRpc.mockResolvedValue({ data: null, error: { message: "device unavailable" } });
    const request = mutationRequest("/api/settings/profile", {
      displayName: "Cross-device change blocked",
    });
    request.cookies.set("lumen_device", "22222222-2222-4222-8222-222222222222");
    request.cookies.set("lumen_profile_session", "self-session-token-at-least-20-characters");

    const response = await profilePatch(request);

    expect(response.status).toBe(400);
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
    expect(mocks.routeFrom).not.toHaveBeenCalled();
    expect(mocks.routeRpc).toHaveBeenCalledWith("current_assert_self_context");
  });

  it("rejects a raw Auth identity that has no verified onboarding gate", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: "untrusted-direct-signup-session" },
        user: { email: "raw-auth@example.test", id: accountId },
      },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.privilegedRpc
      .mockResolvedValueOnce({
        data: [{ onboarding_completed_at: null, profile_exists: false }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    const response = await passwordPost(
      mutationRequest("/api/auth/password", {
        email: "raw-auth@example.test",
        intent: "sign_in",
        password: "correct horse battery staple",
        returnTo: "/app",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.privilegedRpc).toHaveBeenNthCalledWith(
      1,
      "admin_get_authentication_profile_state",
      { p_actor_account_id: accountId },
    );
    expect(mocks.privilegedRpc).toHaveBeenNthCalledWith(
      2,
      "admin_reject_provisional_account",
      expect.objectContaining({ p_actor_account_id: accountId }),
    );
    expect(mocks.registerRequestDevice).not.toHaveBeenCalled();
  });
});
