// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureApplicationAccount: vi.fn(),
  issueVerifiedOnboardingAgeGate: vi.fn(),
  rpc: vi.fn(),
  readPendingAuthAgeGate: vi.fn(),
}));

vi.mock("@lumen/database/server", () => ({
  createPrivilegedDatabaseClient: () => ({
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/server/account-provisioning", () => ({
  ensureApplicationAccount: mocks.ensureApplicationAccount,
}));

vi.mock("@/lib/server/pending-auth-age-gate", () => ({
  issueVerifiedOnboardingAgeGate: mocks.issueVerifiedOnboardingAgeGate,
  pendingPasswordGateMatchesEmail: vi.fn().mockResolvedValue(true),
  readPendingAuthAgeGate: mocks.readPendingAuthAgeGate,
}));

import { resolveAuthenticationAgeGate } from "../lib/server/authentication-age-gate";

const user = {
  created_at: "2026-07-15T17:59:00.000Z",
  email: "learner@example.test",
  id: "11111111-1111-4111-8111-111111111111",
};
const now = new Date("2026-07-15T18:00:00.000Z");

describe("authentication callback age-gate decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issueVerifiedOnboardingAgeGate.mockResolvedValue({ token: "verified" });
  });

  it("keeps an existing application account compatible with provider-link callbacks", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ onboarding_completed_at: "2026-07-01T00:05:00Z", profile_exists: true }],
      error: null,
    });
    const request = new NextRequest(
      "http://127.0.0.1:3100/auth/callback?intent=authentication&returnTo=/app/settings/connections",
    );

    await expect(resolveAuthenticationAgeGate(request, user, now)).resolves.toMatchObject({
      allowed: true,
      onboardingGate: null,
      returnTo: "/app/settings/connections",
    });
    expect(mocks.ensureApplicationAccount).toHaveBeenCalledWith(user.id);
  });

  it("rejects a recent new OAuth identity when sign-in has no signup age gate", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ onboarding_completed_at: null, profile_exists: true }],
      error: null,
    });
    const request = new NextRequest(
      "http://127.0.0.1:3100/auth/callback?intent=authentication&authFlow=oauth&provider=google&ageGate=nonce",
    );
    mocks.readPendingAuthAgeGate.mockResolvedValue({
      ageBand: null,
      flow: "oauth",
      intent: "sign_in",
      provider: "google",
      returnTo: "/app",
    });

    await expect(resolveAuthenticationAgeGate(request, user, now)).resolves.toEqual({
      allowed: false,
      deleteProvisionalAccount: true,
    });
    expect(mocks.ensureApplicationAccount).not.toHaveBeenCalled();
  });

  it("has no elapsed-time bypass for an incomplete profile", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ onboarding_completed_at: null, profile_exists: true }],
      error: null,
    });
    const request = new NextRequest(
      "http://127.0.0.1:3100/auth/callback?intent=authentication&returnTo=/app",
    );

    await expect(resolveAuthenticationAgeGate(request, user, now)).resolves.toEqual({
      allowed: false,
      deleteProvisionalAccount: true,
    });
  });

  it("provisions a new OAuth account only from an eligible signed signup decision", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ onboarding_completed_at: null, profile_exists: true }],
      error: null,
    });
    mocks.readPendingAuthAgeGate.mockResolvedValue({
      ageBand: "teen",
      flow: "oauth",
      intent: "sign_up",
      provider: "google",
      returnTo: "/app/today",
    });
    const request = new NextRequest(
      "http://127.0.0.1:3100/auth/callback?intent=authentication&authFlow=oauth&provider=google&ageGate=nonce",
    );

    await expect(resolveAuthenticationAgeGate(request, user, now)).resolves.toMatchObject({
      allowed: true,
      onboardingGate: { token: "verified" },
      returnTo: "/app/today",
    });
    expect(mocks.issueVerifiedOnboardingAgeGate).toHaveBeenCalledWith({
      accountId: user.id,
      ageBand: "teen",
      returnTo: "/app/today",
    });
  });
});
