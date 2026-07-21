import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  headers: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/server", () => ({
  createNextServerDatabaseClient: mocks.createClient,
}));

import { HeaderAccountActionLink } from "../components/header-account-action";
import {
  createPublicViewerContext,
  loadOwnedPublicDeckId,
  loadPublicViewerContext,
  normalizePublicReturnUrl,
} from "../lib/server/public-viewer";
import { config as middlewareConfig } from "../middleware";

describe("public viewer context", () => {
  beforeEach(() => {
    const query = {
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      select: mocks.select,
    };
    mocks.eq.mockReset().mockReturnValue(query);
    mocks.from.mockReset().mockReturnValue(query);
    mocks.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.select.mockReset().mockReturnValue(query);
    mocks.headers.mockResolvedValue({ get: () => "/join/ABCDEF?source=host" });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("keeps only safe public return destinations", () => {
    expect(normalizePublicReturnUrl("/deck/cells?mode=preview#front")).toBe(
      "/deck/cells?mode=preview#front",
    );
    expect(normalizePublicReturnUrl("/join/../app/settings")).toBe("/");
    expect(normalizePublicReturnUrl("/api/private")).toBe("/");
    expect(normalizePublicReturnUrl("https://attacker.example/steal")).toBe("/");
    expect(normalizePublicReturnUrl("/%252f%252fattacker.example")).toBe("/");
  });

  it("forwards the request path for each public-shell route family", () => {
    expect(middlewareConfig.matcher).toEqual(
      expect.arrayContaining([
        "/",
        "/copyright/:path*",
        "/creator/:path*",
        "/deck/:path*",
        "/discover/:path*",
        "/embed/deck/:path*",
        "/join/:path*",
        "/privacy/:path*",
        "/safety/:path*",
        "/terms/:path*",
      ]),
    );
  });

  it("resolves an anonymous request to return-aware account links", async () => {
    await expect(loadPublicViewerContext()).resolves.toEqual({
      accountHref: "/app",
      authenticated: false,
      intendedReturnTo: "/join/ABCDEF?source=host",
      signInHref: "/auth/sign-in?returnTo=%2Fjoin%2FABCDEF%3Fsource%3Dhost",
      signUpHref: "/auth/sign-up?returnTo=%2Fjoin%2FABCDEF%3Fsource%3Dhost",
    });
  });

  it("fails the public identity projection closed when Auth is unavailable", async () => {
    mocks.createClient.mockRejectedValue(new Error("offline"));

    await expect(loadPublicViewerContext("/join")).resolves.toMatchObject({
      authenticated: false,
      intendedReturnTo: "/join/ABCDEF?source=host",
    });
  });

  it("returns a manageable deck id only through a verified owner-filtered lookup", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "account-id" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { id: "internal-deck-id" }, error: null });

    await expect(loadOwnedPublicDeckId("public-deck-id")).resolves.toBe("internal-deck-id");
    expect(mocks.from).toHaveBeenCalledWith("decks");
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "public_id", "public-deck-id");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "owner_account_id", "account-id");
  });

  it("does not attempt an ownership lookup for an anonymous viewer", async () => {
    await expect(loadOwnedPublicDeckId("public-deck-id")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("renders the workspace action for a verified account", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "account-id" } }, error: null });
    const viewer = await loadPublicViewerContext();

    render(<HeaderAccountActionLink viewer={viewer} />);

    expect(screen.getByRole("link", { name: "Open your workspace" })).toHaveAttribute(
      "href",
      "/app",
    );
  });

  it("renders a safe return-aware sign-in action for a visitor", () => {
    const viewer = createPublicViewerContext(false, "/auth/sign-in", "/privacy");

    render(<HeaderAccountActionLink viewer={viewer} />);

    expect(screen.getByRole("link", { name: "Sign in to your account" })).toHaveAttribute(
      "href",
      "/auth/sign-in?returnTo=%2Fprivacy",
    );
  });
});
