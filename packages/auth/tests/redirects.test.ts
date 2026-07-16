import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isSafeAuthenticationReturnUrl,
  isSafeRelativeReturnUrl,
  normalizeAuthenticationReturnUrl,
  normalizeReturnUrl,
  returnUrlInputSchema,
} from "../src/redirects";

describe("safe return URL normalization", () => {
  it.each([
    "https://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/%2f%2fattacker.example/path",
    "/%255c%255cattacker.example/path",
    "/%2e%2e//attacker.example/path",
    "/a/..//attacker.example/path",
    "/%2e%2e/%2f%2fattacker.example/path",
    "/app%0d%0aLocation:%20https://attacker.example",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (candidate) => {
    expect(normalizeReturnUrl(candidate)).toBe("/app");
  });

  it("preserves and canonicalizes a valid relative destination", () => {
    expect(normalizeReturnUrl(" /app/../app/settings?tab=privacy#export ")).toBe(
      "/app/settings?tab=privacy#export",
    );
    expect(isSafeRelativeReturnUrl("/app/settings")).toBe(true);
  });

  it("never trusts an unsafe fallback", () => {
    expect(normalizeReturnUrl(undefined, "https://attacker.example")).toBe("/app");
  });

  it.each([
    "/auth",
    "/auth/sign-in?returnTo=%2Fauth%2Fsign-in",
    "/onboarding",
    "/onboarding?returnTo=%2Fonboarding",
    "/api/auth/password",
    "/_next/static/chunk.js",
    "/safe/../auth/callback",
    "/%2561uth%252fcallback",
  ])("rejects the authentication lifecycle return %s to prevent loops", (candidate) => {
    expect(normalizeAuthenticationReturnUrl(candidate)).toBe("/app");
    expect(isSafeAuthenticationReturnUrl(candidate)).toBe(false);
    expect(returnUrlInputSchema.parse(candidate)).toBe("/app");
  });

  it.each([
    "/app",
    "/app/library?view=grid",
    "/deck/public-deck#preview",
    "/join/ABCDEF",
    "/privacy",
    "/",
  ])("preserves the authorized product return %s", (candidate) => {
    expect(normalizeAuthenticationReturnUrl(candidate)).toBe(candidate);
    expect(isSafeAuthenticationReturnUrl(candidate)).toBe(true);
  });

  it("never accepts a lifecycle fallback", () => {
    expect(normalizeAuthenticationReturnUrl(undefined, "/auth/sign-in")).toBe("/app");
  });

  it("normalizes every arbitrary string to the fixed same origin", () => {
    fc.assert(
      fc.property(fc.string(), (candidate) => {
        const normalized = normalizeReturnUrl(candidate);
        const parsed = new URL(normalized, "https://return.invalid");

        expect(normalized.startsWith("/")).toBe(true);
        expect(normalized.startsWith("//")).toBe(false);
        expect(normalized.includes("\\")).toBe(false);
        expect(parsed.origin).toBe("https://return.invalid");
      }),
      { numRuns: 500 },
    );
  });

  it("always produces a normalized path through the schema", () => {
    fc.assert(
      fc.property(fc.anything(), (candidate) => {
        expect(returnUrlInputSchema.parse(candidate)).toMatch(/^\/(?!\/)/u);
      }),
      { numRuns: 250 },
    );
  });
});
