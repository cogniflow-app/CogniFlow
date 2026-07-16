import { emptyRichDocument } from "@lumen/domain";
import type { NextRequest } from "next/server";

import { parseCreateDeckInput } from "@/lib/content/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";

export async function POST(request: NextRequest) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const body = await readBoundedJson(request).catch(() => null);
  const parsed = parseCreateDeckInput(body);
  if (!parsed.ok)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: parsed.fieldErrors,
      message: "Review the deck details.",
      retryable: false,
    });
  const descriptionDoc = { ...emptyRichDocument("en"), plainText: parsed.data.description };
  const { data, error } = await context.database.client.rpc("current_create_deck", {
    p_description_doc: toDatabaseJson(descriptionDoc),
    p_folder_id: nullableRpcArgument(parsed.data.folderId),
    p_idempotency_key: parsed.data.idempotencyKey,
    p_title: parsed.data.title,
    p_visibility: parsed.data.visibility === "public" ? "unlisted" : parsed.data.visibility,
  });
  if (error || !data) return contentDatabaseError(error ?? {}, "The deck could not be created.");
  return context.database.applyCookies(
    apiSuccess(
      {
        data: {
          cardCount: data.card_count,
          descriptionPlain: data.description_plain,
          folderId: parsed.data.folderId,
          id: data.id,
          noteCount: data.note_count,
          publicId: null,
          publicSlug: null,
          role: "owner" as const,
          status: data.status,
          title: data.title,
          updatedAt: data.updated_at,
          version: data.version,
          visibility: data.visibility,
        },
        status: "created" as const,
      },
      201,
    ),
  );
}
