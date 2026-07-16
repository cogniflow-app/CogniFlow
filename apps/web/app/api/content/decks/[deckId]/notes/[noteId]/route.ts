import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";

export async function DELETE(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string; noteId: string }> },
) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const body = await readBoundedJson(request).catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The note version is required.",
      retryable: false,
    });
  const value = body as Readonly<Record<string, unknown>>;
  if (typeof value.expectedVersion !== "number" || typeof value.idempotencyKey !== "string")
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The note version is invalid.",
      retryable: false,
    });
  const { deckId, noteId } = await params;
  const ownership = await context.database.client
    .from("notes")
    .select("deck_id")
    .eq("id", noteId)
    .eq("deck_id", deckId)
    .maybeSingle();
  if (ownership.error || !ownership.data)
    return apiError(404, {
      code: "NOT_FOUND",
      message: "The note no longer exists.",
      retryable: false,
    });
  const { data, error } = await context.database.client.rpc("current_delete_note", {
    p_expected_version: value.expectedVersion,
    p_idempotency_key: value.idempotencyKey,
    p_note_id: noteId,
  });
  if (error || !data) return contentDatabaseError(error ?? {}, "The note could not be deleted.");
  return context.database.applyCookies(
    apiSuccess({ data: { id: data.id }, status: "deleted" as const }),
  );
}
