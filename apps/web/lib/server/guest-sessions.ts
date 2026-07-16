import "server-only";

import type { DatabaseClient } from "@lumen/database";

import type {
  CreatedGuestSession,
  GuestSessionCreateInput,
  GuestSessionWriter,
} from "@/lib/guest/guest-join";

function postgresBytea(value: Uint8Array): string {
  return `\\x${[...value].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function parseCreatedSession(value: unknown): CreatedGuestSession {
  if (!value || typeof value !== "object") {
    throw new Error("Guest session writer returned no row");
  }

  const row = value as Record<string, unknown>;
  const expiresAt = typeof row.expires_at === "string" ? new Date(row.expires_at) : null;
  if (
    typeof row.guest_session_id !== "string" ||
    typeof row.nickname !== "string" ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime())
  ) {
    throw new Error("Guest session writer returned an invalid row");
  }

  return Object.freeze({
    expiresAt,
    guestSessionId: row.guest_session_id,
    nickname: row.nickname,
  });
}

export function digestHexToBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Expected a SHA-256 digest");
  }

  return Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  );
}

export function createDatabaseGuestSessionWriter(client: DatabaseClient): GuestSessionWriter {
  return Object.freeze({
    async create(input: GuestSessionCreateInput) {
      const { data, error } = await client.rpc("admin_create_guest_session", {
        p_expires_at: input.expiresAt.toISOString(),
        p_game_reference: input.gameReference,
        p_idempotency_key: input.idempotencyKey,
        p_nickname: input.nickname,
        p_reconnect_token_hash: postgresBytea(input.reconnectTokenHash),
        p_subject_hash: postgresBytea(input.rateLimitSubjectHash),
      });
      if (error) {
        if (error.code === "P0001") {
          throw new Error("RATE_LIMITED");
        }
        throw new Error("Guest session could not be created");
      }

      return parseCreatedSession(data?.[0]);
    },
  });
}
