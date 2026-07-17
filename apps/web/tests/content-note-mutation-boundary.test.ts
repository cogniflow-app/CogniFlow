// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContentMutationContext: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/server/content-route", () => ({
  contentDatabaseError: () =>
    Response.json(
      { code: "INTERNAL", message: "The note could not be saved.", retryable: true },
      { status: 500 },
    ),
  createContentMutationContext: mocks.createContentMutationContext,
  isMutationContext: () => true,
}));

import { POST as saveNote } from "../app/api/content/decks/[deckId]/notes/route";
import { POST as saveQuickNotes } from "../app/api/content/decks/[deckId]/notes/bulk/route";

const deckId = "0190d9f0-0000-7000-8000-000000000011";
const noteId = "0190d9f0-0000-7000-8000-000000000012";
const idempotencyKey = "0190d9f0-0000-7000-8000-000000000013";

const document = (text: string) => ({
  content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
  schemaVersion: 2,
  type: "doc",
});

const authoringData = {
  back: document("A guarded answer"),
  front: document("A guarded prompt"),
  kind: "basic",
  schemaVersion: 1,
};

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1:3100${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function params() {
  return { params: Promise.resolve({ deckId }) };
}

describe("note mutation database boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createContentMutationContext.mockResolvedValue({
      accountId: "0190d9f0-0000-7000-8000-000000000001",
      database: {
        applyCookies: (response: Response) => response,
        client: { from: mocks.from, rpc: mocks.rpc },
      },
    });
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          table === "notes"
            ? {
                maybeSingle: async () => ({
                  data: { note_type_id: "0190d9f0-0000-7000-8000-000000000014" },
                  error: null,
                }),
              }
            : { single: async () => ({ data: { code: "basic" }, error: null }) },
      }),
    }));
    mocks.rpc.mockResolvedValue({
      data: {
        cards: [],
        note: {
          content_hash: "a".repeat(64),
          id: noteId,
          updated_at: "2026-07-16T18:00:00.000Z",
          version: 1,
        },
      },
      error: null,
    });
  });

  it("sends the explicit zero optimistic-version sentinel for note creation", async () => {
    const response = await saveNote(
      request(`/api/content/decks/${deckId}/notes`, {
        authoringData,
        idempotencyKey,
        source: "",
        tags: [],
      }),
      params(),
    );

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_upsert_note_definition_with_media",
      expect.objectContaining({
        p_custom_note_type_definition: null,
        p_deck_id: deckId,
        p_expected_version: 0,
        p_media_links: [],
        p_note_id: null,
      }),
    );
  });

  it("preserves the supplied optimistic version for note updates", async () => {
    const response = await saveNote(
      request(`/api/content/decks/${deckId}/notes`, {
        authoringData,
        expectedVersion: 3,
        idempotencyKey,
        noteId,
        source: "",
        tags: [],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_upsert_note_definition_with_media",
      expect.objectContaining({ p_expected_version: 3, p_note_id: noteId }),
    );
  });

  it("routes quick-add creation through the same atomic wrapper with zero", async () => {
    const response = await saveQuickNotes(
      request(`/api/content/decks/${deckId}/notes/bulk`, {
        notes: [{ authoringData, clientId: idempotencyKey, tags: [] }],
      }),
      params(),
    );

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_upsert_note_definition_with_media",
      expect.objectContaining({
        p_custom_note_type_definition: null,
        p_expected_version: 0,
        p_media_links: [],
        p_note_id: null,
      }),
    );
  });

  it("retains visual-card media references during quick add", async () => {
    const imageAssetId = "0190d9f0-0000-7000-8000-000000000015";
    const response = await saveQuickNotes(
      request(`/api/content/decks/${deckId}/notes/bulk`, {
        notes: [
          {
            authoringData: {
              imageAlt: "A labeled cell",
              imageAssetId,
              kind: "image_occlusion",
              mode: "hide_one_reveal_others",
              occlusions: [
                {
                  altText: "Circular region in the center",
                  groupKey: "nucleus",
                  label: "Nucleus",
                  semanticKey: "nucleus-mask",
                  shape: { height: 0.2, kind: "rectangle", width: 0.2, x: 0.4, y: 0.4 },
                },
              ],
              schemaVersion: 1,
            },
            clientId: idempotencyKey,
            tags: [],
          },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_upsert_note_definition_with_media",
      expect.objectContaining({
        p_media_links: [expect.objectContaining({ assetId: imageAssetId })],
      }),
    );
  });

  it("keeps a full audio transcript in the card payload while bounding link metadata", async () => {
    const transcript = "spoken prompt ".repeat(120);
    const response = await saveQuickNotes(
      request(`/api/content/decks/${deckId}/notes/bulk`, {
        notes: [
          {
            authoringData: {
              audioPrompt: {
                answer: document("A complete answer"),
                assetId: "0190d9f0-0000-7000-8000-000000000016",
                transcript,
              },
              kind: "audio_prompt",
              playbackSpeed: 1,
              schemaVersion: 1,
            },
            clientId: idempotencyKey,
            tags: [],
          },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(201);
    const call = mocks.rpc.mock.calls[0]?.[1] as {
      p_card_payload: { authoringData: { audioPrompt: { transcript: string } } };
      p_media_links: readonly { altText: string }[];
    };
    expect(call.p_card_payload.authoringData.audioPrompt.transcript).toBe(transcript.trim());
    expect([...String(call.p_media_links[0]?.altText)].length).toBe(1_000);
  });

  it("rejects a dangling visual asset identifier before any quick-add row is saved", async () => {
    const response = await saveQuickNotes(
      request(`/api/content/decks/${deckId}/notes/bulk`, {
        notes: [
          {
            authoringData: {
              imageAlt: "A labeled cell",
              imageAssetId: "bogus",
              kind: "image_occlusion",
              mode: "hide_one_reveal_others",
              occlusions: [
                {
                  altText: "Circular region in the center",
                  groupKey: "nucleus",
                  label: "Nucleus",
                  semanticKey: "nucleus-mask",
                  shape: { height: 0.2, kind: "rectangle", width: 0.2, x: 0.4, y: 0.4 },
                },
              ],
              schemaVersion: 1,
            },
            clientId: idempotencyKey,
            tags: [],
          },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: "INVALID_INPUT",
        fieldErrors: expect.objectContaining({
          "notes.0.authoringData.imageAssetId": [
            "Embedded media references must use canonical asset UUIDs.",
          ],
        }),
      }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a dangling custom media identifier before the atomic mutation", async () => {
    const response = await saveNote(
      request(`/api/content/decks/${deckId}/notes`, {
        authoringData: {
          fields: {
            Illustration: {
              alt: "Broken illustration",
              assetId: "bogus",
              kind: "media",
              mediaKind: "image",
            },
          },
          kind: "custom",
          schemaVersion: 1,
          templates: [
            {
              backTemplate: "{{media Illustration}}",
              frontTemplate: "{{Illustration}}",
              name: "Recall",
              semanticKey: "recall",
            },
          ],
        },
        idempotencyKey,
        source: "",
        tags: [],
      }),
      params(),
    );

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not report quick-add success when an RPC response lacks its note identity", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { cards: [], note: {} }, error: null });

    const response = await saveQuickNotes(
      request(`/api/content/decks/${deckId}/notes/bulk`, {
        notes: [{ authoringData, clientId: idempotencyKey, tags: [] }],
      }),
      params(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "INTERNAL", retryable: true }),
    );
  });

  it("rejects duplicate quick-add row identities before any note can be replayed", async () => {
    const response = await saveQuickNotes(
      request(`/api/content/decks/${deckId}/notes/bulk`, {
        notes: [
          { authoringData, clientId: idempotencyKey, tags: [] },
          { authoringData, clientId: idempotencyKey, tags: [] },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: "INVALID_INPUT",
        fieldErrors: expect.objectContaining({
          "notes.1.clientId": ["Every quick-add row needs a unique identifier."],
        }),
      }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("persists an edited custom definition inside the same note/media mutation", async () => {
    const custom = {
      fields: { Answer: document("Mitochondria"), Prompt: document("Organelle?") },
      kind: "custom",
      schemaVersion: 1,
      templates: [
        {
          backTemplate: "{{Answer}}",
          frontTemplate: "{{Prompt}}",
          name: "Recall",
          semanticKey: "recall",
        },
      ],
    };

    const response = await saveNote(
      request(`/api/content/decks/${deckId}/notes`, {
        authoringData: custom,
        expectedVersion: 3,
        idempotencyKey,
        noteId,
        source: "",
        tags: [],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_upsert_note_definition_with_media",
      expect.objectContaining({
        p_custom_note_type_definition: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ fieldKey: "Answer" }),
            expect.objectContaining({ fieldKey: "Prompt" }),
          ]),
          templates: [expect.objectContaining({ templateKey: "recall" })],
        }),
        p_note_type_code: "custom",
      }),
    );
  });
});
