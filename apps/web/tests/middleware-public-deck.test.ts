// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRouteDatabaseClient: vi.fn(),
  getClaims: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@lumen/database/route", () => ({
  createRouteDatabaseClient: mocks.createRouteDatabaseClient,
}));

import { middleware, publicDeckLookupFromPathname } from "../middleware";

describe("public deck middleware status boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.createRouteDatabaseClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims },
      rpc: mocks.rpc,
    });
  });

  it.each([
    ["/deck/cell-energy-a1b2c3d4", "slug", "cell-energy-a1b2c3d4"],
    [
      "/embed/deck/946e38d2-4951-42c6-b289-b49d408c836d",
      "public_id",
      "946e38d2-4951-42c6-b289-b49d408c836d",
    ],
  ] as const)("parses the exact public route %s", (pathname, kind, identifier) => {
    expect(publicDeckLookupFromPathname(pathname)).toEqual({ identifier, kind });
  });

  it("rewrites a missing public projection to the branded not-found route with HTTP 404", async () => {
    const response = await middleware(
      new NextRequest("https://preview.example.test/deck/missing-public-deck"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://preview.example.test/__lumen-publication-not-found",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_deck_by_slug", {
      p_slug: "missing-public-deck",
    });
  });

  it("continues to the page when an exact public projection exists", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { public_id: "published" }, error: null });

    const response = await middleware(
      new NextRequest(
        "https://preview.example.test/embed/deck/946e38d2-4951-42c6-b289-b49d408c836d",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_deck", {
      p_public_id: "946e38d2-4951-42c6-b289-b49d408c836d",
    });
  });

  it("fails a malformed exact-link identifier closed without querying the database", async () => {
    const response = await middleware(
      new NextRequest("https://preview.example.test/embed/deck/not-a-public-id"),
    );

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
