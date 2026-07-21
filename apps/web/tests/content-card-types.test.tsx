import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARD_SCHEMA_VERSION,
  type CustomCardData,
  type DrawingReferenceLayer,
  type DrawingStroke,
  type RichDocument,
} from "@lumen/domain";

import { NewDeckWizard } from "../components/content/new-deck-wizard.client";
import { NoteEditor } from "../components/content/note-editor.client";
import { CARD_TYPE_DESCRIPTORS } from "../lib/content/card-types";
import { CARD_TYPE_CODES, type CardTypeCode, type NoteSummary } from "../lib/content/view-models";
import { deckDetail } from "./fixtures/content";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("../components/content/rich-editor.client", () => ({
  RichEditor: ({
    document,
    label,
    onChange,
  }: {
    document: unknown;
    label: string;
    onChange: (document: unknown) => void;
  }) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        data-document={JSON.stringify(document)}
        onChange={(event) =>
          onChange({
            attrs: { language: "en" },
            content: [
              {
                content: [{ text: event.target.value, type: "text" }],
                type: "paragraph",
              },
            ],
            schemaVersion: 2,
            type: "doc",
          })
        }
      />
    </label>
  ),
}));

vi.mock("../components/content/media-uploader.client", () => ({
  MediaUploader: ({
    kind,
    label,
    onUploaded,
  }: {
    kind: "audio" | "image";
    label: string;
    onUploaded: (asset: {
      altText: string;
      id: string;
      kind: "audio" | "image";
      mimeType: string;
      signedUrl: string | null;
      transcript: string;
    }) => void;
  }) => (
    <section aria-label={label}>
      <p>{label}</p>
      <button
        onClick={() =>
          onUploaded({
            altText: kind === "image" ? "Uploaded drawing reference" : "",
            id: "0190d9f0-0000-7000-8000-000000000099",
            kind,
            mimeType: kind === "image" ? "image/png" : "audio/mpeg",
            signedUrl: null,
            transcript: kind === "audio" ? "Reference audio" : "",
          })
        }
        type="button"
      >
        Attach {label}
      </button>
    </section>
  ),
}));

vi.mock("../components/content/visual-region-editor.client", () => ({
  VisualRegionEditor: ({
    kind,
    onChange,
    regions,
  }: {
    kind: string;
    onChange: (
      regions: readonly {
        aliases: readonly string[];
        altText: string;
        groupKey: string;
        label: string;
        promptDirection: "region_to_label";
        semanticKey: string;
        shape: { kind: "rectangle"; x: number; y: number; width: number; height: number };
      }[],
    ) => void;
    regions: readonly {
      aliases: readonly string[];
      altText: string;
      groupKey: string;
      label: string;
      promptDirection: "region_to_label";
      semanticKey: string;
      shape: { kind: "rectangle"; x: number; y: number; width: number; height: number };
    }[];
  }) => (
    <section aria-label={`${kind} region editor`}>
      Accessible region editor
      <output aria-label={`${kind} mapped text alternative`}>{regions[0]?.altText ?? ""}</output>
      <button
        onClick={() =>
          onChange(
            regions.length > 0
              ? regions.map((region) => ({
                  ...region,
                  altText: "Edited lower-left circular region",
                }))
              : [
                  {
                    aliases: ["cell nucleus"],
                    altText: "Lower-left circular region",
                    groupKey: "nucleus",
                    label: "Nucleus",
                    promptDirection: "region_to_label",
                    semanticKey: "nucleus",
                    shape: { kind: "rectangle", x: 0.1, y: 0.4, width: 0.2, height: 0.2 },
                  },
                ],
          )
        }
        type="button"
      >
        Update region text alternative
      </button>
    </section>
  ),
}));

vi.mock("../components/content/drawing-editor.client", () => ({
  DrawingEditor: ({
    onChange,
    strokes,
  }: {
    onChange: (strokes: readonly DrawingStroke[]) => void;
    strokes: readonly DrawingStroke[];
  }) => (
    <section aria-label="Drawing response editor">
      <p>Drawing canvas with {strokes.length} strokes</p>
      <button onClick={() => onChange([])} type="button">
        Clear drawing strokes
      </button>
      <button
        onClick={() =>
          onChange([
            {
              color: "#123456",
              points: [
                { timeOffsetMs: 0, x: 0.2, y: 0.3 },
                { timeOffsetMs: 20, x: 0.7, y: 0.8 },
              ],
              semanticKey: "replacement-stroke",
              width: 6,
            },
          ])
        }
        type="button"
      >
        Replace drawing strokes
      </button>
    </section>
  ),
}));

