import "server-only";

import type { NextRequest } from "next/server";

import { apiError } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import {
  createNextRouteDatabaseContext,
  type NextRouteDatabaseContext,
} from "@/lib/supabase/server";

export interface ContentMutationContext {
  readonly accountId: string;
  readonly database: NextRouteDatabaseContext;
}

export async function createContentMutationContext(
  request: NextRequest,
): Promise<ContentMutationContext | Response> {
  try {
    assertTrustedMutationRequest(request);
    const database = createNextRouteDatabaseContext(request);
    const { data, error } = await database.client.auth.getUser();
    if (error || !data.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to change content.",
        retryable: false,
      });
    }
    await assertSelfLearnerMutation(request, data.user.id);
    return { accountId: data.user.id, database };
  } catch (error) {
    const forbidden =
      error instanceof Error &&
      ["LEARNER_CONTEXT_UNAVAILABLE", "MANAGED_LEARNER_ACTIVE"].includes(error.message);
    return apiError(forbidden ? 403 : 400, {
      code: forbidden ? "FORBIDDEN" : "INVALID_INPUT",
      message: forbidden
        ? "Content cannot be changed from this learner context."
        : "The request could not be verified.",
      retryable: false,
    });
  }
}

interface DatabaseErrorLike {
  readonly code?: string;
  readonly details?: string;
  readonly message?: string;
}

function detailObject(details: string | undefined): Readonly<Record<string, unknown>> | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>)
      : null;
  } catch {
    return null;
  }
}

export function contentDatabaseError(error: DatabaseErrorLike, fallback: string) {
  const detail = detailObject(error.details);
  if (error.code === "40001" || detail?.code === "version_conflict") {
    return apiError(409, {
      code: "CONFLICT",
      ...(typeof detail?.actualVersion === "number"
        ? { currentVersion: detail.actualVersion }
        : {}),
      message:
        "This content changed in another tab or session. Review the current version before saving.",
      retryable: false,
    });
  }
  if (error.code === "42501") {
    return apiError(403, {
      code: "FORBIDDEN",
      message: "You do not have permission to change this content.",
      retryable: false,
    });
  }
  if (error.code === "54000") {
    return apiError(413, {
      code: "QUOTA_EXCEEDED",
      message: "Your private media quota is full. Remove unused media before uploading more.",
      retryable: false,
    });
  }
  return apiError(error.code === "22023" || error.code === "23505" ? 422 : 500, {
    code: error.code === "22023" || error.code === "23505" ? "INVALID_INPUT" : "INTERNAL",
    message: error.code === "23505" ? "That name or content already exists." : fallback,
    retryable: error.code !== "22023" && error.code !== "23505",
  });
}

export function isMutationContext(
  value: ContentMutationContext | Response,
): value is ContentMutationContext {
  return !(value instanceof Response);
}
