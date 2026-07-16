// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRequestRateLimit: vi.fn(),
  databaseRpc: vi.fn(),
}));

vi.mock("@lumen/database/server", () => ({
  createPrivilegedDatabaseClient: () => ({ rpc: mocks.databaseRpc }),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  consumeRequestRateLimit: mocks.consumeRequestRateLimit,
}));

import { POST } from "../app/api/guest/join/route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://127.0.0.1:3100/api/guest/join", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3100",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-For": "203.0.113.42",
    },
    method: "POST",
  });
}

describe("guest join route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    mocks.consumeRequestRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rate-limits and neutrally rejects an unknown production room without writing a guest", async () => {
    const response = await POST(request({ customNickname: "", joinCode: "ABCDEF" }));
    const body: unknown = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringMatching(/room is not available/i),
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.consumeRequestRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, scope: "guest_join_attempt", windowSeconds: 900 }),
    );
    expect(mocks.databaseRpc).not.toHaveBeenCalled();
  });

  it("validates malformed input only after applying the attempt limit", async () => {
    const response = await POST(request({ joinCode: "bad" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.consumeRequestRateLimit).toHaveBeenCalledOnce();
    expect(mocks.databaseRpc).not.toHaveBeenCalled();
  });

  it("returns a retry window when the pseudonymous network bucket is exhausted", async () => {
    mocks.consumeRequestRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 37,
    });

    const response = await POST(request({ joinCode: "ABCDEF" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(mocks.databaseRpc).not.toHaveBeenCalled();
  });
});
