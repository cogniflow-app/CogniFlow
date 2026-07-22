import {
  forget,
  nextStudyDayBoundary,
  rebuildFromLogs,
  rescheduleWithinRange,
  scheduleSchema,
  setManualDueDate,
  studyDayBoundaryFor,
  type ReviewHistoryEntry,
} from "@lumen/srs";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { presetFromDatabase } from "@/lib/study/srs-mapping";

const schema = z
  .object({
    cardId: z.uuid(),
    due: z.iso.datetime({ offset: true }).optional(),
    expectedScheduleVersion: z.number().int().min(0),
    idempotencyKey: z.uuid(),
    operation: z.enum(["forget", "manual_due", "rebuild", "reschedule"]),
    operationEventId: z.uuid(),
    rangeEnd: z.iso.date().optional(),
    rangeStart: z.iso.date().optional(),
    studySessionId: z.uuid(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.rangeStart && value.rangeEnd && value.rangeStart > value.rangeEnd)
      context.addIssue({
        code: "custom",
        message: "The due range is reversed.",
        path: ["rangeEnd"],
      });
  });

function object(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (
    !parsed.success ||
    (parsed.data.operation === "manual_due" && !parsed.data.due) ||
    (parsed.data.operation === "reschedule" && (!parsed.data.rangeStart || !parsed.data.rangeEnd))
  )
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The schedule replacement is invalid.",
        retryable: false,
      }),
    );
  const { data: rawContext, error: contextError } = await context.privileged.rpc(
    "admin_get_srs_review_context",
    {
      p_actor_account_id: context.accountId,
      p_auth_session_id: context.authSessionId,
      p_card_id: parsed.data.cardId,
      p_device_id: context.deviceId,
      p_learner_profile_id: context.learnerProfileId,
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      p_study_session_id: parsed.data.studySessionId,
    },
  );
  if (contextError || !rawContext)
    return context.applyCookies(
      srsDatabaseError(contextError ?? {}, "The schedule is unavailable."),
    );
  const reviewContext = object(rawContext);
  const presetRow = object(reviewContext.preset);
  const preset = presetFromDatabase(presetRow);
  const stored = scheduleSchema.safeParse(reviewContext.schedule);
  if (!stored.success || reviewContext.scheduleVersion !== parsed.data.expectedScheduleVersion)
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "The schedule changed. Reload before continuing.",
        retryable: false,
      }),
    );
  let after = stored.data;
  if (parsed.data.operation === "forget") after = forget(stored.data, preset, new Date());
  if (parsed.data.operation === "manual_due" && parsed.data.due)
    after = setManualDueDate(stored.data, parsed.data.due);
  if (parsed.data.operation === "reschedule" && parsed.data.rangeStart && parsed.data.rangeEnd) {
    const rank =
      Number.parseInt(parsed.data.cardId.replaceAll("-", "").slice(-8), 16) / 0xffff_ffff;
    const timezone = typeof reviewContext.timezone === "string" ? reviewContext.timezone : "UTC";
    const studyDayStartMinutes =
      typeof reviewContext.studyDayStart === "number" ? reviewContext.studyDayStart : 240;
    const options = { studyDayStartMinutes, timezone };
    const start = studyDayBoundaryFor(parsed.data.rangeStart, options);
    const lastStudyDayStart = studyDayBoundaryFor(parsed.data.rangeEnd, options);
    const end = new Date(nextStudyDayBoundary(lastStudyDayStart, options).getTime() - 1);
    after = rescheduleWithinRange(stored.data, start, end, rank);
  }
  if (parsed.data.operation === "rebuild") {
    const [logResult, undoResult, cardResult] = await Promise.all([
      context.database.client
        .from("review_logs")
        .select("id,rating,reviewed_at,duration_ms")
        .eq("learner_profile_id", context.learnerProfileId)
        .eq("card_id", parsed.data.cardId)
        .order("reviewed_at"),
      context.database.client
        .from("review_undo_events")
        .select("review_log_id")
        .eq("learner_profile_id", context.learnerProfileId),
      context.database.client
        .from("cards")
        .select("created_at")
        .eq("id", parsed.data.cardId)
        .single(),
    ]);
    if (logResult.error || undoResult.error || cardResult.error || !cardResult.data)
      return context.applyCookies(
        apiError(500, {
          code: "INTERNAL",
          message: "Review history could not be replayed.",
          retryable: true,
        }),
      );
    const undone = new Set((undoResult.data ?? []).map((event) => event.review_log_id));
    const history: ReviewHistoryEntry[] = (logResult.data ?? [])
      .filter((log) => !undone.has(log.id))
      .map((log) => ({
        durationMs: log.duration_ms,
        rating: log.rating,
        reviewedAt: log.reviewed_at,
      }));
    after = rebuildFromLogs(history, preset, cardResult.data.created_at).schedule;
  }
  const operation = parsed.data.operation === "manual_due" ? "manual_due" : parsed.data.operation;
  const { data, error } = await context.privileged.rpc("admin_replace_srs_schedule", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_card_id: parsed.data.cardId,
    p_device_id: context.deviceId,
    p_expected_schedule_version: parsed.data.expectedScheduleVersion,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_learner_profile_id: context.learnerProfileId,
    p_operation: operation,
    p_operation_event_id: parsed.data.operationEventId,
    p_preset_id: typeof presetRow.id === "string" ? presetRow.id : "",
    p_preset_version: typeof presetRow.version === "number" ? presetRow.version : 0,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_schedule_after: toDatabaseJson(after),
    p_scheduler_version: after.schedulerVersion,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The schedule could not be replaced."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
