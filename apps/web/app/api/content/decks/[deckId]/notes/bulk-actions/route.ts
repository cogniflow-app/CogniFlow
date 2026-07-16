import type { NextRequest } from "next/server";

import { contentUuidSchema, parseBulkNoteActionInput } from "@/lib/content/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string }> },
) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const parsed = parseBulkNoteActionInput(
    await readBoundedJson(request, 128_000).catch(() => null),
  );
  if (!parsed.ok)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: parsed.fieldErrors,
      message: "Review the selected notes and bulk action.",
      retryable: false,
    });

  const { deckId } = await params;
  if (!contentUuidSchema.safeParse(deckId).success)
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "Choose a valid source deck.",
      retryable: false,
    });
  if (parsed.data.action === "move" && parsed.data.targetDeckId === deckId)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: { targetDeckId: ["Choose a different target deck."] },
      message: "The notes are already in that deck.",
      retryable: false,
    });

  const noteIds = parsed.data.notes.map((note) => note.id);
  const expectedVersions = parsed.data.notes.map((note) => note.expectedVersion);
  const result =
    parsed.data.action === "tag"
      ? await context.database.client.rpc("current_bulk_tag_notes", {
          p_add_tags: parsed.data.addTags,
          p_deck_id: deckId,
          p_expected_versions: expectedVersions,
          p_idempotency_key: parsed.data.idempotencyKey,
          p_note_ids: noteIds,
          p_remove_tags: parsed.data.removeTags,
        })
      : await context.database.client.rpc("current_bulk_move_notes", {
          p_expected_versions: expectedVersions,
          p_idempotency_key: parsed.data.idempotencyKey,
          p_note_ids: noteIds,
          p_source_deck_id: deckId,
          p_target_deck_id: parsed.data.targetDeckId,
        });

  if (result.error || !result.data)
    return contentDatabaseError(result.error ?? {}, "The selected notes could not be changed.");
  return context.database.applyCookies(
    apiSuccess({ data: result.data, status: "updated" as const }),
  );
}
