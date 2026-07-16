import { z } from "zod";

import { customNicknameSchema } from "./nicknames";
import { opaqueTokenSchema, uuidSchema } from "./primitives";

export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const joinCodeSchema = z
  .string()
  .trim()
  .max(32)
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]+/gu, ""))
  .pipe(
    z
      .string()
      .length(JOIN_CODE_LENGTH)
      .regex(/^[A-HJ-NP-Z2-9]+$/u, "Enter a valid join code"),
  );

const optionalCustomNicknameSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  customNicknameSchema.optional(),
);

export const guestJoinInputSchema = z
  .object({
    joinCode: joinCodeSchema,
    customNickname: optionalCustomNicknameSchema,
  })
  .strict();

export const guestReconnectInputSchema = z
  .object({
    joinCode: joinCodeSchema,
    participantId: uuidSchema,
    reconnectToken: opaqueTokenSchema,
  })
  .strict();

export const guestRoomStatuses = ["waiting", "active", "locked", "ended"] as const;

export const guestRoomDescriptorSchema = z
  .object({
    roomId: uuidSchema,
    joinCode: joinCodeSchema,
    status: z.enum(guestRoomStatuses),
    allowGuests: z.boolean(),
    allowLateJoin: z.boolean(),
    participantCount: z.number().int().min(0),
    maxPlayers: z.number().int().min(1).max(1000),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type GuestJoinInput = z.infer<typeof guestJoinInputSchema>;
export type GuestReconnectInput = z.infer<typeof guestReconnectInputSchema>;
export type GuestRoomDescriptor = z.infer<typeof guestRoomDescriptorSchema>;

/** Implemented by the future game repository; this package never queries a provider directly. */
export interface GuestRoomAdapter {
  findByJoinCode(joinCode: string): Promise<GuestRoomDescriptor | null>;
}

/** Shape used by deterministic tests without exposing a pretend production room. */
export interface GuestRoomTestFixture {
  readonly rooms: readonly GuestRoomDescriptor[];
}

export type GuestRoomResolution =
  | { readonly kind: "joinable"; readonly room: GuestRoomDescriptor }
  | {
      readonly kind: "unavailable";
      readonly reason:
        "guests_disabled" | "full" | "locked" | "ended" | "expired" | "late_join_disabled";
    }
  | { readonly kind: "not_found" };

export async function resolveGuestRoom(
  adapter: GuestRoomAdapter,
  untrustedJoinCode: unknown,
  now: Date,
): Promise<GuestRoomResolution> {
  const parsedCode = joinCodeSchema.safeParse(untrustedJoinCode);
  if (!parsedCode.success) return Object.freeze({ kind: "not_found" });

  const candidate = await adapter.findByJoinCode(parsedCode.data);
  if (!candidate) return Object.freeze({ kind: "not_found" });

  const parsedRoom = guestRoomDescriptorSchema.safeParse(candidate);
  if (!parsedRoom.success || parsedRoom.data.joinCode !== parsedCode.data) {
    return Object.freeze({ kind: "not_found" });
  }

  const room = parsedRoom.data;
  if (Date.parse(room.expiresAt) <= now.getTime()) {
    return Object.freeze({ kind: "unavailable", reason: "expired" });
  }
  if (!room.allowGuests) {
    return Object.freeze({ kind: "unavailable", reason: "guests_disabled" });
  }
  if (room.status === "locked") {
    return Object.freeze({ kind: "unavailable", reason: "locked" });
  }
  if (room.status === "ended") {
    return Object.freeze({ kind: "unavailable", reason: "ended" });
  }
  if (room.status === "active" && !room.allowLateJoin) {
    return Object.freeze({ kind: "unavailable", reason: "late_join_disabled" });
  }
  if (room.participantCount >= room.maxPlayers) {
    return Object.freeze({ kind: "unavailable", reason: "full" });
  }

  return Object.freeze({ kind: "joinable", room: Object.freeze(room) });
}
