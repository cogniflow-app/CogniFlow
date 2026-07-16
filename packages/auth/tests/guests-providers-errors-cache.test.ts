import { describe, expect, it } from "vitest";

import {
  cacheIsolationEventSchema,
  cacheIsolationScopes,
  requiredCacheIsolationScopes,
} from "../src/cache-isolation";
import { mapAuthError } from "../src/errors";
import {
  guestJoinInputSchema,
  joinCodeSchema,
  resolveGuestRoom,
  type GuestRoomAdapter,
  type GuestRoomDescriptor,
} from "../src/guests";
import {
  configuredAuthProviders,
  createPublicAuthProviderDescriptors,
  publicAuthProviderDescriptorSchema,
} from "../src/providers";

const room: GuestRoomDescriptor = {
  roomId: "11111111-1111-4111-8111-111111111111",
  joinCode: "ABCDEF",
  status: "waiting",
  allowGuests: true,
  allowLateJoin: true,
  participantCount: 4,
  maxPlayers: 40,
  expiresAt: "2026-07-15T18:00:00Z",
};

class FixtureRoomAdapter implements GuestRoomAdapter {
  readonly #rooms: ReadonlyMap<string, GuestRoomDescriptor>;

  constructor(rooms: readonly GuestRoomDescriptor[]) {
    this.#rooms = new Map(rooms.map((entry) => [entry.joinCode, entry]));
  }

  async findByJoinCode(joinCode: string): Promise<GuestRoomDescriptor | null> {
    return this.#rooms.get(joinCode) ?? null;
  }
}

describe("guest identity boundaries", () => {
  it("normalizes join-code formatting and rejects ambiguous characters", () => {
    expect(joinCodeSchema.parse("abc-def")).toBe("ABCDEF");
    expect(joinCodeSchema.safeParse("ABCI01").success).toBe(false);
  });

  it("treats an empty optional nickname as generated-name intent", () => {
    expect(guestJoinInputSchema.parse({ joinCode: "abc-def", customNickname: " " })).toEqual({
      joinCode: "ABCDEF",
      customNickname: undefined,
    });
  });

  it("resolves a fixture room through the production adapter contract", async () => {
    const result = await resolveGuestRoom(
      new FixtureRoomAdapter([room]),
      "abc-def",
      new Date("2026-07-15T17:00:00Z"),
    );

    expect(result).toEqual({ kind: "joinable", room });
  });

  it("does not reveal whether a malformed or unknown room code exists", async () => {
    const adapter = new FixtureRoomAdapter([room]);
    await expect(resolveGuestRoom(adapter, "bad", new Date())).resolves.toEqual({
      kind: "not_found",
    });
    await expect(resolveGuestRoom(adapter, "ZZZZZZ", new Date())).resolves.toEqual({
      kind: "not_found",
    });
  });

  it("enforces expiry, guest policy, locks, and capacity", async () => {
    const adapter = new FixtureRoomAdapter([{ ...room, participantCount: 40 }]);
    await expect(
      resolveGuestRoom(adapter, room.joinCode, new Date("2026-07-15T17:00:00Z")),
    ).resolves.toEqual({ kind: "unavailable", reason: "full" });
    await expect(
      resolveGuestRoom(
        new FixtureRoomAdapter([{ ...room, allowGuests: false }]),
        room.joinCode,
        new Date("2026-07-15T17:00:00Z"),
      ),
    ).resolves.toEqual({ kind: "unavailable", reason: "guests_disabled" });
    await expect(
      resolveGuestRoom(
        new FixtureRoomAdapter([{ ...room, status: "locked" }]),
        room.joinCode,
        new Date("2026-07-15T17:00:00Z"),
      ),
    ).resolves.toEqual({ kind: "unavailable", reason: "locked" });
    await expect(
      resolveGuestRoom(
        new FixtureRoomAdapter([{ ...room, status: "active", allowLateJoin: false }]),
        room.joinCode,
        new Date("2026-07-15T17:00:00Z"),
      ),
    ).resolves.toEqual({ kind: "unavailable", reason: "late_join_disabled" });
    await expect(
      resolveGuestRoom(adapter, room.joinCode, new Date("2026-07-15T18:00:00Z")),
    ).resolves.toEqual({ kind: "unavailable", reason: "expired" });
  });
});

describe("public provider descriptors and safe errors", () => {
  it("exposes only configured provider descriptors with canonical labels", () => {
    const descriptors = createPublicAuthProviderDescriptors({
      emailPassword: true,
      magicLink: true,
      oauth: ["github"],
    });

    expect(configuredAuthProviders(descriptors).map(({ id }) => id)).toEqual([
      "email_password",
      "magic_link",
      "github",
    ]);
    expect(descriptors.find(({ id }) => id === "google")?.configured).toBe(false);
  });

  it("rejects secret-bearing fields in a public descriptor", () => {
    expect(
      publicAuthProviderDescriptorSchema.safeParse({
        id: "google",
        kind: "oauth",
        label: "Google",
        configured: true,
        clientSecret: "must-not-serialize",
      }).success,
    ).toBe(false);
  });

  it("maps provider errors without reflecting messages or account existence", () => {
    const providerMessage = "user secret@example.com already exists";
    const safe = mapAuthError(
      { code: "user_already_exists", message: providerMessage, status: 400 },
      "sign_up",
    );

    expect(JSON.stringify(safe)).not.toContain(providerMessage);
    expect(JSON.stringify(safe)).not.toContain("secret@example.com");
    expect(safe.code).toBe("account_state_hidden");
  });

  it("maps throttling and expired links to actionable stable errors", () => {
    expect(mapAuthError({ status: 429 }, "recovery").code).toBe("rate_limited");
    expect(mapAuthError({ code: "otp_expired" }, "callback").code).toBe("expired_link");
  });
});

describe("cache isolation contract", () => {
  it("requires a complete typed profile-switch event", () => {
    const event = {
      version: 1,
      eventId: "11111111-1111-4111-8111-111111111111",
      type: "learner_profile_switched",
      occurredAt: "2026-07-15T17:00:00Z",
      accountId: "22222222-2222-4222-8222-222222222222",
      fromLearnerProfileId: "33333333-3333-4333-8333-333333333333",
      toLearnerProfileId: "44444444-4444-4444-8444-444444444444",
      deviceId: "55555555-5555-4555-8555-555555555555",
      scopes: [...cacheIsolationScopes],
    } as const;

    expect(cacheIsolationEventSchema.parse(event)).toEqual(event);
    expect(requiredCacheIsolationScopes()).toEqual(cacheIsolationScopes);
  });

  it("rejects a no-op profile switch and duplicate cache scopes", () => {
    const common = {
      version: 1,
      eventId: "11111111-1111-4111-8111-111111111111",
      type: "learner_profile_switched",
      occurredAt: "2026-07-15T17:00:00Z",
      accountId: "22222222-2222-4222-8222-222222222222",
      fromLearnerProfileId: "33333333-3333-4333-8333-333333333333",
      toLearnerProfileId: "33333333-3333-4333-8333-333333333333",
      deviceId: "55555555-5555-4555-8555-555555555555",
      scopes: ["indexed_db", "indexed_db"],
    } as const;

    expect(cacheIsolationEventSchema.safeParse(common).success).toBe(false);
  });
});
