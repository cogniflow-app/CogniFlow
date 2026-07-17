// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyDeviceCookie: vi.fn((response: unknown) => response),
  attachRecoveryIntent: vi.fn((response: unknown) => response),
  attachVerifiedOnboardingAgeGate: vi.fn((response: unknown) => response),
  deleteRejectedProvisionalAuthUser: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  registerRequestDevice: vi.fn(),
  readPendingRecoveryIntent: vi.fn(),
  resolveAuthenticationAgeGate: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/server/account-provisioning", () => ({
  ensureApplicationAccount: vi.fn(),
}));

vi.mock("@/lib/server/authentication-age-gate", () => ({
  deleteRejectedProvisionalAuthUser: mocks.deleteRejectedProvisionalAuthUser,
  resolveAuthenticationAgeGate: mocks.resolveAuthenticationAgeGate,
}));

vi.mock("@/lib/server/device", () => ({
  applyDeviceCookie: mocks.applyDeviceCookie,
  registerRequestDevice: mocks.registerRequestDevice,
}));

vi.mock("@/lib/server/pending-auth-age-gate", () => ({
  attachVerifiedOnboardingAgeGate: mocks.attachVerifiedOnboardingAgeGate,
  clearPendingAuthAgeGate: (response: unknown) => response,
}));

vi.mock("@/lib/server/recovery-intent", () => ({
  attachRecoveryIntent: mocks.attachRecoveryIntent,
  clearPendingRecoveryIntent: (response: unknown) => response,
  readPendingRecoveryIntent: mocks.readPendingRecoveryIntent,
}));

vi.mock("@/lib/supabase/server", () => ({
  createNextRouteDatabaseContext: () => ({
    applyCookies: (response: unknown) => response,
    client: {
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        getUser: mocks.getUser,
        signOut: mocks.signOut,
        verifyOtp: mocks.verifyOtp,
      },
    },
  }),
}));

import { GET as callbackGet } from "../app/auth/callback/route";
import { GET as confirmGet } from "../app/auth/confirm/route";

const accountId = "11111111-1111-4111-8111-111111111111";

