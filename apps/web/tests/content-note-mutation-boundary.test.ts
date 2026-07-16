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
      "current_upsert_note_with_media",
      expect.objectContaining({
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
      "current_upsert_note_with_media",
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
      "current_upsert_note_with_media",
      expect.objectContaining({
        p_expected_version: 0,
        p_media_links: [],
        p_note_id: null,
      }),
    );
  });
});
