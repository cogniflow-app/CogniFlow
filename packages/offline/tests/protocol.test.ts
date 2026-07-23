import { describe, expect, it } from "vitest";

import {
  OFFLINE_PROTOCOL_VERSION,
  causalOrder,
  compareCursors,
  deterministicSerialize,
  mapTemporaryId,
  negotiateProtocol,
  payloadFingerprint,
  retryDelayMs,
  retryPolicySchema,
  sealOutboxOperation,
  shouldDeadLetter,
  verifyOutboxFingerprint,
  type OutboxOperation,
} from "../src";

const accountId = "11111111-1111-4111-8111-111111111111";
const learnerProfileId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";

function input(
  id: string,
  priorOperationId: string | null = null,
): Omit<OutboxOperation, "payloadFingerprint"> {
  return {
    accountId,
    attemptCount: 0,
    baseVersion: 4,
    createdAt: "2026-07-23T12:00:00.000Z",
    entityId: "55555555-5555-4555-8555-555555555555",
    entityType: "review",
    id,
    idempotencyKey: id,
    lastFailure: null,
    learnerProfileId,
    nextAttemptAt: null,
    occurredAt: "2026-07-23T12:00:00.000Z",
    operation: "apply_review",
    payload: {
      baseScheduleVersion: 4,
      beforeSchedule: { due: "2026-07-23T12:00:00.000Z", state: "review" },
      cardId: "55555555-5555-4555-8555-555555555555",
      durationMs: 1_200,
      kind: "review",
      priorReviewOperationId: priorOperationId,
      rating: "good",
      reviewId: id,
      reviewedAt: "2026-07-23T12:00:00.000Z",
      source: "today",
      studyDayStart: 240,
      studySessionId: "66666666-6666-4666-8666-666666666666",
      timezone: "America/Chicago",
    },
    priorOperationId,
    protocolVersion: OFFLINE_PROTOCOL_VERSION,
    registeredDeviceId: deviceId,
    status: "pending",
  };
}

describe("offline protocol", () => {
  it("serializes objects deterministically and rejects prototype-pollution keys", async () => {
    expect(deterministicSerialize({ z: [3, { b: 2, a: 1 }], a: true })).toBe(
      '{"a":true,"z":[3,{"a":1,"b":2}]}',
    );
    expect(await payloadFingerprint({ b: 2, a: 1 })).toBe(await payloadFingerprint({ a: 1, b: 2 }));
    expect(() => deterministicSerialize(JSON.parse('{"__proto__":{"admin":true}}'))).toThrow(
      "UNSAFE_OBJECT_KEY",
    );
  });

  it("binds an operation identity to the complete command", async () => {
    const operation = await sealOutboxOperation(input("77777777-7777-4777-8777-777777777777"));
    expect(await verifyOutboxFingerprint(operation)).toBe(true);
    expect(
      await verifyOutboxFingerprint({
        ...operation,
        payload: { ...operation.payload, rating: "easy" },
      } as OutboxOperation),
    ).toBe(false);
  });

  it("preserves causal order even when timestamps tie", async () => {
    const first = await sealOutboxOperation(input("77777777-7777-4777-8777-777777777777"));
    const second = await sealOutboxOperation(
      input("88888888-8888-4888-8888-888888888888", first.id),
    );
    expect(causalOrder([second, first]).map((operation) => operation.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(() =>
      causalOrder([
        { ...first, priorOperationId: second.id },
        { ...second, priorOperationId: first.id },
      ]),
    ).toThrow("CAUSAL_CYCLE");
  });

  it("compares large monotonic cursors without number truncation", () => {
    expect(
      compareCursors(
        { sequence: "900719925474099300", stream: "content" },
        { sequence: "900719925474099301", stream: "content" },
      ),
    ).toBe(-1);
  });

  it("negotiates only the explicit protocol version", () => {
    expect(negotiateProtocol(1)).toBe(1);
    expect(() => negotiateProtocol(2)).toThrow("UNSUPPORTED_PROTOCOL");
  });

  it("calculates deterministic bounded exponential retry and dead-letter state", () => {
    const policy = retryPolicySchema.parse({
      baseDelayMs: 1_000,
      jitterRatio: 0.2,
      maximumAttempts: 5,
      maximumDelayMs: 60_000,
    });
    const first = retryDelayMs("operation-a", 3, policy);
    expect(first).toBe(retryDelayMs("operation-a", 3, policy));
    expect(first).toBeGreaterThanOrEqual(3_200);
    expect(first).toBeLessThanOrEqual(4_800);
    expect(shouldDeadLetter(4, policy, true)).toBe(false);
    expect(shouldDeadLetter(5, policy, true)).toBe(true);
    expect(shouldDeadLetter(1, policy, false)).toBe(true);
  });

  it("maps local identifiers only when a canonical mapping exists", () => {
    const mappings = new Map([["local:deck:1", "canonical-deck"]]);
    expect(mapTemporaryId("local:deck:1", mappings)).toBe("canonical-deck");
    expect(mapTemporaryId("local:deck:2", mappings)).toBe("local:deck:2");
  });
});
