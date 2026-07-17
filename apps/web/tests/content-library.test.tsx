import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryDashboard } from "../components/content/library-dashboard.client";
import { WorkspaceNavigation } from "../components/content/workspace-navigation.client";
import {
  emptyLibrarySnapshot,
  largeLibrarySnapshot,
  populatedLibrarySnapshot,
} from "./fixtures/content";

const navigation = vi.hoisted(() => ({
  pathname: "/app",
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: navigation.push,
    refresh: navigation.refresh,
  }),
}));

describe("content library dashboard", () => {
  beforeEach(() => {
    navigation.pathname = "/app";
    navigation.push.mockReset();
    navigation.refresh.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders a truthful educational empty state with real creation actions", async () => {
    const user = userEvent.setup();
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={emptyLibrarySnapshot} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "A clear place to build, Ari." }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Create your first deck" })).toBeVisible();
    expect(screen.getByText(/each note can generate one or more sibling cards/i)).toBeVisible();
    expect(screen.getByText(/pick a card type/i)).toBeVisible();
    expect(screen.queryByText(/your authorized account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /current boundary/i })).not.toBeInTheDocument();

    const totals = screen.getByRole("region", { name: "Library totals" });
    expect(within(totals).getAllByText("0")).toHaveLength(5);

    await user.click(screen.getAllByRole("button", { name: "Create deck" })[0]!);
    expect(screen.getByRole("dialog", { name: "Create a deck" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Deck title" })).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await user.click(screen.getAllByRole("button", { name: /new folder|create folder/i })[0]!);
    expect(screen.getByRole("dialog", { name: "Create a folder" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Folder name" })).toBeRequired();
  });

  it("shows stored decks, folders, counts, search, status, and presentation controls", async () => {
    const user = userEvent.setup();
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={populatedLibrarySnapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Ari." })).toBeVisible();
    expect(screen.getByRole("link", { name: /Cell biology/i })).toHaveAttribute(
      "href",
      `/app/decks/${populatedLibrarySnapshot.decks[0]!.id}`,
    );
    expect(screen.queryByRole("link", { name: /Spanish verbs/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.type(screen.getByRole("searchbox", { name: "Search decks" }), "missing");
    expect(
      screen.getByRole("heading", { level: 3, name: "No decks match this view" }),
    ).toBeVisible();

    await user.clear(screen.getByRole("searchbox", { name: "Search decks" }));
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/Edited 7\/16\/2026/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /^Biology1$/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Languages1$/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "Choose a card type" })).toHaveAttribute(
      "href",
      "/app/decks/new",
    );
  });

  it("reuses deck and folder creation keys when their first responses are lost", async () => {
    const deck = populatedLibrarySnapshot.decks[0]!;
    const folder = populatedLibrarySnapshot.folders[0]!;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("deck response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: deck, status: "created" }), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        }),
      )
      .mockRejectedValueOnce(new TypeError("folder response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: folder, status: "created" }), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={emptyLibrarySnapshot} />);

    await user.click(screen.getAllByRole("button", { name: "Create deck" })[0]!);
    await user.type(screen.getByRole("textbox", { name: "Deck title" }), "Biology");
    await user.click(screen.getByRole("button", { name: "Create and add notes" }));
    expect(await screen.findByText("deck response lost")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create and add notes" }));

    await user.click(screen.getAllByRole("button", { name: /new folder|create folder/i })[0]!);
    await user.type(screen.getByRole("textbox", { name: "Folder name" }), "Science");
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    expect(await screen.findByText("folder response lost")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it("keeps content creation controls out of a managed learner session", () => {
    render(
      <LibraryDashboard
        canCreate={false}
        learnerName="Managed learner"
        snapshot={emptyLibrarySnapshot}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "No decks are available in this learner profile",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/guardian or educator can make authorized content available/i),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create deck" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /folder/i })).not.toBeInTheDocument();
  });

  it("renders only the bounded recent slice while reporting exact 250-plus totals", () => {
    const snapshot = largeLibrarySnapshot(260);
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={snapshot} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing most recently edited 200 of 260 decks.",
    );
    expect(screen.getAllByRole("link", { name: /Deck \d{3}/i })).toHaveLength(200);
    expect(screen.getByText("260")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Deck 201/i })).not.toBeInTheDocument();
  });
});

describe("workspace content navigation", () => {
  it("makes the library the canonical workspace destination", () => {
    render(<WorkspaceNavigation selfMode />);

    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "All decks" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/app/settings/profile",
    );
  });

  it("does not expose account settings inside a managed learner workspace", () => {
    render(<WorkspaceNavigation selfMode={false} />);

    expect(screen.getByRole("link", { name: "Library" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
  });
});
