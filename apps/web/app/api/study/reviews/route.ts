import { applyRating, createEmptySchedule, scheduleSchema } from "@lumen/srs";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { sha256Hex } from "@/lib/server/crypto";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { presetFromDatabase } from "@/lib/study/srs-mapping";

const inputSchema = z
  .object({
    cardId: z.uuid(),
    currentScheduleVersion: z.number().int().min(0),
    durationMs: z.number().int().min(0).max(86_400_000),
    idempotencyKey: z.uuid(),
    rating: z.enum(["again", "hard", "good", "easy"]),
    reviewId: z.uuid(),
    reviewedAt: z.iso.datetime({ offset: true }),
    source: z.enum(["today", "deck", "folder", "filtered", "review_ahead", "cram"]),
    studySessionId: z.uuid(),
    timezone: z.string().min(1).max(80),
    studyDayStart: z.number().int().min(0).max(1_439),
  })
  .strict();

function object(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = inputSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The review could not be validated.",
        retryable: false,
      }),
    );
  }
  const input = parsed.data;
  const requestHash = await sha256Hex(
    JSON.stringify({
      accountId: context.accountId,
      cardId: input.cardId,
      currentScheduleVersion: input.currentScheduleVersion,
      deviceId: context.deviceId,
      durationMs: input.durationMs,
      idempotencyKey: input.idempotencyKey,
      learnerProfileId: context.learnerProfileId,
      profileSessionId: context.profileSessionId,
      rating: input.rating,
      reviewId: input.reviewId,
      reviewedAt: input.reviewedAt,
      source: input.source,
      studyDayStart: input.studyDayStart,
      studySessionId: input.studySessionId,
      timezone: input.timezone,
    }),
  );
  const { data: replay, error: replayError } = await context.privileged.rpc(
    "admin_get_srs_review_replay",
    {
      p_actor_account_id: context.accountId,
      p_auth_session_id: context.authSessionId,
      p_device_id: context.deviceId,
      p_idempotency_key: input.idempotencyKey,
      p_learner_profile_id: context.learnerProfileId,
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      p_request_hash: requestHash,
      p_review_id: input.reviewId,
    },
  );
  if (replayError) {
    return context.applyCookies(
      srsDatabaseError(replayError, "The review retry was not verified."),
    );
  }
  if (replay !== null) {
    return context.applyCookies(apiSuccess({ data: replay }));
  }
  const { data: rawContext, error: contextError } = await context.privileged.rpc(
    "admin_get_srs_review_context",
    {
      p_actor_account_id: context.accountId,
      p_auth_session_id: context.authSessionId,
      p_card_id: input.cardId,
      p_device_id: context.deviceId,
      p_learner_profile_id: context.learnerProfileId,
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      p_study_session_id: input.studySessionId,
    },
  );
  if (contextError || !rawContext) {
    return context.applyCookies(
      srsDatabaseError(contextError ?? {}, "The canonical schedule is unavailable."),
    );
  }
  const reviewContext = object(rawContext);
  if (
    reviewContext.timezone !== input.timezone ||
    reviewContext.studyDayStart !== input.studyDayStart ||
    reviewContext.source !== input.source ||
    reviewContext.rescheduling !== true
  ) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The review no longer matches this study session.",
        retryable: false,
      }),
    );
  }
  if (
    reviewContext.suspended === true ||
    (typeof reviewContext.buriedUntil === "string" &&
      new Date(reviewContext.buriedUntil) > new Date(input.reviewedAt))
  ) {
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "This card is suspended or buried. Reload the queue.",
        retryable: false,
      }),
    );
  }
  const presetRow = object(reviewContext.preset);
  const preset = presetFromDatabase(presetRow);
  const stored =
    reviewContext.schedule === null ? null : scheduleSchema.safeParse(reviewContext.schedule);
  if (stored && !stored.success) {
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "The stored schedule is invalid.",
        retryable: false,
      }),
    );
  }
  const before = stored?.success ? stored.data : createEmptySchedule(preset, input.reviewedAt);
  const transition = applyRating({
    durationMs: input.durationMs,
    preset,
    rating: input.rating,
    reviewedAt: input.reviewedAt,
    schedule: before,
  });
  const scheduleVersion =
    typeof reviewContext.scheduleVersion === "number" ? reviewContext.scheduleVersion : 0;
  if (scheduleVersion !== input.currentScheduleVersion) {
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "This card changed elsewhere. Reload before grading.",
        retryable: false,
      }),
    );
  }
  const commandHash = await sha256Hex(
    JSON.stringify({
      actorAccountId: context.accountId,
      cardId: input.cardId,
      deviceId: context.deviceId,
      durationMs: input.durationMs,
      idempotencyKey: input.idempotencyKey,
      learnerProfileId: context.learnerProfileId,
      presetId: presetRow.id,
      presetVersion: presetRow.version,
      rating: input.rating,
      reviewId: input.reviewId,
      reviewedAt: input.reviewedAt,
      scheduleBefore: transition.before,
      scheduleVersion,
      source: input.source,
      studyDayStart: input.studyDayStart,
      studySessionId: input.studySessionId,
      timezone: input.timezone,
    }),
  );
  const { data, error } = await context.privileged.rpc("admin_commit_srs_review_v2", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_card_id: input.cardId,
    p_command_hash: commandHash,
    p_current_schedule_version: scheduleVersion,
    p_device_id: context.deviceId,
    p_duration_ms: input.durationMs,
    p_idempotency_key: input.idempotencyKey,
    p_learner_profile_id: context.learnerProfileId,
    p_preset_id: typeof presetRow.id === "string" ? presetRow.id : "",
    p_preset_version: typeof presetRow.version === "number" ? presetRow.version : 0,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_rating: input.rating,
    p_request_hash: requestHash,
    p_review_id: input.reviewId,
    p_reviewed_at: input.reviewedAt,
    p_schedule_after: toDatabaseJson(transition.after),
    p_schedule_before: toDatabaseJson(transition.before),
    p_scheduler_version: transition.after.schedulerVersion,
    p_source: input.source,
    p_study_day_start: input.studyDayStart,
    p_study_session_id: input.studySessionId,
    p_timezone: input.timezone,
  });
  if (error || !data)
    return context.applyCookies(srsDatabaseError(error ?? {}, "The review was not saved."));
  return context.applyCookies(apiSuccess({ data }));
}
