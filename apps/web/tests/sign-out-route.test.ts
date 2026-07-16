// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyCookies: vi.fn((response: Response) => response),
  assertSelfLearnerMutation: vi.fn(),
  assertTrustedMutationRequest: vi.fn(),
  createNextRouteDatabaseContext: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  verifyPasswordAndIssueGrant: vi.fn(),
}));

vi.mock("@lumen/config/server-env", () => ({
  getServerEnvironment: () => ({ nodeEnvironment: "test" }),
}));

vi.mock("@/lib/server/request-security", () => ({
  assertTrustedMutationRequest: mocks.assertTrustedMutationRequest,
}));

vi.mock("@/lib/server/learner-context", () => ({
  assertSelfLearnerMutation: mocks.assertSelfLearnerMutation,
}));

vi.mock("@/lib/server/reauthentication", () => ({
  verifyPasswordAndIssueGrant: mocks.verifyPasswordAndIssueGrant,
}));

vi.mock("@/lib/supabase/server", () => ({
  createNextRouteDatabaseContext: mocks.createNextRouteDatabaseContext,
}));

import { POST } from "../app/api/auth/sign-out/route";

function request(scope: "all" | "current") {
  return new NextRequest("http://127.0.0.1:3100/api/auth/sign-out", {
    body: JSON.stringify(scope === "all" ? { password: "verified-password", scope } : { scope }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("sign-out cookie boundary", () => {
  beforeEach(() => {
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: "guardian@example.test",
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.createNextRouteDatabaseContext.mockReturnValue({
      applyCookies: mocks.applyCookies,
      client: { auth: { getUser: mocks.getUser, signOut: mocks.signOut }, rpc: mocks.rpc },
    });
    mocks.verifyPasswordAndIssueGrant.mockResolvedValue(`\\x${"ab".repeat(32)}`);
  });

  it.each([
    ["current", "local"],
    ["all", "global"],
  ] as const)(
    "expires every app identity cookie for %s-device sign-out",
    async (scope, authScope) => {
      const response = await POST(request(scope));

      expect(response.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith(
        scope === "all" ? "current_sign_out_all_devices" : "current_sign_out_devices",
        scope === "all"
          ? {
              p_idempotency_key: expect.any(String),
              p_reauthentication_proof_hash: `\\x${"ab".repeat(32)}`,
            }
          : { p_idempotency_key: expect.any(String), p_scope: "current" },
      );
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: authScope });
      if (scope === "all") {
        expect(mocks.assertSelfLearnerMutation).toHaveBeenCalledOnce();
        expect(mocks.verifyPasswordAndIssueGrant).toHaveBeenCalledWith(
          expect.objectContaining({ purpose: "security_change" }),
        );
      } else {
        expect(mocks.assertSelfLearnerMutation).not.toHaveBeenCalled();
        expect(mocks.verifyPasswordAndIssueGrant).not.toHaveBeenCalled();
      }
      expect(mocks.applyCookies).toHaveBeenCalledOnce();

      for (const name of [
        "lumen_device",
        "lumen_profile_session",
        "lumen_reauthentication",
        "lumen_guest",
        "lumen_recovery_intent",
        "lumen_pending_recovery_intent",
        "lumen_pending_auth_age_gate",
        "lumen_onboarding_age_gate",
      ]) {
        expect(response.cookies.get(name)?.value, name).toBe("");
      }

      const setCookies = response.headers.getSetCookie();
      expect(setCookies.some((value) => value.startsWith("lumen_device=;"))).toBe(true);
      expect(
        setCookies.some(
          (value) =>
            value.startsWith("lumen_reauthentication=;") && value.includes("Path=/app/settings"),
        ),
      ).toBe(true);
      expect(setCookies.filter((value) => value.includes("Expires=Thu, 01 Jan 1970")).length).toBe(
        8,
      );
    },
  );

  it("still clears cookies after app-device revocation when Auth refresh invalidation fails", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "provider unavailable" } });

    const response = await POST(request("current"));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(response.cookies.get("lumen_device")?.value).toBe("");
    expect(mocks.applyCookies).toHaveBeenCalledOnce();
  });

  it("does not call global Auth sign-out when managed context blocks the account action", async () => {
    mocks.assertSelfLearnerMutation.mockRejectedValue(new Error("MANAGED_LEARNER_ACTIVE"));

    const response = await POST(request("all"));

    expect(response.status).toBe(403);
    expect(mocks.verifyPasswordAndIssueGrant).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("rejects password-bearing current-device sign-out before any revocation", async () => {
    const malformedRequest = new NextRequest("http://127.0.0.1:3100/api/auth/sign-out", {
      body: JSON.stringify({ password: "not-needed", scope: "current" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await POST(malformedRequest);

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
