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
      { code: "INTERNAL", message: "The deck could not be changed.", retryable: true },
      { status: 500 },
    ),
  createContentMutationContext: mocks.createContentMutationContext,
  isMutationContext: () => true,
}));

import { PATCH } from "../app/api/content/decks/[deckId]/route";

const deckId = "0190d9f0-0000-7000-8000-000000000011";
const coverAssetId = "0190d9f0-0000-7000-8000-000000000091";
const idempotencyKey = "0190d9f0-0000-7000-8000-000000000090";

const deckRow = {
  card_count: 2,
  description_plain: "Cell respiration sources",
  id: deckId,
  note_count: 1,
  public_id: "0190d9f0-0000-7000-8000-000000000012",
  published_version: 6,
  slug: "cell-energy",
  status: "active",
  title: "Cell energy",
  updated_at: "2026-07-16T15:00:00.000Z",
  version: 6,
  visibility: "public",
};

function request(body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1:3100/api/content/decks/${deckId}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

function params() {
  return { params: Promise.resolve({ deckId }) };
}

function settings(action: "publish" | "unpublish" | "update") {
  return {
    action,
    coverAssetId,
    description: "Cell respiration sources",
    expectedVersion: 4,
    idempotencyKey,
    languageBack: "es",
    languageFront: "en",
    license: "cc_by" as const,
    theme: "ocean",
  };
}

describe("deck command route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createContentMutationContext.mockResolvedValue({
      accountId: "0190d9f0-0000-7000-8000-000000000001",
      database: {
        applyCookies: (response: Response) => response,
        client: { rpc: mocks.rpc },
      },
    });
  });

  it("persists every deck detail before publishing the resulting version", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: deckRow, error: null });

    const response = await PATCH(
      request({ ...settings("publish"), visibility: "public" }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("current_apply_deck_settings_and_publication", {
      p_action: "publish",
      p_deck_id: deckId,
      p_expected_version: 4,
      p_idempotency_key: idempotencyKey,
      p_patch: {
        coverAssetId,
        descriptionDoc: expect.objectContaining({
          attrs: { language: "en" },
          content: [
            {
              content: [{ text: "Cell respiration sources", type: "text" }],
              type: "paragraph",
            },
          ],
          schemaVersion: 2,
          type: "doc",
        }),
        descriptionPlain: "Cell respiration sources",
        languageBack: "es",
        languageFront: "en",
        license: "cc_by",
        theme: "ocean",
      },
      p_visibility: "public",
    });
    expect(await response.json()).toMatchObject({
      data: { publicId: deckRow.public_id, version: 6, visibility: "public" },
    });
  });

  it("persists pending deck details before unpublishing", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...deckRow,
        published_version: null,
        version: 6,
        visibility: "private",
      },
      error: null,
    });

    const response = await PATCH(request(settings("unpublish")), params());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("current_apply_deck_settings_and_publication", {
      p_action: "unpublish",
      p_deck_id: deckId,
      p_expected_version: 4,
      p_idempotency_key: idempotencyKey,
      p_patch: expect.objectContaining({
        coverAssetId,
        descriptionPlain: "Cell respiration sources",
      }),
      p_visibility: "private",
    });
  });

  it("saves deck details without treating draft visibility as a metadata field", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...deckRow, version: 5 }, error: null });

    const response = await PATCH(request(settings("update")), params());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_update_deck",
      expect.objectContaining({
        p_deck_id: deckId,
        p_expected_version: 4,
        p_idempotency_key: idempotencyKey,
        p_patch: expect.not.objectContaining({ visibility: expect.anything() }),
      }),
    );
  });

  it("rejects a visibility-only update instead of reporting a false save", async () => {
    const response = await PATCH(
      request({
        action: "update",
        expectedVersion: 4,
        idempotencyKey,
        visibility: "public",
      }),
      params(),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      message: "Publication visibility changes only when you publish or unpublish.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
