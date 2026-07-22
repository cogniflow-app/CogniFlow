import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTrustedMutationRequest,
  createRateLimitSubject,
  RequestSecurityError,
} from "../lib/server/request-security";

function mutationRequest(headers: HeadersInit = {}): Request {
  return new Request("http://127.0.0.1:3100/api/settings/profile", {
    headers,
    method: "POST",
  });
}

describe("mutation request security", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a same-origin browser mutation", () => {
    expect(() =>
      assertTrustedMutationRequest(
        mutationRequest({ origin: "http://127.0.0.1:3100", "sec-fetch-site": "same-origin" }),
      ),
    ).not.toThrow();
  });

  it("rejects missing, cross-origin, and non-mutation requests", () => {
    expect(() => assertTrustedMutationRequest(mutationRequest())).toThrow(RequestSecurityError);
    expect(() =>
      assertTrustedMutationRequest(
        mutationRequest({ origin: "https://attacker.example", "sec-fetch-site": "cross-site" }),
      ),
    ).toThrow(/origin/u);
    expect(() =>
      assertTrustedMutationRequest(
        new Request("http://127.0.0.1:3100/api/settings/profile", {
          headers: { origin: "http://127.0.0.1:3100" },
        }),
      ),
    ).toThrow(/accepted/u);
  });

  it("hashes rate-limit subjects without returning a network address", async () => {
    const subject = await createRateLimitSubject(
      mutationRequest({ "x-forwarded-for": "203.0.113.8, 10.0.0.4" }),
      "auth.sign_in",
    );
    expect(subject).toMatch(/^[a-f0-9]{64}$/u);
    expect(subject).not.toContain("203.0.113.8");
  });

  it("ignores client-forged forwarding headers outside a trusted deployment edge", async () => {
    vi.stubEnv("DEPLOYMENT_PROFILE", "local");
    const first = await createRateLimitSubject(
      mutationRequest({ "x-forwarded-for": "203.0.113.8" }),
      "auth.sign_in",
    );
    const second = await createRateLimitSubject(
      mutationRequest({ "x-forwarded-for": "198.51.100.4" }),
      "auth.sign_in",
    );
    expect(first).toBe(second);
  });

  it("isolates reserved network fixtures inside the explicit test deployment profile", async () => {
    vi.stubEnv("DEPLOYMENT_PROFILE", "test");
    const first = await createRateLimitSubject(
      mutationRequest({ "x-forwarded-for": "192.0.2.8" }),
      "auth.sign_in",
    );
    const second = await createRateLimitSubject(
      mutationRequest({ "x-forwarded-for": "192.0.2.9" }),
      "auth.sign_in",
    );
    expect(first).not.toBe(second);
  });
});
