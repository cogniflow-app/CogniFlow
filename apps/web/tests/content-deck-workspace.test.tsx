import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BulkQuickEditor,
  DeckCommandBar,
  DeckSettingsEditor,
  NoteCardBrowser,
  VersionHistory,
} from "../components/content/deck-workspace.client";
import { DeckNavigation } from "../components/content/deck-navigation.client";
import { activeDeck, deckDetail } from "./fixtures/content";

const navigation = vi.hoisted(() => ({
  pathname: `/app/decks/0190d9f0-0000-7000-8000-000000000011`,
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

function mutationResponse(data: unknown = activeDeck): Response {
  return new Response(JSON.stringify({ data, status: "updated" }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

describe("deck authoring workspace", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.refresh.mockReset();
    navigation.replace.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renames through an optimistic-version command and refreshes stored data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mutationResponse({ ...activeDeck, version: 5 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeckCommandBar deck={activeDeck} />);

    const title = screen.getByRole("textbox", { name: "Deck title" });
    await user.clear(title);
    await user.type(title, "Molecular cell biology");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/content/decks/${activeDeck.id}`,
      expect.objectContaining({
        body: expect.stringContaining('"expectedVersion":4'),
        method: "PATCH",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"title":"Molecular cell biology"');
    expect(await screen.findByText("Update complete.")).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("reuses a duplicate key after a lost response and keeps typed conflict recovery actionable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(mutationResponse({ ...activeDeck, id: "duplicate-deck", version: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeckCommandBar deck={activeDeck} />);

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByText("response lost")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys[0]).toBe(keys[1]);
    expect(navigation.push).toHaveBeenCalledWith("/app/decks/duplicate-deck/edit");
  });

  it("shows the current conflict version and a reload action for deck commands", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "CONFLICT",
            currentVersion: 9,
            message: "Deck changed.",
            retryable: false,
          }),
          { headers: { "Content-Type": "application/json" }, status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    const view = render(<DeckCommandBar deck={activeDeck} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText(/now at version 9/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload current deck" }));
    expect(navigation.refresh).toHaveBeenCalledOnce();

    view.rerender(<DeckCommandBar deck={{ ...activeDeck, title: "Server title", version: 9 }} />);
    expect(screen.getByRole("textbox", { name: "Deck title" })).toHaveValue("Server title");
    expect(screen.queryByRole("button", { name: "Reload current deck" })).toBeNull();
  });

  it.each([
    {
      absent: ["Restore"],
      deck: activeDeck,
      present: ["Rename", "Duplicate", "Archive", "Delete"],
    },
    {
      absent: ["Duplicate", "Archive", "Restore", "Delete"],
      deck: { ...activeDeck, role: "manager" as const },
      present: ["Rename"],
    },
    {
      absent: ["Duplicate", "Archive", "Restore", "Delete"],
      deck: { ...activeDeck, role: "editor" as const },
      present: ["Rename"],
    },
    {
      absent: ["Rename", "Duplicate", "Archive", "Restore", "Delete"],
      deck: { ...activeDeck, role: "viewer" as const },
      present: [],
    },
    {
      absent: ["Rename", "Archive"],
      deck: { ...activeDeck, status: "archived" as const },
      present: ["Duplicate", "Restore", "Delete"],
    },
    {
      absent: ["Rename", "Duplicate", "Archive", "Restore", "Delete"],
      deck: { ...activeDeck, role: "manager" as const, status: "archived" as const },
      present: [],
    },
  ])(
    "shows only RPC-authorized commands for $deck.role/$deck.status",
    ({ absent, deck, present }) => {
      render(<DeckCommandBar deck={deck} />);

      for (const label of present)
        expect(screen.getByRole("button", { name: label })).toBeVisible();
      for (const label of absent) expect(screen.queryByRole("button", { name: label })).toBeNull();
    },
  );

  it("describes deck deletion truthfully as distinct from reversible archive", async () => {
    const user = userEvent.setup();
    render(<DeckCommandBar deck={activeDeck} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog", { name: "Delete this deck?" })).toHaveTextContent(
      /not restorable here/i,
    );
    expect(screen.getByRole("dialog", { name: "Delete this deck?" })).toHaveTextContent(
      /Archive instead/i,
    );
    expect(screen.queryByText(/restore it from the archived view/i)).toBeNull();
  });

  it.each([
    { role: "owner" as const, status: "active" as const, notes: true, settings: true },
    { role: "manager" as const, status: "active" as const, notes: true, settings: true },
    { role: "editor" as const, status: "active" as const, notes: true, settings: false },
    { role: "viewer" as const, status: "active" as const, notes: false, settings: false },
    { role: "owner" as const, status: "archived" as const, notes: false, settings: false },
  ])("filters deck tabs for $role/$status", ({ notes, role, settings, status }) => {
    render(<DeckNavigation deck={{ id: activeDeck.id, role, status }} />);

    expect(screen.getByRole("link", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Card previews" })).toBeVisible();
    expect(screen.getByRole("link", { name: "History" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Cards" }) !== null).toBe(notes);
    expect(screen.queryByRole("link", { name: "Settings" }) !== null).toBe(settings);
  });

  it("saves only complete quick-add rows and preserves partial drafts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mutationResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<BulkQuickEditor deckId={activeDeck.id} />);

    expect(screen.getByRole("table", { name: "Quick card rows" })).toHaveAttribute(
      "aria-rowcount",
      "4",
    );
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.getAllByRole("cell")).toHaveLength(12);

    await user.click(screen.getByRole("button", { name: "Save complete rows" }));
    expect(screen.getByText("Enter a front and back for at least one row.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Row 1 front" }), "What is ATP?");
    await user.type(
      screen.getByRole("textbox", { name: "Row 1 back" }),
      "The cell's energy carrier",
    );
    await user.type(screen.getByRole("textbox", { name: "Row 1 tags" }), "cells, energy");
    await user.type(screen.getByRole("textbox", { name: "Row 2 front" }), "Incomplete row");
    await user.click(screen.getByRole("button", { name: "Save complete rows" }));

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(`/api/content/decks/${activeDeck.id}/notes/bulk`);
    const options = request?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(options?.body)) as {
      notes: readonly { authoringData: { kind: string }; tags: readonly string[] }[];
    };
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toMatchObject({
      authoringData: { kind: "basic" },
      tags: ["cells", "energy"],
    });
    expect(await screen.findByText("1 card saved.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Row 1 front" })).toHaveValue("Incomplete row");
    expect(screen.getByRole("textbox", { name: "Row 1 back" })).toHaveValue("");
    expect(screen.getAllByRole("textbox", { name: /Row \d+ front/ })).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "Row 2 front" })).toHaveValue("");
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("filters notes, exposes generated cards, and provides keyboard-addressable bulk selection", async () => {
    const user = userEvent.setup();
    render(<NoteCardBrowser deck={deckDetail} />);

    expect(screen.getByRole("heading", { name: "Card entries and previews" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "What is ATP?" })).toBeVisible();
    expect(screen.getByLabelText("1 card previews")).toHaveTextContent("What is ATP?");
    expect(screen.getByLabelText("1 card previews")).toHaveTextContent(
      "The cell's usable energy carrier",
    );
    expect(screen.getByLabelText("1 card previews")).toHaveTextContent("Entry: What is ATP?");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/app/decks/${deckDetail.id}/edit?note=${deckDetail.notes[0]!.id}`,
    );
    expect(screen.queryByRole("link", { name: "Add cards" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select What is ATP?" }));
    expect(screen.getByRole("region", { name: "Bulk card actions" })).toHaveTextContent(
      "1 selected",
    );
    await user.type(screen.getByRole("searchbox", { name: "Search within deck" }), "missing");
    expect(screen.getByText("No cards match these filters.")).toBeVisible();
  });

  it("keeps an archived deck browser read-only even for its owner", () => {
    render(<NoteCardBrowser deck={{ ...deckDetail, status: "archived" }} />);

    expect(screen.queryByRole("link", { name: "Add cards" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Select What is ATP?" })).toBeNull();
  });

  it("bulk-tags and moves versioned notes through atomic action requests", async () => {
    const target = {
      id: "0190d9f0-0000-7000-8000-000000000099",
      title: "Biochemistry",
    };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(mutationResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteCardBrowser deck={deckDetail} editableTargetDecks={[target]} />);

    await user.click(screen.getByRole("checkbox", { name: "Select What is ATP?" }));
    await user.type(screen.getByRole("textbox", { name: "Tags to add" }), "Exam, Energy");
    await user.type(screen.getByRole("textbox", { name: "Tags to remove" }), "cells");
    await user.click(screen.getByRole("button", { name: "Apply tags" }));

    const tagOptions = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/content/decks/${deckDetail.id}/notes/bulk-actions`,
    );
    expect(tagOptions?.method).toBe("POST");
    expect(JSON.parse(String(tagOptions?.body))).toMatchObject({
      action: "tag",
      addTags: ["exam", "energy"],
      notes: [{ expectedVersion: 3, id: deckDetail.notes[0]!.id }],
      removeTags: ["cells"],
    });
    expect(await screen.findByText("Tags updated on 1 card.")).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Select What is ATP?" }));
    await user.click(screen.getByRole("combobox", { name: "Move to deck" }));
    await user.click(screen.getByRole("option", { name: "Biochemistry" }));
    await user.click(screen.getByRole("button", { name: "Move cards" }));

    const moveOptions = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(moveOptions?.body))).toMatchObject({
      action: "move",
      notes: [{ expectedVersion: 3, id: deckDetail.notes[0]!.id }],
      targetDeckId: target.id,
    });
    expect(await screen.findByText("1 card moved to Biochemistry.")).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps publication explicit and links to the frozen public projection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mutationResponse({ ...deckDetail, publicId: null }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeckSettingsEditor deck={deckDetail} />);

    expect(screen.getByText(/choose how this deck looks/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open public preview" })).toHaveAttribute(
      "href",
      "/deck/cell-energy",
    );
    await user.click(screen.getByRole("button", { name: "Unpublish" }));

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      action: "unpublish",
      coverAssetId: deckDetail.coverAssetId,
      description: deckDetail.descriptionPlain,
      languageBack: deckDetail.languageBack,
      languageFront: deckDetail.languageFront,
      license: deckDetail.license,
      theme: deckDetail.theme,
    });
    expect(payload).not.toHaveProperty("visibility");
    expect(await screen.findByText("Deck unpublished.")).toBeVisible();
  });

  it("shares a publication version with owner lifecycle commands", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mutationResponse({ ...deckDetail, publicId: null, version: 6 }))
      .mockResolvedValueOnce(
        mutationResponse({ ...deckDetail, publicId: null, status: "deleted", version: 7 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <>
        <DeckCommandBar deck={deckDetail} />
        <DeckSettingsEditor deck={deckDetail} />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    await screen.findByText("Deck unpublished.");
    await user.click(screen.getByRole("button", { name: /^Delete$/u }));
    await user.click(screen.getByRole("button", { name: "Delete deck" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"expectedVersion":6');
  });

  it("saves metadata without falsely treating visibility as a stored detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mutationResponse({ ...deckDetail, version: 5 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeckSettingsEditor deck={deckDetail} />);

    await user.click(screen.getByRole("button", { name: "Save settings" }));

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      action: "update",
      description: deckDetail.descriptionPlain,
      expectedVersion: deckDetail.version,
      languageBack: deckDetail.languageBack,
      languageFront: deckDetail.languageFront,
      license: deckDetail.license,
      theme: deckDetail.theme,
    });
    expect(payload).not.toHaveProperty("visibility");
    expect(
      await screen.findByText(
        "Deck details saved. Publication visibility changes when you publish or unpublish.",
      ),
    ).toBeVisible();
  });

  it("sends pending metadata and visibility when refreshing a publication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mutationResponse({ ...deckDetail, version: 6 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeckSettingsEditor deck={deckDetail} />);

    await user.click(screen.getByRole("button", { name: "Update published version" }));

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      action: "publish",
      coverAssetId: deckDetail.coverAssetId,
      description: deckDetail.descriptionPlain,
      languageBack: deckDetail.languageBack,
      languageFront: deckDetail.languageFront,
      license: deckDetail.license,
      theme: deckDetail.theme,
      visibility: deckDetail.visibility,
    });
    expect(await screen.findByText("Published deck updated.")).toBeVisible();
  });

  it("replaces stale settings with the refreshed server snapshot after a conflict", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "CONFLICT",
          currentVersion: 9,
          message: "Deck changed.",
          retryable: false,
        }),
        { headers: { "Content-Type": "application/json" }, status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = render(<DeckSettingsEditor deck={deckDetail} />);

    await user.clear(screen.getByRole("textbox", { name: "Description" }));
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Stale local edit");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/now at version 9/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload current deck" }));

    view.rerender(
      <DeckSettingsEditor
        deck={{
          ...deckDetail,
          descriptionPlain: "Authoritative server description",
          theme: "forest",
          version: 9,
        }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Authoritative server description",
    );
    expect(screen.getByRole("combobox", { name: "Deck theme" })).toHaveTextContent("Forest");
    expect(screen.queryByRole("button", { name: "Reload current deck" })).toBeNull();
  });

  it("shows immutable version snapshots and restores as a new version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mutationResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<VersionHistory deck={deckDetail} />);

    expect(screen.getByText("Version 4")).toBeVisible();
    expect(screen.getByText("Version 1")).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "View diff" })[1]!);
    expect(screen.getByRole("dialog", { name: "Version 1" })).toBeVisible();
    expect(screen.getByText("Card entries added since this version")).toBeVisible();
    expect(screen.getByText("Card entries removed since this version")).toBeVisible();
    expect(screen.getByText("Card entries changed since this version")).toBeVisible();
    expect(screen.getByText(/Scheduling impact/i)).toBeVisible();
    expect(screen.getByRole("list", { name: "Card content changes" })).toHaveTextContent(
      "What is ATP?",
    );
    expect(screen.getByRole("region", { name: "Current deck" })).toHaveTextContent(
      "The cell's usable energy carrier",
    );
    expect(screen.getByRole("region", { name: "Version 1" })).toHaveTextContent(
      "not present in version 1",
    );
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getAllByRole("button", { name: "Restore" })[1]!);

    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"action":"restore_version"');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"versionNumber":1');
    expect(await screen.findByText("Version 1 restored as a new current version.")).toBeVisible();
  });

  it.each([
    { role: "editor" as const, status: "active" as const },
    { role: "manager" as const, status: "archived" as const },
    { role: "viewer" as const, status: "active" as const },
  ])("keeps version restoration hidden for $role/$status", ({ role, status }) => {
    render(<VersionHistory deck={{ ...deckDetail, role, status }} />);

    expect(screen.getAllByRole("button", { name: "View diff" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});
