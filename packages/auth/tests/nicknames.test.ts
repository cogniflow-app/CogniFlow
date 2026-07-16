import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  filterCustomNickname,
  generatedNicknamePattern,
  generateSafeNickname,
} from "../src/nicknames";

describe("safe nicknames", () => {
  it("generates a deterministic nickname with an injected byte source", () => {
    expect(generateSafeNickname(() => new Uint8Array([0, 0, 0, 0]))).toBe("BrightBadger-000");
  });

  it("normalizes safe custom names while retaining international letters", () => {
    expect(filterCustomNickname("  Élan   Bleu  ")).toEqual({ ok: true, nickname: "Élan Bleu" });
  });

  it("rejects reserved, unsafe, and markup-like names without echoing them", () => {
    expect(filterCustomNickname("Moderator")).toEqual({ ok: false, reason: "reserved" });
    expect(filterCustomNickname("sh1t")).toEqual({ ok: false, reason: "unsafe_language" });
    expect(filterCustomNickname("<script>")).toEqual({
      ok: false,
      reason: "unsupported_characters",
    });
  });

  it("rejects empty and oversized names", () => {
    expect(filterCustomNickname(" ")).toEqual({ ok: false, reason: "empty" });
    expect(filterCustomNickname("a")).toEqual({ ok: false, reason: "too_short" });
    expect(filterCustomNickname("a".repeat(25))).toEqual({ ok: false, reason: "too_long" });
    expect(filterCustomNickname("River\n")).toEqual({
      ok: false,
      reason: "unsupported_characters",
    });
  });

  it("generates only curated names accepted by the custom-name safety gate", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 4, maxLength: 32 }), (bytes) => {
        const nickname = generateSafeNickname(() => bytes);
        expect(nickname).toMatch(generatedNicknamePattern);
        expect(filterCustomNickname(nickname)).toEqual({ ok: true, nickname });
      }),
      { numRuns: 500 },
    );
  });

  it("never accepts control characters from arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 31 }), (value, control) => {
        const result = filterCustomNickname(`${value}${String.fromCodePoint(control)}`);
        expect(result.ok).toBe(false);
      }),
      { numRuns: 250 },
    );
  });
});
