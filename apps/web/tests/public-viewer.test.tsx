import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/server", () => ({
  createNextServerDatabaseClient: mocks.createClient,
}));

import { HeaderAccountActionLink } from "../components/header-account-action";
import {
  createPublicViewerContext,
  loadPublicViewerContext,
  normalizePublicReturnUrl,
} from "../lib/server/public-viewer";
import { config as middlewareConfig } from "../middleware";

describe("public viewer context", () => {
  beforeEach(() => {
    mocks.headers.mockResolvedValue({ get: () => "/join/ABCDEF?source=host" });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
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
