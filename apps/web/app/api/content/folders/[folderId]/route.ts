import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument } from "@/lib/server/database-arguments";

function validBody(input: unknown): input is {
  expectedVersion: number;
  idempotencyKey: string;
  name: string;
  parentId: string | null;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const value = input as Readonly<Record<string, unknown>>;
  return (
    typeof value.expectedVersion === "number" &&
    Number.isSafeInteger(value.expectedVersion) &&
    value.expectedVersion > 0 &&
    typeof value.idempotencyKey === "string" &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 120 &&
    (value.parentId === null || typeof value.parentId === "string")
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { readonly params: Promise<{ folderId: string }> },
) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const body = await readBoundedJson(request).catch(() => null);
  if (!validBody(body))
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "Review the folder details.",
      retryable: false,
    });
  const { folderId } = await params;
  const { data, error } = await context.database.client.rpc("current_update_folder", {
    p_expected_version: body.expectedVersion,
    p_folder_id: folderId,
    p_idempotency_key: body.idempotencyKey,
    p_name: body.name.trim(),
    p_parent_id: nullableRpcArgument(body.parentId),
  });
  if (error || !data) return contentDatabaseError(error ?? {}, "The folder could not be updated.");
  return context.database.applyCookies(
    apiSuccess({
      data: {
        createdAt: data.created_at,
        deckCount: 0,
        id: data.id,
        name: data.name,
        parentId: data.parent_id,
        updatedAt: data.updated_at,
        version: data.version,
      },
      status: "updated" as const,
    }),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { readonly params: Promise<{ folderId: string }> },
) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const body = await readBoundedJson(request).catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The folder version is required.",
      retryable: false,
    });
  const value = body as Readonly<Record<string, unknown>>;
  if (typeof value.expectedVersion !== "number" || typeof value.idempotencyKey !== "string")
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The folder version is invalid.",
      retryable: false,
    });
  const { folderId } = await params;
  const { data, error } = await context.database.client.rpc("current_delete_folder", {
    p_expected_version: value.expectedVersion,
    p_folder_id: folderId,
    p_idempotency_key: value.idempotencyKey,
  });
  if (error || !data) return contentDatabaseError(error ?? {}, "The folder could not be deleted.");
  return context.database.applyCookies(
    apiSuccess({ data: { id: data.id }, status: "deleted" as const }),
  );
}
