import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryDashboard } from "../components/content/library-dashboard.client";
import { PublishedDecksDashboard } from "../components/content/published-decks-dashboard.client";
import { WorkspaceNavigation } from "../components/content/workspace-navigation.client";
import {
  activeDeck,
  archivedDeck,
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

  it("renders one compact empty state with one primary New deck action and no zero metrics", async () => {
    const user = userEvent.setup();
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={emptyLibrarySnapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    expect(screen.getByText("Welcome back, Ari.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Create your first deck" })).toBeVisible();
    expect(screen.getByText("Start with a subject you want to remember.")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "New deck" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "New deck" })).toHaveAttribute(
      "href",
      "/app/decks/new",
    );
    expect(screen.queryByLabelText("Library totals")).not.toBeInTheDocument();
    expect(screen.queryByText("Generated cards")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create folder" }));
    expect(screen.getByRole("dialog", { name: "Create a folder" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Folder name" })).toBeRequired();
  });

  it("shows stored decks, folders, counts, search, status, and presentation controls", async () => {
    const user = userEvent.setup();
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={populatedLibrarySnapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    expect(screen.getByText("Welcome back, Ari.")).toBeVisible();
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
    const allFilter = screen.getByRole("radio", { name: "All" });
    await user.click(allFilter);
    expect(allFilter).toHaveAttribute("data-state", "checked");
    const publishedFilter = screen.getByRole("radio", { name: "Published" });
    publishedFilter.focus();
    await user.keyboard(" ");
    expect(publishedFilter).toHaveAttribute("data-state", "checked");

    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/Edited 7\/15\/2026/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /^Biology1$/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Languages1$/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Choose a card type" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New deck" })).toHaveAttribute(
      "href",
      "/app/decks/new",
    );
  });

  it("reuses a folder creation key when the first response is lost", async () => {
    const folder = populatedLibrarySnapshot.folders[0]!;
    const fetchMock = vi
      .fn()
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

    await user.click(screen.getByRole("button", { name: "Create folder" }));
    await user.type(screen.getByRole("textbox", { name: "Folder name" }), "Science");
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    expect(await screen.findByText("folder response lost")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys[0]).toBe(keys[1]);
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
    expect(screen.queryByRole("link", { name: "New deck" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /folder/i })).not.toBeInTheDocument();
  });

  it("renders only the bounded recent slice while reporting exact 250-plus totals", () => {
    const snapshot = largeLibrarySnapshot(260);
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={snapshot} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing most recently edited 200 of 260 decks.",
    );
    expect(screen.getAllByRole("link", { name: /Deck \d{3}/i })).toHaveLength(200);
    expect(screen.getByLabelText("Library totals")).toHaveTextContent("260 decks");
    expect(screen.queryByRole("link", { name: /Deck 201/i })).not.toBeInTheDocument();
  });

  it("surfaces a published area and a dedicated published workspace link", () => {
    render(<LibraryDashboard canCreate learnerName="Ari" snapshot={populatedLibrarySnapshot} />);

    expect(screen.getByRole("link", { name: "1 published" })).toHaveAttribute(
      "href",
      "/app/published",
    );
  });
});

describe("workspace content navigation", () => {
  it("makes the library the canonical workspace destination", () => {
    render(<WorkspaceNavigation selfMode />);

    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Published" })).toHaveAttribute(
      "href",
      "/app/published",
    );
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

describe("published decks dashboard", () => {
  const publicDeck = {
    ...activeDeck,
    publicId: "0190d9f0-0000-7000-8000-000000000099",
    publicSlug: "cell-biology",
    visibility: "public" as const,
  };

  it("offers direct player, copy, manage, visibility filter, and unpublish actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<PublishedDecksDashboard initialDecks={[publicDeck, archivedDeck]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Published" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Open player" })[0]).toHaveAttribute(
      "href",
      "/deck/cell-biology",
    );
    expect(screen.getAllByRole("link", { name: "Manage" })[0]).toHaveAttribute(
      "href",
      `/app/decks/${publicDeck.id}/settings`,
    );

    await user.click(screen.getAllByRole("button", { name: "Copy link" })[0]!);
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/deck/cell-biology");
    expect(await screen.findByText("Link copied for Cell biology.")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Unlisted" }));
    expect(screen.getByRole("heading", { level: 3, name: "Spanish verbs" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Cell biology" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(screen.getByRole("dialog", { name: "Unpublish Spanish verbs?" })).toBeVisible();
    expect(screen.getByText(/public link will stop working/i)).toBeVisible();
  });
});
