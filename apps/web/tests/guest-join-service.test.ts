// @vitest-environment node

import type { GuestRoomAdapter, GuestRoomDescriptor } from "@lumen/auth/guests";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  issueGuestIdentity,
  type GuestSessionCreateInput,
  type GuestSessionWriter,
} from "../lib/guest/guest-join";
import { sha256Bytes, signCompactPayload, verifyCompactPayload } from "../lib/server/crypto";
import { productionGuestRoomAdapter } from "../lib/server/guest-room-adapter";

const room: GuestRoomDescriptor = {
  allowGuests: true,
  allowLateJoin: true,
  expiresAt: "2026-07-15T20:00:00Z",
  joinCode: "ABCDEF",
  maxPlayers: 40,
  participantCount: 3,
  roomId: "11111111-1111-4111-8111-111111111111",
  status: "waiting",
};

class FixtureRoomAdapter implements GuestRoomAdapter {
  constructor(private readonly rooms: readonly GuestRoomDescriptor[]) {}

  async findByJoinCode(joinCode: string): Promise<GuestRoomDescriptor | null> {
    return this.rooms.find((candidate) => candidate.joinCode === joinCode) ?? null;
  }
}

class RecordingGuestSessionWriter implements GuestSessionWriter {
  input: GuestSessionCreateInput | null = null;

  async create(input: GuestSessionCreateInput) {
    this.input = input;
    return {
      expiresAt: input.expiresAt,
      guestSessionId: "22222222-2222-4222-8222-222222222222",
      nickname: input.nickname,
    };
  }
}

const signingKey = "fixture-guest-token-signing-key-at-least-32-bytes";
const rateSubject = new Uint8Array(32).fill(7);

function dependencies(adapter: GuestRoomAdapter, writer: GuestSessionWriter) {
  return {
    createIdempotencyKey: () => "33333333-3333-4333-8333-333333333333",
    async createReconnectToken(context: { expiresAt: Date; roomId: string }) {
      return signCompactPayload(
        JSON.stringify({
          expiresAt: context.expiresAt.toISOString(),
          nonce: "fixture-nonce-with-at-least-128-bits-of-test-data",
          roomId: context.roomId,
          version: 1,
        }),
        signingKey,
      );
    },
    generateNickname: () => "CalmOtter-042",
    hashReconnectToken: sha256Bytes,
    maxSessionLifetimeMs: 60 * 60 * 1_000,
    now: () => new Date("2026-07-15T17:00:00Z"),
    roomAdapter: adapter,
    sessionWriter: writer,
  };
}

describe("guest identity issuance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an expiring signed reconnect contract and persists only its digest", async () => {
    const writer = new RecordingGuestSessionWriter();
    const result = await issueGuestIdentity(
      { customNickname: "", joinCode: "abc-def" },
      { rateLimitSubjectHash: rateSubject },
      dependencies(new FixtureRoomAdapter([room]), writer),
    );

    expect(result).toMatchObject({
      expiresAt: new Date("2026-07-15T18:00:00Z"),
      guestSessionId: "22222222-2222-4222-8222-222222222222",
      joinCode: "ABCDEF",
      kind: "joined",
      nickname: "CalmOtter-042",
    });
    expect(writer.input).toMatchObject({
      expiresAt: new Date("2026-07-15T18:00:00Z"),
      gameReference: room.roomId,
      nickname: "CalmOtter-042",
      rateLimitSubjectHash: rateSubject,
    });
    expect(writer.input?.reconnectTokenHash).toHaveLength(32);

    if (result.kind !== "joined") throw new Error("Expected guest identity to be issued");
    expect(JSON.stringify(writer.input)).not.toContain(result.reconnectToken);
    const payload = await verifyCompactPayload(result.reconnectToken, signingKey);
    expect(payload && JSON.parse(payload)).toEqual({
      expiresAt: "2026-07-15T18:00:00.000Z",
      nonce: "fixture-nonce-with-at-least-128-bits-of-test-data",
      roomId: room.roomId,
      version: 1,
    });
  });

  it("accepts a filtered custom nickname but never writes for invalid or unavailable rooms", async () => {
    const eligibleWriter = new RecordingGuestSessionWriter();
    await expect(
      issueGuestIdentity(
        { customNickname: "  Nova Finch  ", joinCode: room.joinCode },
        { rateLimitSubjectHash: rateSubject },
        dependencies(new FixtureRoomAdapter([room]), eligibleWriter),
      ),
    ).resolves.toMatchObject({ kind: "joined", nickname: "Nova Finch" });
    expect(eligibleWriter.input?.nickname).toBe("Nova Finch");

    const unavailableWriter = new RecordingGuestSessionWriter();
    await expect(
      issueGuestIdentity(
        { joinCode: "ZZZZZZ" },
        { rateLimitSubjectHash: rateSubject },
        dependencies(new FixtureRoomAdapter([room]), unavailableWriter),
      ),
    ).resolves.toEqual({ kind: "unavailable" });
    await expect(
      issueGuestIdentity(
        { customNickname: "Host", joinCode: room.joinCode },
        { rateLimitSubjectHash: rateSubject },
        dependencies(new FixtureRoomAdapter([room]), unavailableWriter),
      ),
    ).resolves.toEqual({ kind: "invalid_input" });
    expect(unavailableWriter.input).toBeNull();
  });

  it("keeps the deployed adapter empty instead of publishing a fixture room", async () => {
    await expect(productionGuestRoomAdapter.findByJoinCode(room.joinCode)).resolves.toBeNull();
  });
});