const editorLandmark: Readonly<Record<CardTypeCode, string>> = {
  audio_prompt: "Audio prompt",
  basic: "Front / prompt",
  basic_reversed: "Front / prompt",
  bidirectional: "Concept A",
  cloze: "Cloze passage",
  custom: "Structured fields",
  diagram: "Diagram image",
  drawing: "Drawing response editor",
  image_occlusion: "Occlusion image",
  list_answer: "Expected list items",
  multiple_choice: "Answer choices",
  optional_reversed: "Create a second card in the reverse direction",
  ordering: "Correct order",
  pronunciation: "Text to pronounce",
  select_all: "Answer choices",
  true_false: "Correct answer",
  typed_answer: "Accepted typed answers",
};

const drawingPrompt: RichDocument = {
  attrs: { language: "en" },
  content: [
    {
      content: [{ text: "Sketch the labeled cell", type: "text" }],
      type: "paragraph",
    },
  ],
  schemaVersion: 2,
  type: "doc",
};

const initialStroke: DrawingStroke = {
  color: "#3157d5",
  points: [
    { timeOffsetMs: 0, x: 0.1, y: 0.1 },
    { timeOffsetMs: 30, x: 0.4, y: 0.4 },
  ],
  semanticKey: "initial-stroke",
  width: 4,
};

function drawingNote(drawingLayers: readonly DrawingReferenceLayer[]): NoteSummary {
  const note = deckDetail.notes[0]!;
  return {
    ...note,
    authoringData: {
      drawingLayers,
      evaluation: "self_review",
      fallbackAnswer: "A cell with its membrane and nucleus labeled",
      kind: "drawing",
      prompt: drawingPrompt,
      schemaVersion: CARD_SCHEMA_VERSION,
    },
    cardType: "drawing",
    preview: "Sketch the labeled cell",
  };
}

describe("Phase 02 card-type catalog", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    navigation.push.mockReset();
    navigation.refresh.mockReset();
    navigation.replace.mockReset();
  });

  it("offers exactly seventeen unique, explained authoring contracts", () => {
    expect(CARD_TYPE_CODES).toHaveLength(17);
    expect(new Set(CARD_TYPE_CODES)).toHaveLength(17);
    expect(CARD_TYPE_DESCRIPTORS.map(({ code }) => code)).toEqual(CARD_TYPE_CODES);
    expect(CARD_TYPE_DESCRIPTORS.every(({ description }) => description.length > 20)).toBe(true);
    expect(CARD_TYPE_DESCRIPTORS.every(({ generatedCards }) => generatedCards.length > 0)).toBe(
      true,
    );
  });

  it("exposes every type in the new-deck chooser and updates its generation preview", async () => {
    const user = userEvent.setup();
    render(<NewDeckWizard />);

    await user.type(screen.getByRole("textbox", { name: "Deck title" }), "Biology");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const options = screen
      .getAllByRole("button")
      .filter((option) => option.hasAttribute("aria-pressed"));
    expect(options).toHaveLength(17);

    for (const descriptor of CARD_TYPE_DESCRIPTORS) {
      const option = screen
        .getByText(descriptor.shortLabel, { exact: true, selector: "strong" })
        .closest("button");
      expect(option).not.toBeNull();
      if (!option) throw new Error(`The ${descriptor.label} chooser is not a button.`);
      await user.click(option);
      expect(option).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText(`Selected: ${descriptor.shortLabel}`)).toBeVisible();
    }
  });

  it("carries the selected type into the real editor route after deck creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            cardCount: 0,
            descriptionPlain: "",
            folderId: null,
            id: "deck-id",
            noteCount: 0,
            publicId: null,
            publicSlug: null,
            role: "owner",
            status: "active",
            title: "World history",
            updatedAt: "2026-07-16T15:00:00.000Z",
            version: 1,
            visibility: "private",
          },
          status: "created",
        }),
        { headers: { "Content-Type": "application/json" }, status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NewDeckWizard />);

    await user.type(screen.getByRole("textbox", { name: "Deck title" }), "World history");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /Cloze/i }));
    await user.click(screen.getByRole("button", { name: "Create deck" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/content/decks",
      expect.objectContaining({
        body: expect.stringContaining('"title":"World history"'),
        method: "POST",
      }),
    );
    expect(navigation.push).toHaveBeenCalledWith("/app/decks/deck-id/edit?type=cloze");
  });
});

