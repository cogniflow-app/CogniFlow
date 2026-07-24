import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";
import { safeFileName } from "@lumen/import-export";

function noStoreHeaders(input: {
  readonly byteSize: number;
  readonly displayName: string;
  readonly mimeType: string;
  readonly sha256: string;
}) {
  const name = safeFileName(input.displayName);
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `attachment; filename="${name.replaceAll('"', "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Content-Length": String(input.byteSize),
    "Content-Type": input.mimeType,
    Digest: `sha-256=${input.sha256}`,
    Expires: "0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

async function owner(request: NextRequest) {
  const database = createNextRouteDatabaseContext(request);
  const { data } = await database.client.auth.getUser();
  if (!data.user) return null;
  await assertSelfLearnerMutation(request, data.user.id);
  return { accountId: data.user.id, database };
}

export async function GET(
  request: NextRequest,
  { params }: { readonly params: Promise<{ artifactId: string }> },
) {
  try {
    const context = await owner(request);
    if (!context) throw new Error("UNAUTHENTICATED");
    const { artifactId } = await params;
    if (!z.string().uuid().safeParse(artifactId).success) throw new Error("NOT_FOUND");
    const privileged = createPrivilegedDatabaseClient();
    const object = await privileged.rpc("admin_get_portability_artifact_object", {
      p_account_id: context.accountId,
      p_artifact_id: artifactId,
    });
    const row = object.data?.[0];
    if (object.error || !row) throw new Error("NOT_FOUND");
    const download = await privileged.storage.from(row.storage_bucket).download(row.storage_path);
    if (download.error || !download.data) throw new Error("NOT_FOUND");
    return new Response(await download.data.arrayBuffer(), {
      headers: noStoreHeaders({
        byteSize: row.byte_size,
        displayName: row.display_name,
        mimeType: row.mime_type,
        sha256: row.sha256,
      }),
      status: 200,
    });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return apiError(unauthenticated ? 401 : 404, {
      code: unauthenticated ? "UNAUTHENTICATED" : "ARTIFACT_UNAVAILABLE",
      message: unauthenticated
        ? "Sign in again to download this file."
        : "This artifact is missing, expired, deleted, or belongs to another account.",
      retryable: false,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { readonly params: Promise<{ artifactId: string }> },
) {
  try {
    assertTrustedMutationRequest(request);
    const context = await owner(request);
    if (!context) throw new Error("UNAUTHENTICATED");
    const { artifactId } = await params;
    if (!z.string().uuid().safeParse(artifactId).success) throw new Error("NOT_FOUND");
    const privileged = createPrivilegedDatabaseClient();
    const object = await privileged.rpc("admin_get_portability_artifact_object", {
      p_account_id: context.accountId,
      p_artifact_id: artifactId,
    });
    const row = object.data?.[0];
    if (object.error || !row) throw new Error("NOT_FOUND");
    const removal = await privileged.storage.from(row.storage_bucket).remove([row.storage_path]);
    if (removal.error) throw new Error("CLEANUP_FAILED");
    const deletion = await privileged.rpc("admin_delete_portability_artifact", {
      p_account_id: context.accountId,
      p_artifact_id: artifactId,
    });
    if (deletion.error || !deletion.data?.[0]) throw new Error("CLEANUP_FAILED");
    return context.database.applyCookies(apiSuccess({ deleted: true }));
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    const cleanupFailed = error instanceof Error && error.message === "CLEANUP_FAILED";
    return apiError(unauthenticated ? 401 : cleanupFailed ? 503 : 404, {
      code: unauthenticated
        ? "UNAUTHENTICATED"
        : cleanupFailed
          ? "ARTIFACT_DELETE_RETRY"
          : "ARTIFACT_UNAVAILABLE",
      message: unauthenticated
        ? "Sign in again to delete this file."
        : cleanupFailed
          ? "The artifact could not be deleted yet. Try again."
          : "This artifact is missing, expired, deleted, or belongs to another account.",
      retryable: cleanupFailed,
    });
  }
}
