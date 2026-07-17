import type { NextRequest } from "next/server";

import { parseCreateFolderInput } from "@/lib/content/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument } from "@/lib/server/database-arguments";

export async function POST(request: NextRequest) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "The folder request is invalid.",
      retryable: false,
    });
  }
  const parsed = parseCreateFolderInput(body);
  if (!parsed.ok)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: parsed.fieldErrors,
      message: "Review the folder details.",
      retryable: false,
    });
  const { data, error } = await context.database.client.rpc("current_create_folder", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_name: parsed.data.name,
    p_parent_id: nullableRpcArgument(parsed.data.parentId),
  });
  if (error || !data) return contentDatabaseError(error ?? {}, "The folder could not be created.");
  return context.database.applyCookies(
    apiSuccess(
      {
        data: {
          createdAt: data.created_at,
          deckCount: 0,
          id: data.id,
          name: data.name,
          parentId: data.parent_id,
          updatedAt: data.updated_at,
          version: data.version,
        },
        status: "created" as const,
      },
      201,
    ),
  );
}
