import { z } from "zod";
import type { NextRequest } from "next/server";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  createPortabilityMutationContext,
  isPortabilityContext,
} from "@/lib/server/portability-route";

const commandSchema = z
  .object({
    action: z.enum(["cancel", "retry"]),
    kind: z.enum(["import", "export", "restore"]),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ jobId: string }> },
) {
  const context = await createPortabilityMutationContext(request);
  if (!isPortabilityContext(context)) return context;
  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return apiError(422, {
      code: "INVALID_JOB",
      message: "Choose a valid job.",
      retryable: false,
    });
  }
  const parsed = commandSchema.safeParse(await readBoundedJson(request, 10_000).catch(() => null));
  if (!parsed.success) {
    return apiError(422, {
      code: "INVALID_COMMAND",
      message: "Choose cancel or retry.",
      retryable: false,
    });
  }
  const result =
    parsed.data.action === "cancel"
      ? await context.database.client.rpc("current_cancel_portability_job", {
          p_job_id: jobId,
          p_job_kind: parsed.data.kind,
        })
      : await context.database.client.rpc("current_retry_portability_job", {
          p_job_id: jobId,
          p_job_kind: parsed.data.kind,
        });
  if (result.error) {
    return apiError(result.error.code === "P0002" ? 404 : 409, {
      code: "JOB_COMMAND_FAILED",
      message:
        parsed.data.action === "cancel"
          ? "This job can no longer be cancelled."
          : "This job is not ready to retry.",
      retryable: false,
    });
  }
  if (
    parsed.data.action === "cancel" &&
    (parsed.data.kind === "import" || parsed.data.kind === "restore") &&
    result.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data) &&
    result.data.status === "cancelled"
  ) {
    const privileged = createPrivilegedDatabaseClient();
    const object = await privileged.rpc("admin_get_portability_upload_object", {
      p_account_id: context.accountId,
      p_import_job_id: jobId,
    });
    const row = object.data?.[0];
    if (row) {
      const removal = await privileged.storage.from(row.storage_bucket).remove([row.storage_path]);
      if (!removal.error) {
        await privileged.rpc("admin_mark_portability_upload_deleted", {
          p_account_id: context.accountId,
          p_import_job_id: jobId,
        });
      }
    }
  }
  return context.database.applyCookies(apiSuccess({ job: result.data }));
}
