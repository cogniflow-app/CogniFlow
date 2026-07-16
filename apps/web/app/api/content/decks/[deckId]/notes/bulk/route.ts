import type { NextRequest } from "next/server";

import { parseBulkNoteInput } from "@/lib/content/inputs";
import { serializeNote } from "@/lib/content/note-serialization";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string }> },
) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const parsed = parseBulkNoteInput(await readBoundedJson(request, 2_000_000).catch(() => null));
  if (!parsed.ok)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: parsed.fieldErrors,
      message: "Review the quick-add rows.",
      retryable: false,
    });
  const { deckId } = await params;
  const saved: string[] = [];
  for (const note of parsed.data) {
    const serialized = serializeNote(note.authoringData, note.source);
    const { data, error } = await context.database.client.rpc("current_upsert_note_with_media", {
      p_card_payload: toDatabaseJson(serialized.transport),
      p_deck_id: deckId,
      p_expected_version: 0,
      p_fields: toDatabaseJson(serialized.fields),
      p_idempotency_key: note.clientId,
      p_media_links: toDatabaseJson([]),
      p_note_id: nullableRpcArgument<string>(null),
      p_note_type_code: serialized.noteTypeCode,
      p_tags: [...note.tags],
    });
    if (error || !data)
      return contentDatabaseError(
        error ?? {},
        `Quick add stopped after ${String(saved.length)} saved rows.`,
      );
    const value = data as { note?: { id?: unknown } };
    if (typeof value.note?.id === "string") saved.push(value.note.id);
  }
  return context.database.applyCookies(
    apiSuccess(
      { data: { noteIds: saved, savedCount: saved.length }, status: "created" as const },
      201,
    ),
  );
}
