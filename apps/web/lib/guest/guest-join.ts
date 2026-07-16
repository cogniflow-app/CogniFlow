import { guestJoinInputSchema, resolveGuestRoom, type GuestRoomAdapter } from "@lumen/auth/guests";
import { generateSafeNickname } from "@lumen/auth/nicknames";

export interface GuestSessionCreateInput {
  readonly expiresAt: Date;
  readonly gameReference: string;
  readonly idempotencyKey: string;
  readonly nickname: string;
  readonly reconnectTokenHash: Uint8Array;
  readonly rateLimitSubjectHash: Uint8Array;
}

export interface CreatedGuestSession {
  readonly expiresAt: Date;
  readonly guestSessionId: string;
  readonly nickname: string;
}

/** A provider-specific writer. Implementations must never persist the raw reconnect token. */
export interface GuestSessionWriter {
  create(input: GuestSessionCreateInput): Promise<CreatedGuestSession>;
}

export interface GuestReconnectTokenContext {
  readonly expiresAt: Date;
  readonly roomId: string;
}

export interface GuestJoinDependencies {
  readonly createIdempotencyKey: () => string;
  readonly createReconnectToken: (context: GuestReconnectTokenContext) => Promise<string>;
  readonly generateNickname?: () => string;
  readonly hashReconnectToken: (token: string) => Promise<Uint8Array>;
  readonly maxSessionLifetimeMs: number;
  readonly now: () => Date;
  readonly roomAdapter: GuestRoomAdapter;
  readonly sessionWriter: GuestSessionWriter;
}

export interface GuestJoinContext {
  readonly rateLimitSubjectHash: Uint8Array;
}

export type GuestJoinResult =
  | { readonly kind: "invalid_input" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "joined";
      readonly expiresAt: Date;
      readonly guestSessionId: string;
      readonly joinCode: string;
      readonly nickname: string;
      /** Returned once so the route can place it in an HttpOnly cookie. */
      readonly reconnectToken: string;
    };

function validDigest(value: Uint8Array): boolean {
  return value.byteLength === 32;
}

/**
 * Resolves room policy and issues a guest identity without coupling auth logic
 * to the future game repository. Room failures intentionally collapse into one
 * public result so callers cannot enumerate active room state.
 */
export async function issueGuestIdentity(
  untrustedInput: unknown,
  context: GuestJoinContext,
  dependencies: GuestJoinDependencies,
): Promise<GuestJoinResult> {
  const parsed = guestJoinInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    return Object.freeze({ kind: "invalid_input" });
  }

  if (
    !validDigest(context.rateLimitSubjectHash) ||
    !Number.isSafeInteger(dependencies.maxSessionLifetimeMs) ||
    dependencies.maxSessionLifetimeMs <= 0
  ) {
    throw new Error("Invalid guest identity service configuration");
  }

  const now = dependencies.now();
  const resolution = await resolveGuestRoom(dependencies.roomAdapter, parsed.data.joinCode, now);
  if (resolution.kind !== "joinable") {
    return Object.freeze({ kind: "unavailable" });
  }

  const roomExpiry = Date.parse(resolution.room.expiresAt);
  const maximumExpiry = now.getTime() + dependencies.maxSessionLifetimeMs;
  const expiresAt = new Date(Math.min(roomExpiry, maximumExpiry));
  if (expiresAt.getTime() <= now.getTime()) {
    return Object.freeze({ kind: "unavailable" });
  }

  const nickname =
    parsed.data.customNickname ?? dependencies.generateNickname?.() ?? generateSafeNickname();
  const reconnectToken = await dependencies.createReconnectToken({
    expiresAt,
    roomId: resolution.room.roomId,
  });
  const reconnectTokenHash = await dependencies.hashReconnectToken(reconnectToken);
  if (!validDigest(reconnectTokenHash)) {
    throw new Error("Reconnect-token digest must be SHA-256");
  }

  const created = await dependencies.sessionWriter.create({
    expiresAt,
    gameReference: resolution.room.roomId,
    idempotencyKey: dependencies.createIdempotencyKey(),
    nickname,
    reconnectTokenHash,
    rateLimitSubjectHash: context.rateLimitSubjectHash,
  });

  return Object.freeze({
    kind: "joined",
    expiresAt: created.expiresAt,
    guestSessionId: created.guestSessionId,
    joinCode: parsed.data.joinCode,
    nickname: created.nickname,
    reconnectToken,
  });
}
