import type { CardAuthoringData } from "@lumen/domain";
import type { NextRequest } from "next/server";

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

async function deterministicUuid(seed: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lumen:note-type:${seed}`)),
  );
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const value = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

interface MediaLinkInput {
  readonly altText: string;
  readonly assetId: string;
  readonly position: number;
  readonly purpose: "prompt";
}

export function collectMediaLinks(value: unknown): readonly MediaLinkInput[] {
  const found = new Map<string, string>();
  function visit(candidate: unknown) {
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child);
      return;
    }
    const item = asRecord(candidate);
    if (!item) return;
    if (typeof item.assetId === "string" && /^[0-9a-f-]{36}$/iu.test(item.assetId)) {
      found.set(
        item.assetId,
        typeof item.alt === "string"
          ? item.alt
          : typeof item.imageAlt === "string"
            ? item.imageAlt
            : typeof item.transcript === "string"
              ? item.transcript
              : "",
      );
    }
    if (typeof item.imageAssetId === "string" && /^[0-9a-f-]{36}$/iu.test(item.imageAssetId))
      found.set(item.imageAssetId, typeof item.imageAlt === "string" ? item.imageAlt : "");
    if (
      typeof item.referenceAssetId === "string" &&
      /^[0-9a-f-]{36}$/iu.test(item.referenceAssetId)
    )
      found.set(item.referenceAssetId, typeof item.text === "string" ? item.text : "");
    if (
      typeof item.annotationAssetId === "string" &&
      /^[0-9a-f-]{36}$/iu.test(item.annotationAssetId)
    )
      found.set(
        item.annotationAssetId,
        typeof item.alt === "string" ? `${item.alt} annotation` : "Image annotation",
      );
    for (const child of Object.values(item)) visit(child);
  }
  visit(value);
  return [...found].map(([assetId, altText], position) => ({
    altText,
    assetId,
    position,
    purpose: "prompt",
  }));
}

async function resolveNoteTypeCode(
  context: Awaited<ReturnType<typeof createContentMutationContext>>,
  input: {
    readonly authoringData: CardAuthoringData;
    readonly noteId: string | null;
    readonly idempotencyKey: string;
  },
): Promise<{ code: string } | Response> {
  if (!isMutationContext(context)) return context;
  if (input.noteId) {
    const noteResult = await context.database.client
      .from("notes")
      .select("note_type_id")
      .eq("id", input.noteId)
      .maybeSingle();
    if (noteResult.error || !noteResult.data)
      return apiError(404, {
        code: "NOT_FOUND",
        message: "The note no longer exists.",
        retryable: false,
      });
    const typeResult = await context.database.client
      .from("note_types")
      .select("code")
      .eq("id", noteResult.data.note_type_id)
      .single();
    if (typeResult.error || !typeResult.data)
      return apiError(404, {
        code: "NOT_FOUND",
        message: "The note type is unavailable.",
        retryable: false,
      });
    return { code: typeResult.data.code };
  }
  if (input.authoringData.kind !== "custom") return { code: input.authoringData.kind };
  const definition = customNoteTypeDefinition(input.authoringData);
  const result = await context.database.client.rpc("current_create_note_type", {
    p_description: definition.description,
    p_display_name: definition.displayName,
    p_fields: toDatabaseJson(definition.fields),
    p_idempotency_key: await deterministicUuid(input.idempotencyKey),
    p_templates: toDatabaseJson(definition.templates),
  });
  if (result.error || !result.data)
    return contentDatabaseError(result.error ?? {}, "The custom note type could not be created.");
  return { code: result.data.code };
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
  const noteType = await resolveNoteTypeCode(context, parsed.data);
  if (noteType instanceof Response) return noteType;
  const serialized = serializeNote(parsed.data.authoringData, parsed.data.source, noteType.code);
  const { data, error } = await context.database.client.rpc("current_upsert_note_with_media", {
    p_card_payload: toDatabaseJson(serialized.transport),
    p_deck_id: deckId,
    p_expected_version: parsed.data.expectedVersion ?? 0,
    p_fields: toDatabaseJson(serialized.fields),
    p_idempotency_key: parsed.data.idempotencyKey,
    p_media_links: toDatabaseJson(collectMediaLinks(parsed.data.authoringData)),
    p_note_id: nullableRpcArgument(parsed.data.noteId),
    p_note_type_code: serialized.noteTypeCode,
    p_tags: [...parsed.data.tags],
  });
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
