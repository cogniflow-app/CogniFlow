// @vitest-environment node

import { createEnvironmentFixture } from "@lumen/test-utils";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSelfLearnerMutation: vi.fn(),
  attachVerifiedOnboardingAgeGate: vi.fn((response: unknown) => response),
  deleteRejectedProvisionalAuthUser: vi.fn(),
  getUser: vi.fn(),
  issueVerifiedOnboardingAgeGate: vi.fn(),
  privilegedRpc: vi.fn(),
  readRequestOnboardingAgeGate: vi.fn(),
  readVerifiedAuthSessionId: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@lumen/database/server", () => ({
  createPrivilegedDatabaseClient: () => ({ rpc: mocks.privilegedRpc }),
}));

vi.mock("@/lib/server/auth-session", () => ({
  readVerifiedAuthSessionId: mocks.readVerifiedAuthSessionId,
}));

vi.mock("@/lib/server/authentication-age-gate", () => ({
  deleteRejectedProvisionalAuthUser: mocks.deleteRejectedProvisionalAuthUser,
}));

vi.mock("@/lib/server/learner-context", () => ({
  assertSelfLearnerMutation: mocks.assertSelfLearnerMutation,
}));

vi.mock("@/lib/server/pending-auth-age-gate", () => ({
  attachVerifiedOnboardingAgeGate: mocks.attachVerifiedOnboardingAgeGate,
  clearVerifiedOnboardingAgeGate: (response: unknown) => response,
  issueVerifiedOnboardingAgeGate: mocks.issueVerifiedOnboardingAgeGate,
  readRequestOnboardingAgeGate: mocks.readRequestOnboardingAgeGate,
}));

vi.mock("@/lib/supabase/server", () => ({
  createNextRouteDatabaseContext: () => ({
    applyCookies: (response: unknown) => response,
    client: { auth: { getUser: mocks.getUser, signOut: mocks.signOut }, rpc: mocks.rpc },
  }),
}));

import { POST as selectAgePost } from "../app/api/onboarding/age-gate/route";
import { POST as completeOnboardingPost } from "../app/api/onboarding/route";

const accountId = "11111111-1111-4111-8111-111111111111";
const validDetails = {
  displayName: "Avery Learner",
  handle: "avery_learner",
  learningGoals: ["long_term_retention"],
  locale: "en-US",
  preferences: {
    readingStyle: "standard",
    reduceMotion: false,
    seriousMode: false,
    theme: "system",
  },
  studyDayStartMinutes: 240,
  timeZone: "America/Chicago",
} as const;

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1:3100${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3100",
      "Sec-Fetch-Site": "same-origin",
    },
    method: "POST",
  });
}

describe("onboarding age-gate routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [name, value] of Object.entries(createEnvironmentFixture())) {
      vi.stubEnv(name, value);
    }
    mocks.getUser.mockResolvedValue({ data: { user: { id: accountId } }, error: null });
    mocks.issueVerifiedOnboardingAgeGate.mockResolvedValue({ token: "signed-gate" });
    mocks.privilegedRpc.mockResolvedValue({ data: crypto.randomUUID(), error: null });
    mocks.readRequestOnboardingAgeGate.mockResolvedValue({
      accountId,
      ageBand: "adult",
      returnTo: "/app",
    });
    mocks.readVerifiedAuthSessionId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes a verified provisional identity when its age choice changes to under 13", async () => {
    const response = await selectAgePost(
      request("/api/onboarding/age-gate", { ageBand: "under_13", returnTo: "/app" }),
    );

    expect(await response.json()).toEqual({
      next: "/auth/guardian-required",
      status: "guardian_required",
    });
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.deleteRejectedProvisionalAuthUser).toHaveBeenCalledWith(accountId);
    expect(mocks.issueVerifiedOnboardingAgeGate).not.toHaveBeenCalled();
  });

  it("issues an account-bound eligible gate with a normalized return target", async () => {
    const response = await selectAgePost(
      request("/api/onboarding/age-gate", {
        ageBand: "teen",
        returnTo: "https://attacker.example/steal",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.assertSelfLearnerMutation).toHaveBeenCalledWith(
      expect.any(NextRequest),
      accountId,
    );
    expect(mocks.issueVerifiedOnboardingAgeGate).toHaveBeenCalledWith({
      accountId,
      ageBand: "teen",
      returnTo: "/app",
    });
    expect(await response.json()).toMatchObject({
      next: "/onboarding?returnTo=%2Fapp",
      status: "age_gate_verified",
    });
  });

  it("does not accept an age band in the final profile request body", async () => {
    const response = await completeOnboardingPost(
      request("/api/onboarding", { ...validDetails, ageBand: "adult" }),
    );

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires an unexpired account-bound gate before the atomic onboarding RPC", async () => {
    mocks.readRequestOnboardingAgeGate.mockResolvedValue(null);
    const response = await completeOnboardingPost(request("/api/onboarding", validDetails));

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("persists the signed teen band rather than any client-derived default", async () => {
    mocks.readRequestOnboardingAgeGate.mockResolvedValue({
      accountId,
      ageBand: "teen",
      returnTo: "/app/today",
    });
    const response = await completeOnboardingPost(request("/api/onboarding", validDetails));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_complete_account_onboarding",
      expect.objectContaining({
        p_age_band: "teen",
        p_authorization_proof_hash: expect.stringMatching(/^\\x[0-9a-f]{64}$/u),
      }),
    );
    expect(mocks.privilegedRpc).toHaveBeenCalledWith(
      "admin_issue_onboarding_authorization",
      expect.objectContaining({ p_age_band: "teen" }),
    );
    expect(await response.json()).toMatchObject({ next: "/app/today", status: "onboarded" });
  });
});
