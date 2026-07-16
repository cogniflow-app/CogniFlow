import { describe, expect, it } from "vitest";

import {
  createOpaqueToken,
  hmacSha256Hex,
  sha256Hex,
  signCompactPayload,
  verifyCompactPayload,
} from "../lib/server/crypto";

describe("server cryptographic helpers", () => {
  it("creates opaque, URL-safe tokens with independent entropy", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    expect(second).not.toBe(first);
  });

  it("rejects unsafe token byte lengths", () => {
    expect(() => createOpaqueToken(8)).toThrow(/length/u);
    expect(() => createOpaqueToken(16.5)).toThrow(/length/u);
  });

  it("produces stable SHA-256 and keyed HMAC digests", async () => {
    await expect(sha256Hex("profile-session")).resolves.toHaveLength(64);
    const first = await hmacSha256Hex("subject", "a sufficiently long test-only key");
    const second = await hmacSha256Hex("subject", "a sufficiently long test-only key");
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("round-trips a compact payload and rejects tampering", async () => {
    const key = "test-only-signing-key-that-is-more-than-32-bytes";
    const token = await signCompactPayload('{"guestId":"guest-1"}', key);
    await expect(verifyCompactPayload(token, key)).resolves.toBe('{"guestId":"guest-1"}');

    const [payload, signature] = token.split(".");
    await expect(verifyCompactPayload(`${payload}x.${signature}`, key)).resolves.toBeNull();
    await expect(verifyCompactPayload(`${payload}.${signature}x`, key)).resolves.toBeNull();
    await expect(verifyCompactPayload("malformed", key)).resolves.toBeNull();
  });
});
