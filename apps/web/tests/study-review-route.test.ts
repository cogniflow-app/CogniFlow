// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSrsRuntimeContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/server/srs-context", () => ({
  createSrsRuntimeContext: mocks.createSrsRuntimeContext,
  isSrsRuntimeContext: () => true,
  srsDatabaseError: () => Response.json({ code: "INTERNAL" }, { status: 500 }),
}));

import { POST } from "../app/api/study/reviews/route";

const ids = {
  account: "0190d9f0-0000-7000-8000-000000000001",
  authSession: "0190d9f0-0000-7000-8000-000000000002",
  card: "0190d9f0-0000-7000-8000-000000000003",
  device: "0190d9f0-0000-7000-8000-000000000004",
  idempotency: "0190d9f0-0000-7000-8000-000000000005",
  learner: "0190d9f0-0000-7000-8000-000000000006",
  preset: "0190d9f0-0000-7000-8000-000000000007",
  review: "0190d9f0-0000-7000-8000-000000000008",
  studySession: "0190d9f0-0000-7000-8000-000000000009",
};

const body = {
  cardId: ids.card,
  currentScheduleVersion: 0,
  durationMs: 1_200,
  idempotencyKey: ids.idempotency,
  rating: "good" as const,
  reviewId: ids.review,
  reviewedAt: "2026-07-21T20:00:00.000Z",
  source: "today" as const,
  studyDayStart: 240,
  studySessionId: ids.studySession,
  timezone: "America/Chicago",
};

function request(value: unknown) {
  return new NextRequest("http://127.0.0.1:3100/api/study/reviews", {
    body: JSON.stringify(value),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("canonical review route", () => {
  beforeEach(() => {
    mocks.createSrsRuntimeContext.mockResolvedValue({
      accountId: ids.account,
      applyCookies: (response: Response) => response,
      authSessionId: ids.authSession,
      deviceId: ids.device,
      learnerProfileId: ids.learner,
      privileged: { rpc: mocks.rpc },
      profileSessionId: null,
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          buriedUntil: null,
          preset: { id: ids.preset, version: 1 },
          rescheduling: true,
          schedule: null,
          scheduleVersion: 0,
          source: "today",
          studyDayStart: 240,
          suspended: false,
          timezone: "America/Chicago",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { scheduleVersion: 1 }, error: null });
  });

  it("rejects any browser-provided next schedule before reading canonical state", async () => {
    const response = await POST(request({ ...body, scheduleAfter: { reps: 999 } }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("computes the transition on the trusted server and passes it to the atomic RPC", async () => {
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "admin_commit_srs_review_v2",
      expect.objectContaining({
        p_current_schedule_version: 0,
        p_rating: "good",
        p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        p_schedule_after: expect.objectContaining({ reps: 1, state: "learning" }),
        p_schedule_before: expect.objectContaining({ reps: 0, state: "new" }),
      }),
    );
  });

  it("returns an exact authorized replay before reading mutable session state", async () => {
    const canonical = { duplicate: false, reviewId: ids.review, scheduleVersion: 1 };
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: canonical, error: null });

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: canonical });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "admin_get_srs_review_replay",
      expect.objectContaining({
        p_idempotency_key: ids.idempotency,
        p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        p_review_id: ids.review,
      }),
    );
  });

  it("replays a causally later offline rating through the current canonical schedule", async () => {
    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          buriedUntil: null,
          preset: { id: ids.preset, version: 1 },
          rescheduling: true,
          schedule: {
            algorithm: "fsrs",
            difficulty: 5,
            due: "2026-07-22T00:00:00.000Z",
            elapsedDays: 1,
            lapses: 0,
            lastReviewedAt: "2026-07-21T19:00:00.000Z",
            learningStep: 0,
            legacyEaseFactor: null,
            reps: 2,
            scheduledDays: 1,
            schedulerVersion: "lumen-srs/1",
            stability: 2,
            state: "review",
          },
          scheduleVersion: 2,
          source: "today",
          studyDayStart: 240,
          suspended: false,
          timezone: "America/Chicago",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { scheduleVersion: 3 }, error: null });

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      appliedAfterReplay: true,
      data: { scheduleVersion: 3 },
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "admin_commit_srs_review_v2",
      expect.objectContaining({ p_current_schedule_version: 2 }),
    );
  });

  it("returns a conflict when an offline event overlaps canonical review time", async () => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({
      data: {
        buriedUntil: null,
        preset: { id: ids.preset, version: 1 },
        rescheduling: true,
        schedule: {
          algorithm: "fsrs",
          difficulty: 5,
          due: "2026-07-22T00:00:00.000Z",
          elapsedDays: 1,
          lapses: 0,
          lastReviewedAt: body.reviewedAt,
          learningStep: 0,
          legacyEaseFactor: null,
          reps: 2,
          scheduledDays: 1,
          schedulerVersion: "lumen-srs/1",
          stability: 2,
          state: "review",
        },
        scheduleVersion: 2,
        source: "today",
        studyDayStart: 240,
        suspended: false,
        timezone: "America/Chicago",
      },
      error: null,
    });

    const response = await POST(request(body));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "CONFLICT", retryable: false }),
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
