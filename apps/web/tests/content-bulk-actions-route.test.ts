// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContentMutationContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/server/content-route", () => ({
  contentDatabaseError: () =>
    Response.json(
      { code: "INTERNAL", message: "The selected notes could not be changed.", retryable: true },
      { status: 500 },
    ),
  createContentMutationContext: mocks.createContentMutationContext,
  isMutationContext: () => true,
}));

import { POST } from "../app/api/content/decks/[deckId]/notes/bulk-actions/route";

const deckId = "0190d9f0-0000-7000-8000-000000000011";
const targetDeckId = "0190d9f0-0000-7000-8000-000000000012";
const noteId = "0190d9f0-0000-7000-8000-000000000041";
const idempotencyKey = "0190d9f0-0000-7000-8000-000000000090";

function request(body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1:3100/api/content/decks/${deckId}/notes/bulk-actions`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function params(id = deckId) {
  return { params: Promise.resolve({ deckId: id }) };
}

describe("bulk note action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { updatedCount: 1 }, error: null });
    mocks.createContentMutationContext.mockResolvedValue({
      accountId: "0190d9f0-0000-7000-8000-000000000001",
      database: {
        applyCookies: (response: Response) => response,
        client: { rpc: mocks.rpc },
      },
    });
  });

  it("normalizes tags and preserves the note/version ordering for one atomic RPC", async () => {
    const response = await POST(
      request({
        action: "tag",
        addTags: [" Exam ", "exam", "Energy"],
        idempotencyKey,
        notes: [{ expectedVersion: 3, id: noteId }],
        removeTags: ["Cells"],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("current_bulk_tag_notes", {
      p_add_tags: ["exam", "energy"],
      p_deck_id: deckId,
      p_expected_versions: [3],
      p_idempotency_key: idempotencyKey,
      p_note_ids: [noteId],
      p_remove_tags: ["cells"],
    });
  });

  it("moves selected identities between distinct decks through the move RPC", async () => {
    const response = await POST(
      request({
        action: "move",
        idempotencyKey,
        notes: [{ expectedVersion: 3, id: noteId }],
        targetDeckId,
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("current_bulk_move_notes", {
      p_expected_versions: [3],
      p_idempotency_key: idempotencyKey,
      p_note_ids: [noteId],
      p_source_deck_id: deckId,
      p_target_deck_id: targetDeckId,
    });
  });

  it("rejects duplicate selections, no-op tags, extra fields, and same-deck moves before SQL", async () => {
    const invalidBodies = [
      {
        action: "tag",
        addTags: [],
        idempotencyKey,
        notes: [{ expectedVersion: 3, id: noteId }],
        removeTags: [],
      },
      {
        action: "tag",
        addTags: ["exam"],
        extra: "not accepted",
        idempotencyKey,
        notes: [{ expectedVersion: 3, id: noteId }],
        removeTags: [],
      },
      {
        action: "move",
        idempotencyKey,
        notes: [
          { expectedVersion: 3, id: noteId },
          { expectedVersion: 3, id: noteId },
        ],
        targetDeckId,
      },
      {
        action: "move",
        idempotencyKey,
        notes: [{ expectedVersion: 3, id: noteId }],
        targetDeckId: deckId,
      },
    ];

    for (const body of invalidBodies) {
      const response = await POST(request(body), params());
      expect(response.status).toBe(422);
    }
    const invalidPath = await POST(
      request({
        action: "tag",
        addTags: ["exam"],
        idempotencyKey,
        notes: [{ expectedVersion: 3, id: noteId }],
        removeTags: [],
      }),
      params("not-a-uuid"),
    );
    expect(invalidPath.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
