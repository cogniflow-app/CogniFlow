// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSelfLearnerMutation: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  verifyPasswordAndIssueGrant: vi.fn(),
}));

vi.mock("@/lib/server/learner-context", () => ({
  assertSelfLearnerMutation: mocks.assertSelfLearnerMutation,
}));

vi.mock("@/lib/server/reauthentication", () => ({
  verifyPasswordAndIssueGrant: mocks.verifyPasswordAndIssueGrant,
}));

vi.mock("@/lib/supabase/server", () => ({
  createNextRouteDatabaseContext: () => ({
    applyCookies: (response: unknown) => response,
    client: { auth: { getUser: mocks.getUser }, rpc: mocks.rpc },
  }),
}));

import { POST } from "../app/api/settings/profile-sessions/revoke/route";

function request(body: unknown) {
  return new NextRequest("http://127.0.0.1:3100/api/settings/profile-sessions/revoke", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3100",
      "Sec-Fetch-Site": "same-origin",
    },
    method: "POST",
  });
}

describe("single profile-session revocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: "owner@example.test",
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
    mocks.verifyPasswordAndIssueGrant.mockResolvedValue(`\\x${"ab".repeat(32)}`);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires self context and fresh password proof for the selected session", async () => {
    const response = await POST(
      request({
        password: "local-test-password",
        profileSessionId: "22222222-2222-4222-8222-222222222222",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.assertSelfLearnerMutation).toHaveBeenCalled();
    expect(mocks.verifyPasswordAndIssueGrant).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "security_change" }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_revoke_profile_session",
      expect.objectContaining({
        p_profile_session_id: "22222222-2222-4222-8222-222222222222",
        p_reauthentication_proof_hash: `\\x${"ab".repeat(32)}`,
      }),
    );
  });

  it("rejects a malformed session identifier before reauthentication", async () => {
    const response = await POST(
      request({ password: "local-test-password", profileSessionId: "not-a-session" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.verifyPasswordAndIssueGrant).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