describe.each(CARD_TYPE_DESCRIPTORS)("$label editor", ({ code, label }) => {
  it("renders its specific authoring surface and card preview", () => {
    render(<NoteEditor deckId="deck-id" initialKind={code} />);

    expect(screen.getByRole("heading", { level: 1, name: "New note" })).toBeVisible();
    expect(screen.getAllByText(label)[0]).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Cards from this note" })).toBeVisible();
    if (code === "drawing") {
      expect(screen.getByRole("region", { name: editorLandmark[code] })).toBeVisible();
    } else {
      expect(screen.getAllByText(editorLandmark[code], { exact: false })[0]).toBeVisible();
    }

    cleanup();
  });
});

describe("drawing reference layer authoring", () => {
  it("attaches a reference image and preserves the primary metadata and sibling layers", async () => {
    const secondaryLayer: DrawingReferenceLayer = {
      assetId: "0190d9f0-0000-7000-8000-000000000082",
      opacity: 0.8,
      position: 1,
      semanticKey: "secondary-reference",
      strokes: [],
    };
    const note = drawingNote([
      {
        assetId: "0190d9f0-0000-7000-8000-000000000081",
        opacity: 0.45,
        position: 0,
        semanticKey: "primary-reference",
        strokes: [initialStroke],
      },
      secondaryLayer,
    ]);
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH"
          ? new Response(JSON.stringify({ data: { ...note, version: 4 }, status: "updated" }), {
              headers: { "Content-Type": "application/json" },
              status: 200,
            })
          : new Response(null, { status: 404 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    expect(screen.getByText("Drawing reference image attached")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Attach Optional drawing reference image" }),
    );
    await user.click(screen.getByRole("button", { name: "Replace drawing strokes" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const saveRequest = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(saveRequest).toBeDefined();
    const payload = JSON.parse(String(saveRequest?.[1]?.body)) as {
      authoringData: {
        drawingLayers: readonly DrawingReferenceLayer[];
      };
    };
    expect(payload.authoringData.drawingLayers).toHaveLength(2);
    expect(payload.authoringData.drawingLayers[0]).toMatchObject({
      assetId: "0190d9f0-0000-7000-8000-000000000099",
      opacity: 0.45,
      position: 0,
      semanticKey: "primary-reference",
      strokes: [{ color: "#123456", semanticKey: "replacement-stroke", width: 6 }],
    });
    expect(payload.authoringData.drawingLayers[1]).toEqual(secondaryLayer);
  });

  it("removes a vector-only primary layer when its final stroke is cleared", async () => {
    const note = drawingNote([
      {
        opacity: 1,
        position: 0,
        semanticKey: "vector-reference",
        strokes: [initialStroke],
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ...note, version: 4 }, status: "updated" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    await user.click(screen.getByRole("button", { name: "Clear drawing strokes" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      authoringData: { drawingLayers: readonly DrawingReferenceLayer[] };
    };
    expect(payload.authoringData.drawingLayers).toEqual([]);
  });
});

describe("typed custom fields", () => {
  it("authors, saves, and reopens bounded list and media helper values", async () => {
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST"
          ? new Response(
              JSON.stringify({
                data: {
                  ...deckDetail.notes[0],
                  cardType: "custom",
                  id: "0190d9f0-0000-7000-8000-000000000098",
                  version: 1,
                },
                status: "created",
              }),
              { headers: { "Content-Type": "application/json" }, status: 201 },
            )
          : new Response(null, { status: 404 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = render(<NoteEditor deckId={deckDetail.id} initialKind="custom" />);

    await user.type(screen.getByRole("textbox", { name: "Front" }), "Classify these examples");
    await user.type(screen.getByRole("textbox", { name: "Back" }), "Three categories");

    const name = screen.getByRole("textbox", { name: "New field name" });
    await user.type(name, "Items");
    await user.click(screen.getByRole("combobox", { name: "New field type" }));
    await user.click(screen.getByRole("option", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Items list items" }), {
      target: { value: "alpha\nbeta" },
    });

    await user.type(name, "Illustration");
    await user.click(screen.getByRole("combobox", { name: "New field type" }));
    await user.click(screen.getByRole("option", { name: "Media" }));
    await user.click(screen.getByRole("button", { name: "Attach New custom audio field" }));
    await user.click(screen.getByRole("button", { name: "Add field" }));

    const frontTemplate = screen.getByRole("textbox", { name: "Front template" });
    await user.clear(frontTemplate);
    fireEvent.change(frontTemplate, {
      target: {
        value: "{{Front}}{{#each Items}}<span>{{item}}</span>{{/each}}{{media Illustration}}",
      },
    });
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const saveRequest = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
    expect(saveRequest).toBeDefined();
    const payload = JSON.parse(String(saveRequest?.[1]?.body)) as {
      authoringData: CustomCardData;
    };
    expect(payload.authoringData.fields.Items).toEqual(["alpha", "beta"]);
    expect(payload.authoringData.fields.Illustration).toEqual(
      expect.objectContaining({
        assetId: "0190d9f0-0000-7000-8000-000000000099",
        kind: "media",
        mediaKind: "audio",
      }),
    );
    view.unmount();
    render(
      <NoteEditor
        deckId={deckDetail.id}
        note={{
          ...deckDetail.notes[0]!,
          authoringData: payload.authoringData,
          cardType: "custom",
          preview: "Classify these examples",
        }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Items list items" })).toHaveValue("alpha\nbeta");
    expect(screen.getByLabelText("Illustration media field")).toHaveTextContent(
      "Custom audio attached",
    );
    expect(
      document.querySelector('[data-lumen-audio="0190d9f0-0000-7000-8000-000000000099"]'),
    ).toBeInTheDocument();
  });
});

describe("diagram region alternative persistence", () => {
  it("maps a reopened hotspot alternative into the visual editor and back into the save payload", async () => {
    const sourceNote = deckDetail.notes[0]!;
    const note: NoteSummary = {
      ...sourceNote,
      authoringData: {
        hotspots: [
          {
            aliases: ["cell nucleus"],
            altText: "Large circular region near the lower-left edge",
            label: "Nucleus",
            promptDirection: "region_to_label",
            semanticKey: "nucleus",
            shape: { kind: "rectangle", x: 0.1, y: 0.4, width: 0.2, height: 0.2 },
          },
        ],
        imageAlt: "A labeled animal cell",
        imageAssetId: "0190d9f0-0000-7000-8000-000000000083",
        kind: "diagram",
        schemaVersion: CARD_SCHEMA_VERSION,
      },
      cardType: "diagram",
      preview: "A labeled animal cell",
    };
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH"
          ? new Response(JSON.stringify({ data: { ...note, version: 4 }, status: "updated" }), {
              headers: { "Content-Type": "application/json" },
              status: 200,
            })
          : new Response(null, { status: 404 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    expect(screen.getByLabelText("diagram mapped text alternative")).toHaveTextContent(
      "Large circular region near the lower-left edge",
    );
    await user.click(screen.getByRole("button", { name: "Update region text alternative" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const saveRequest = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH");
    const payload = JSON.parse(String(saveRequest?.[1]?.body)) as {
      authoringData: { hotspots: readonly { altText: string }[] };
    };
    expect(payload.authoringData.hotspots).toEqual([
      expect.objectContaining({ altText: "Edited lower-left circular region" }),
    ]);
  });
});

describe("live sibling preview", () => {
  it("turns a valid basic note into a stable semantic sibling without saving", async () => {
    const user = userEvent.setup();
    render(<NoteEditor deckId="deck-id" initialKind="basic" />);

    await user.type(screen.getByRole("textbox", { name: "Front / prompt" }), "What is ATP?");
    await user.type(
      screen.getByRole("textbox", { name: "Back / answer" }),
      "A cell's energy carrier",
    );

    expect(screen.getByText("Card 1")).toBeVisible();
    expect(screen.getByText("What is ATP?")).toBeVisible();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("marks a first save as creation instead of sending an update version", async () => {
    const createdNote = deckDetail.notes[0]!;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: createdNote, status: "created" }), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} initialKind="basic" />);

    await user.type(screen.getByRole("textbox", { name: "Front / prompt" }), "What is ATP?");
    await user.type(
      screen.getByRole("textbox", { name: "Back / answer" }),
      "A cell's energy carrier",
    );
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      readonly expectedVersion: number | null;
      readonly noteId: string | null;
    };
    expect(payload).toMatchObject({ expectedVersion: null, noteId: null });
  });

  it("reuses the creation idempotency key when the first note response is lost", async () => {
    const createdNote = deckDetail.notes[0]!;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: createdNote, status: "created" }), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} initialKind="basic" />);

    await user.type(screen.getByRole("textbox", { name: "Front / prompt" }), "What is ATP?");
    await user.type(screen.getByRole("textbox", { name: "Back / answer" }), "Energy carrier");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("response lost")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys[0]).toBe(keys[1]);
    expect(navigation.replace).toHaveBeenCalledWith(
      `/app/decks/${deckDetail.id}/edit?note=${createdNote.id}`,
    );
  });

  it("preserves an unsaved draft and presents typed recovery choices on a version conflict", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "CONFLICT",
          currentVersion: 4,
          message: "This note changed in another editor.",
          retryable: false,
        }),
        { headers: { "Content-Type": "application/json" }, status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const note = deckDetail.notes[0]!;
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    const tagsInput = screen.getByRole("textbox", { name: "Tags" });
    await user.type(tagsInput, ", mitochondria");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"expectedVersion":3');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain(`"noteId":"${note.id}"`);
    expect(
      await screen.findByRole("dialog", { name: "This note changed elsewhere" }),
    ).toBeVisible();
    expect(screen.getByText(/Your unsaved draft is preserved in this tab/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload current version" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft as a new note" })).toBeVisible();
    expect(tagsInput).toHaveValue("cells, energy, mitochondria");
  });

  it("replaces the local draft with the refreshed stored note when conflict reload is chosen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "CONFLICT",
          currentVersion: 4,
          message: "This note changed in another editor.",
          retryable: false,
        }),
        { headers: { "Content-Type": "application/json" }, status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const note = deckDetail.notes[0]!;
    const view = render(<NoteEditor deckId={deckDetail.id} note={note} />);

    await user.type(screen.getByRole("textbox", { name: "Tags" }), ", local-draft");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await user.click(await screen.findByRole("button", { name: "Reload current version" }));

    expect(navigation.refresh).toHaveBeenCalledOnce();
    view.rerender(
      <NoteEditor
        deckId={deckDetail.id}
        note={{
          ...note,
          source: "Server-side citation",
          tags: ["server-copy"],
          version: 4,
        }}
      />,
    );

    expect(await screen.findByText("Version 4 loaded.")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "This note changed elsewhere" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Tags" })).toHaveValue("server-copy");
    expect(screen.getByRole("textbox", { name: "Source or citation note" })).toHaveValue(
      "Server-side citation",
    );
  });

  it("reopens and preserves a note source when another field is edited", async () => {
    const note = deckDetail.notes[0]!;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ...note, version: 4 }, status: "updated" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    expect(screen.getByRole("textbox", { name: "Source or citation note" })).toHaveValue(
      note.source,
    );
    await user.type(screen.getByRole("textbox", { name: "Tags" }), ", reviewed");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      readonly source: string;
    };
    expect(payload.source).toBe(note.source);
  });

  it("does not report a newer draft as saved when an earlier request finishes", async () => {
    const note = deckDetail.notes[0]!;
    let resolveRequest: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    await user.type(screen.getByRole("textbox", { name: "Tags" }), ", first-change");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await user.type(
      screen.getByRole("textbox", { name: "Source or citation note" }),
      " — newer local edit",
    );
    expect(screen.getByText("Saving…")).toBeVisible();
    await act(async () => {
      resolveRequest?.(
        new Response(JSON.stringify({ data: { ...note, version: 4 }, status: "updated" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
      await pending;
    });

    expect(await screen.findByText("Newer changes are waiting to save.")).toBeVisible();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("keeps the note type fixed after save so semantic sibling identities cannot be reassigned", () => {
    const note = deckDetail.notes[0]!;
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    expect(screen.getByRole("combobox", { name: "Card type" })).toBeDisabled();
    expect(
      screen.getByText(
        "Card type can’t be changed after saving. Create a new note to use another type.",
      ),
    ).toBeVisible();
  });

  it("requires confirmation before deleting the current optimistic note version", async () => {
    const note = deckDetail.notes[0]!;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: note.id }, status: "deleted" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NoteEditor deckId={deckDetail.id} note={note} />);

    await user.click(screen.getByRole("button", { name: "Delete note" }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Delete this note?" });
    expect(within(dialog).getByText(/unsaved changes/i)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Delete this note" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/content/decks/${deckDetail.id}/notes/${note.id}`,
      expect.objectContaining({
        body: expect.stringContaining(`"expectedVersion":${String(note.version)}`),
        method: "DELETE",
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith(`/app/decks/${deckDetail.id}/edit`);
    expect(navigation.refresh).toHaveBeenCalled();
  });
});