describe("authentication callback age-gate integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          created_at: "2026-07-15T18:00:00Z",
          email: "learner@example.test",
          id: accountId,
        },
      },
    });
    mocks.registerRequestDevice.mockResolvedValue("22222222-2222-4222-8222-222222222222");
    mocks.readPendingRecoveryIntent.mockResolvedValue({ purpose: "pending_password_recovery" });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
  });

  it("removes a new unprovisioned identity when callback gate integrity fails", async () => {
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: false,
      deleteProvisionalAccount: true,
    });
    const response = await callbackGet(
      new NextRequest("http://127.0.0.1:3100/auth/callback?code=provider-code"),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/auth/error",
      search: "?reason=age_gate",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.deleteRejectedProvisionalAuthUser).toHaveBeenCalledWith(accountId);
    expect(mocks.registerRequestDevice).not.toHaveBeenCalled();
  });

  it("keeps a provider-link callback for an existing account on its safe return path", async () => {
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: true,
      onboardingGate: null,
      returnTo: "/app/settings/connections?linked=1",
    });
    const response = await callbackGet(
      new NextRequest(
        "http://127.0.0.1:3100/auth/callback?code=provider-code&intent=authentication&returnTo=/app/settings/connections?linked=1",
      ),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/app/settings/connections",
      search: "?linked=1",
    });
    expect(mocks.deleteRejectedProvisionalAuthUser).not.toHaveBeenCalled();
    expect(mocks.registerRequestDevice).toHaveBeenCalled();
  });

  it("uses the canonical dashboard when authentication has no intended destination", async () => {
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: true,
      onboardingGate: null,
      returnTo: "/app",
    });

    const response = await callbackGet(
      new NextRequest("http://127.0.0.1:3100/auth/callback?code=provider-code"),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid").pathname).toBe("/app");
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/auth/sign-in",
    "/onboarding",
  ])("defensively rejects an unsafe or looping resolved return %s", async (returnTo) => {
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: true,
      onboardingGate: null,
      returnTo,
    });

    const response = await callbackGet(
      new NextRequest("http://127.0.0.1:3100/auth/callback?code=provider-code"),
    );

    const destination = new URL(response.headers.get("location") ?? "http://invalid");
    expect(destination.origin).not.toBe("https://attacker.example");
    expect(destination.pathname).toBe("/app");
  });

  it("completes token-hash confirmation at its safe intended application route", async () => {
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: true,
      onboardingGate: null,
      returnTo: "/app/library?view=grid",
    });

    const response = await confirmGet(
      new NextRequest("http://127.0.0.1:3100/auth/confirm?token_hash=verified-token&type=signup"),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/app/library",
      search: "?view=grid",
    });
    expect(mocks.verifyOtp).toHaveBeenCalled();
    expect(mocks.registerRequestDevice).toHaveBeenCalled();
  });

  it("carries a verified signup band into onboarding instead of the direct app return", async () => {
    const onboardingGate = { token: "signed-onboarding-gate" };
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: true,
      onboardingGate,
      returnTo: "/app/today",
    });
    const response = await callbackGet(
      new NextRequest("http://127.0.0.1:3100/auth/callback?code=provider-code"),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/onboarding",
      search: "?returnTo=%2Fapp%2Ftoday",
    });
    expect(mocks.attachVerifiedOnboardingAgeGate).toHaveBeenCalledWith(
      expect.anything(),
      onboardingGate,
    );
  });

  it("rejects a query-only email reauthentication intent without provisioning a device", async () => {
    const response = await callbackGet(
      new NextRequest(
        "http://127.0.0.1:3100/auth/callback?code=provider-code&intent=reauthentication",
      ),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/auth/error",
      search: "?reason=expired",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.resolveAuthenticationAgeGate).not.toHaveBeenCalled();
    expect(mocks.registerRequestDevice).not.toHaveBeenCalled();
  });

  it("rejects a forged reauthentication intent on token-hash confirmation too", async () => {
    const response = await confirmGet(
      new NextRequest(
        "http://127.0.0.1:3100/auth/confirm?token_hash=verified-token&type=magiclink&intent=reauthentication",
      ),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/auth/error",
      search: "?reason=expired",
    });
    expect(mocks.verifyOtp).toHaveBeenCalled();
    expect(mocks.registerRequestDevice).not.toHaveBeenCalled();
  });

  it("runs recovery through the established-account age boundary before issuing intent", async () => {
    mocks.resolveAuthenticationAgeGate.mockResolvedValue({
      allowed: true,
      onboardingGate: null,
      returnTo: "/app",
    });
    const response = await callbackGet(
      new NextRequest(
        "http://127.0.0.1:3100/auth/callback?code=recovery-code&intent=recovery&recoveryState=bound-state",
      ),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid").pathname).toBe(
      "/auth/update-password",
    );
    expect(mocks.resolveAuthenticationAgeGate).toHaveBeenCalled();
    expect(mocks.attachRecoveryIntent).toHaveBeenCalledWith(expect.anything(), accountId);
    expect(mocks.registerRequestDevice).toHaveBeenCalled();
  });

  it("rejects a query-tampered recovery intent without signed pending state", async () => {
    mocks.readPendingRecoveryIntent.mockResolvedValue(null);

    const response = await callbackGet(
      new NextRequest(
        "http://127.0.0.1:3100/auth/callback?code=ordinary-oauth-code&intent=recovery",
      ),
    );

    expect(new URL(response.headers.get("location") ?? "http://invalid")).toMatchObject({
      pathname: "/auth/error",
      search: "?reason=expired",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.resolveAuthenticationAgeGate).not.toHaveBeenCalled();
    expect(mocks.attachRecoveryIntent).not.toHaveBeenCalled();
    expect(mocks.registerRequestDevice).not.toHaveBeenCalled();
  });
});
