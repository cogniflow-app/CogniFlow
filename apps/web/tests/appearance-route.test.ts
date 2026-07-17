// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSelfLearnerMutation: vi.fn(),
  createNextRouteDatabaseContext: vi.fn(),
  getUser: vi.fn(),
  routeFrom: vi.fn(),
  routeRpc: vi.fn(),
}));

vi.mock("@/lib/server/learner-context", () => ({
  assertSelfLearnerMutation: mocks.assertSelfLearnerMutation,
}));

vi.mock("@/lib/supabase/server", () => ({
  createNextRouteDatabaseContext: mocks.createNextRouteDatabaseContext,
}));

import { PATCH } from "../app/api/settings/appearance/route";

const accountId = "11111111-1111-4111-8111-111111111111";

function request(body: unknown): NextRequest {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3100";
  return new NextRequest(new URL("/api/settings/appearance", origin), {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(origin).origin,
      "Sec-Fetch-Site": "same-origin",
    },
    method: "PATCH",
  });
}

function queryReturning(result: unknown) {
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("account appearance mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: accountId } }, error: null });
    mocks.assertSelfLearnerMutation.mockResolvedValue(undefined);
    mocks.routeRpc.mockResolvedValue({ data: {}, error: null });
    mocks.routeFrom.mockImplementation((table: string) =>
      table === "profiles"
        ? queryReturning({
            data: {
              display_name: "Ada Learner",
              handle: "ada_learner",
              learning_goals: ["long_term_retention"],
              locale: "en-US",
              study_day_start: 240,
              timezone: "America/Chicago",
            },
            error: null,
          })
        : queryReturning({
            data: { settings: { reading_style: "increased_spacing" } },
            error: null,
          }),
    );
    mocks.createNextRouteDatabaseContext.mockReturnValue({
      applyCookies: (response: unknown) => response,
      client: {
        auth: { getUser: mocks.getUser },
        from: mocks.routeFrom,
        rpc: mocks.routeRpc,
      },
    });
  });

  it("persists only the authenticated self account appearance and preserves other profile data", async () => {
    const response = await PATCH(
      request({ reduceMotion: true, seriousMode: false, theme: "dark" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      preferences: { color: "dark", reduceMotion: true, seriousMode: false },
      status: "saved",
    });
    expect(mocks.assertSelfLearnerMutation).toHaveBeenCalledWith(
      expect.any(NextRequest),
      accountId,
    );
    expect(mocks.routeRpc).toHaveBeenCalledWith(
      "current_update_profile",
      expect.objectContaining({
        p_display_name: "Ada Learner",
        p_handle: "ada_learner",
        p_learning_goals: ["long_term_retention"],
        p_reading_style: "increased_spacing",
        p_reduced_motion: true,
        p_serious_mode: false,
        p_theme: "dark",
      }),
    );
  });

  it("rejects managed learner context before reading or mutating account preferences", async () => {
    mocks.assertSelfLearnerMutation.mockRejectedValue(new Error("MANAGED_LEARNER_ACTIVE"));

    const response = await PATCH(
      request({ reduceMotion: false, seriousMode: false, theme: "light" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.routeFrom).not.toHaveBeenCalled();
    expect(mocks.routeRpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and malformed requests without a profile write", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const unauthenticated = await PATCH(
      request({ reduceMotion: false, seriousMode: false, theme: "dark" }),
    );
    expect(unauthenticated.status).toBe(401);

    const malformed = await PATCH(
      request({ extra: "not accepted", reduceMotion: false, seriousMode: false, theme: "dark" }),
    );
    expect(malformed.status).toBe(422);
    expect(mocks.routeRpc).not.toHaveBeenCalled();
  });

  it("marks provider and database failures retryable instead of rejecting the local preference", async () => {
    mocks.routeRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "08006", message: "connection unavailable" },
    });

    const response = await PATCH(
      request({ reduceMotion: false, seriousMode: true, theme: "dark" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "INTERNAL",
      retryable: true,
    });
  });
});
