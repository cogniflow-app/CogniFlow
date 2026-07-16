import { z } from "zod";

import { normalizeHumanText } from "./primitives";

const nicknameAdjectives = [
  "Bright",
  "Calm",
  "Clever",
  "Curious",
  "Daring",
  "Gentle",
  "Kind",
  "Lively",
  "Merry",
  "Nimble",
  "Patient",
  "Quick",
  "Quiet",
  "Ready",
  "Steady",
  "Sunny",
] as const;

const nicknameNouns = [
  "Badger",
  "Comet",
  "Dolphin",
  "Falcon",
  "Finch",
  "Gecko",
  "Heron",
  "Koala",
  "Lynx",
  "Otter",
  "Panda",
  "Robin",
  "Sparrow",
  "Turtle",
  "Wombat",
  "Yak",
] as const;

const reservedNicknames = new Set([
  "admin",
  "administrator",
  "host",
  "moderator",
  "owner",
  "staff",
  "system",
  "teacher",
]);

const blockedFragments = ["bitch", "cunt", "fuck", "nigger", "nigga", "shit"] as const;

const allowedNicknamePattern = /^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u;
const generatedNicknamePattern = /^[A-Z][a-z]+[A-Z][a-z]+-[0-9]{3}$/u;
const invisibleOrControlPattern = /[\p{Cc}\p{Cf}]/u;

export type NicknameRejectionReason =
  "empty" | "too_short" | "too_long" | "unsupported_characters" | "reserved" | "unsafe_language";

export type FilteredNickname =
  | { readonly ok: true; readonly nickname: string }
  | { readonly ok: false; readonly reason: NicknameRejectionReason };

export type RandomBytesSource = (length: number) => Uint8Array;

function moderationKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/0/gu, "o")
    .replace(/[1!|]/gu, "i")
    .replace(/3/gu, "e")
    .replace(/4/gu, "a")
    .replace(/5/gu, "s")
    .replace(/7/gu, "t")
    .replace(/[^a-z0-9]/gu, "");
}

export function filterCustomNickname(value: unknown): FilteredNickname {
  if (typeof value !== "string") return Object.freeze({ ok: false, reason: "empty" });
  if (invisibleOrControlPattern.test(value)) {
    return Object.freeze({ ok: false, reason: "unsupported_characters" });
  }

  const nickname = normalizeHumanText(value);
  const length = Array.from(nickname).length;

  if (length === 0) return Object.freeze({ ok: false, reason: "empty" });
  if (length < 2) return Object.freeze({ ok: false, reason: "too_short" });
  if (length > 24) return Object.freeze({ ok: false, reason: "too_long" });
  if (!allowedNicknamePattern.test(nickname)) {
    return Object.freeze({ ok: false, reason: "unsupported_characters" });
  }

  const key = moderationKey(nickname);
  if (reservedNicknames.has(key)) return Object.freeze({ ok: false, reason: "reserved" });
  if (blockedFragments.some((fragment) => key.includes(fragment))) {
    return Object.freeze({ ok: false, reason: "unsafe_language" });
  }

  return Object.freeze({ ok: true, nickname });
}

function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Generates a curated nickname. It is display identity, never an authentication secret. */
export function generateSafeNickname(randomBytes: RandomBytesSource = secureRandomBytes): string {
  const bytes = randomBytes(4);
  if (bytes.length < 4) throw new Error("Random byte source returned too few bytes");

  const [adjectiveByte = 0, nounByte = 0, suffixHigh = 0, suffixLow = 0] = bytes;
  const adjective = nicknameAdjectives[adjectiveByte % nicknameAdjectives.length] ?? "Bright";
  const noun = nicknameNouns[nounByte % nicknameNouns.length] ?? "Badger";
  const suffix = ((suffixHigh << 8) | suffixLow) % 1000;
  const nickname = `${adjective}${noun}-${suffix.toString().padStart(3, "0")}`;

  if (!generatedNicknamePattern.test(nickname)) {
    throw new Error("Curated nickname generation invariant failed");
  }

  return nickname;
}

export const customNicknameSchema = z
  .string()
  .max(80)
  .transform((value, context) => {
    const result = filterCustomNickname(value);
    if (!result.ok) {
      context.addIssue({ code: "custom", message: `Nickname rejected: ${result.reason}` });
      return z.NEVER;
    }
    return result.nickname;
  });

export { generatedNicknamePattern, nicknameAdjectives, nicknameNouns };
