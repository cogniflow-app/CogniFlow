import type { NextRequest } from "next/server";

import { collectMediaLinks, InvalidMediaReferenceError } from "@/lib/content/media-links";
import { customNoteTypeDefinition, serializeNote } from "@/lib/content/note-serialization";
import { parseNoteMutationInput } from "@/lib/content/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

async function upsert(request: NextRequest, deckId: string) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const parsed = parseNoteMutationInput(
    await readBoundedJson(request, 1_500_000).catch(() => null),
  );
  if (!parsed.ok)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: parsed.fieldErrors,
      message: "Review the note fields.",
      retryable: false,
    });
  const serialized = serializeNote(parsed.data.authoringData, parsed.data.source);
  const customDefinition =
    parsed.data.authoringData.kind === "custom"
      ? customNoteTypeDefinition(parsed.data.authoringData)
      : null;
  let mediaLinks: ReturnType<typeof collectMediaLinks>;
  try {
    mediaLinks = collectMediaLinks(parsed.data.authoringData);
  } catch (error) {
    if (!(error instanceof InvalidMediaReferenceError)) throw error;
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: Object.fromEntries(error.paths.map((path) => [path, [error.message]])),
      message: "Review the note's media references.",
      retryable: false,
    });
  }
  const { data, error } = await context.database.client.rpc(
    "current_upsert_note_definition_with_media",
    {
      p_card_payload: toDatabaseJson(serialized.transport),
      p_custom_note_type_definition: customDefinition
        ? toDatabaseJson(customDefinition)
        : nullableRpcArgument(null),
      p_deck_id: deckId,
      p_expected_version: parsed.data.expectedVersion ?? 0,
      p_fields: toDatabaseJson(serialized.fields),
      p_idempotency_key: parsed.data.idempotencyKey,
      p_media_links: toDatabaseJson(mediaLinks),
      p_note_id: nullableRpcArgument(parsed.data.noteId),
      p_note_type_code: parsed.data.authoringData.kind,
      p_tags: [...parsed.data.tags],
    },
  );
  if (error || !data) return contentDatabaseError(error ?? {}, "The note could not be saved.");
  const response = asRecord(data);
  const note = asRecord(response?.note);
  const cards = Array.isArray(response?.cards) ? response.cards : [];
  if (!note)
    return apiError(500, {
      code: "INTERNAL",
      message: "The saved note could not be read.",
      retryable: true,
    });
  const noteId = typeof note.id === "string" ? note.id : (parsed.data.noteId ?? "");
  if (!noteId)
    return apiError(500, {
      code: "INTERNAL",
      message: "The saved note identifier is unavailable.",
      retryable: true,
    });
  const preview =
    Object.values(serialized.fields)
      .map((field) => field.plainText)
      .find(Boolean) ?? "";
  return context.database.applyCookies(
    apiSuccess(
      {
        data: {
          authoringData: parsed.data.authoringData,
          cardCount: cards.length,
          cardType: parsed.data.authoringData.kind,
          contentHash: typeof note.content_hash === "string" ? note.content_hash : "",
          id: noteId,
          preview,
          source: parsed.data.source,
          tags: parsed.data.tags,
          updatedAt:
            typeof note.updated_at === "string" ? note.updated_at : new Date().toISOString(),
          version: typeof note.version === "number" ? note.version : 1,
        },
        status: parsed.data.noteId ? ("updated" as const) : ("created" as const),
      },
      parsed.data.noteId ? 200 : 201,
    ),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string }> },
) {
  return upsert(request, (await params).deckId);
}

export async function PATCH(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string }> },
) {
  return upsert(request, (await params).deckId);
}
