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

import { POST } from "../app/api/study/presets/migrate/route";

const ids = {
  account: "0190d9f0-0000-7000-8000-000000000001",
  authSession: "0190d9f0-0000-7000-8000-000000000002",
  card: "0190d9f0-0000-7000-8000-000000000003",
  deck: "0190d9f0-0000-7000-8000-000000000004",
  device: "0190d9f0-0000-7000-8000-000000000005",
  event: "0190d9f0-0000-7000-8000-000000000006",
  idempotency: "0190d9f0-0000-7000-8000-000000000007",
  learner: "0190d9f0-0000-7000-8000-000000000008",
  preset: "0190d9f0-0000-7000-8000-000000000009",
};

function request(value: unknown) {
  return new NextRequest("http://127.0.0.1:3100/api/study/presets/migrate", {
    body: JSON.stringify(value),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const confirmBody = {
  deckIds: [ids.deck],
  expectedCount: 1,
  idempotencyKey: ids.idempotency,
  operationEventId: ids.event,
  preview: false,
  targetPresetId: ids.preset,
};

describe("scheduler algorithm migration route", () => {
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
    mocks.rpc.mockReset();
  });

  it("rejects browser-provided replay transitions", async () => {
    const response = await POST(
      request({ ...confirmBody, transitions: [{ cardId: ids.card, scheduleAfter: {} }] }),
    );

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("replays immutable history on the trusted server before the atomic commit", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          preset: {
            algorithm: "sm2",
            bury_siblings: true,
            fuzz_enabled: true,
            learning_steps_minutes: [1, 10],
            leech_action: "tag",
            leech_threshold: 8,
            maximum_interval_days: 36_500,
            new_card_order: "created",
            new_cards_per_day: 20,
            new_review_mix: "interleave",
            relearning_steps_minutes: [10],
            requested_retention: 0.9,
            review_order: "due",
            reviews_per_day: 200,
            short_term_enabled: true,
          },
          rows: [
            {
              cardId: ids.card,
              createdAt: "2026-07-01T00:00:00.000Z",
              expectedVersion: 3,
              history: [
                {
                  durationMs: 1_200,
                  rating: "good",
                  reviewedAt: "2026-07-01T01:00:00.000Z",
                },
              ],
            },
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { affectedCount: 1 }, error: null });

    const response = await POST(request(confirmBody));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_commit_srs_algorithm_migration",
      expect.objectContaining({
        p_expected_count: 1,
        p_transitions: [
          expect.objectContaining({
            cardId: ids.card,
            expectedVersion: 3,
            scheduleAfter: expect.objectContaining({
              algorithm: "sm2",
              legacyEaseFactor: expect.any(Number),
              stability: null,
            }),
          }),
        ],
      }),
    );
  });
});
