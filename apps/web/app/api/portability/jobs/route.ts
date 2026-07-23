import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const database = createNextRouteDatabaseContext(request);
  const { data: userData } = await database.client.auth.getUser();
  if (!userData.user) {
    return apiError(401, {
      code: "UNAUTHENTICATED",
      message: "Sign in again to view recent jobs.",
      retryable: false,
    });
  }
  try {
    await assertSelfLearnerMutation(request, userData.user.id);
  } catch {
    return apiError(403, {
      code: "FORBIDDEN",
      message: "Jobs are available only from your personal profile.",
      retryable: false,
    });
  }
  const [imports, exports, artifacts] = await Promise.all([
    database.client
      .from("import_jobs")
      .select(
        "id,kind,status,adapter_code,source_format,source_display_name,current_phase,processed_count,total_count,warning_count,error_count,safe_error_code,safe_error_summary,requested_at,started_at,completed_at,updated_at,expires_at",
      )
      .order("requested_at", { ascending: false })
      .limit(50),
    database.client
      .from("export_jobs")
      .select(
        "id,status,adapter_code,export_format,current_phase,processed_count,total_count,warning_count,error_count,safe_error_code,safe_error_summary,requested_at,started_at,completed_at,updated_at,expires_at",
      )
      .order("requested_at", { ascending: false })
      .limit(50),
    database.client
      .from("export_artifacts")
      .select(
        "id,export_job_id,format,display_name,mime_type,byte_size,sha256,warning_count,loss_summary,available,created_at,expires_at,deleted_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (imports.error || exports.error || artifacts.error) {
    return apiError(500, {
      code: "JOBS_UNAVAILABLE",
      message: "Recent import and export jobs are temporarily unavailable.",
      retryable: true,
    });
  }
  const artifactByJob = new Map(
    (artifacts.data ?? []).map((artifact) => [artifact.export_job_id, artifact]),
  );
  const jobs = [
    ...(imports.data ?? []).map((job) => ({
      ...job,
      artifact: null,
      direction: job.kind,
      format: job.source_format,
      label: job.source_display_name,
    })),
    ...(exports.data ?? []).map((job) => ({
      ...job,
      artifact: artifactByJob.get(job.id) ?? null,
      direction: "export" as const,
      format: job.export_format,
      label: job.export_format.replaceAll("_", " "),
    })),
  ]
    .sort((left, right) => right.requested_at.localeCompare(left.requested_at))
    .slice(0, 50);
  return database.applyCookies(apiSuccess({ jobs }));
}
