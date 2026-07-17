import type { NextRequest } from "next/server";

import { parseBulkNoteInput } from "@/lib/content/inputs";
import { collectMediaLinks, InvalidMediaReferenceError } from "@/lib/content/media-links";
import { customNoteTypeDefinition, serializeNote } from "@/lib/content/note-serialization";
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
  const mediaLinksByNote: ReturnType<typeof collectMediaLinks>[] = [];
  for (const [index, note] of parsed.data.entries()) {
    try {
      mediaLinksByNote.push(collectMediaLinks(note.authoringData));
    } catch (error) {
      if (!(error instanceof InvalidMediaReferenceError)) throw error;
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: Object.fromEntries(
          error.paths.map((path) => [`notes.${String(index)}.${path}`, [error.message]]),
        ),
        message: "Review the quick-add media references.",
        retryable: false,
      });
    }
  }
  const { deckId } = await params;
  const saved: string[] = [];
  for (const [index, note] of parsed.data.entries()) {
    const serialized = serializeNote(note.authoringData, note.source);
    const customDefinition =
      note.authoringData.kind === "custom" ? customNoteTypeDefinition(note.authoringData) : null;
    const { data, error } = await context.database.client.rpc(
      "current_upsert_note_definition_with_media",
      {
        p_card_payload: toDatabaseJson(serialized.transport),
        p_custom_note_type_definition: customDefinition
          ? toDatabaseJson(customDefinition)
          : nullableRpcArgument(null),
        p_deck_id: deckId,
        p_expected_version: 0,
        p_fields: toDatabaseJson(serialized.fields),
        p_idempotency_key: note.clientId,
        p_media_links: toDatabaseJson(mediaLinksByNote[index] ?? []),
        p_note_id: nullableRpcArgument<string>(null),
        p_note_type_code: note.authoringData.kind,
        p_tags: [...note.tags],
      },
    );
    if (error || !data)
      return contentDatabaseError(
        error ?? {},
        `Quick add stopped after ${String(saved.length)} saved rows.`,
      );
    const value = data as { note?: { id?: unknown } };
    if (typeof value.note?.id !== "string")
      return apiError(500, {
        code: "INTERNAL",
        message: `Quick add could not confirm row ${String(saved.length + 1)}. Retry the batch safely.`,
        retryable: true,
      });
    saved.push(value.note.id);
  }
  if (saved.length !== parsed.data.length)
    return apiError(500, {
      code: "INTERNAL",
      message: "Quick add could not confirm every saved row. Retry the batch safely.",
      retryable: true,
    });
  return context.database.applyCookies(
    apiSuccess(
      { data: { noteIds: saved, savedCount: saved.length }, status: "created" as const },
      201,
    ),
  );
}
