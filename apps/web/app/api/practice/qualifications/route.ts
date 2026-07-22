import { z } from "zod";
import { NextRequest } from "next/server";

import { POST as recordCanonicalReview } from "@/app/api/study/reviews/route";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";

const schema = z
  .object({
    attemptId: z.uuid(),
    durationMs: z.number().int().min(0).max(86_400_000),
    qualificationId: z.uuid(),
    reviewId: z.uuid(),
    reviewIdempotencyKey: z.uuid(),
    selectedRating: z.enum(["again", "hard", "good", "easy"]),
    studySessionId: z.uuid(),
  })
  .strict();

function settingsRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The scheduling qualification is invalid.",
        retryable: false,
      }),
    );
  const input = parsed.data;
  const [attemptResult, learnerResult, profileResult] = await Promise.all([
    context.database.client
      .from("practice_attempts")
      .select("id,card_id,qualification_status,suggested_rating,occurred_at")
      .eq("id", input.attemptId)
      .eq("learner_profile_id", context.learnerProfileId)
      .maybeSingle(),
    context.database.client
      .from("learner_profiles")
      .select("kind,settings")
      .eq("id", context.learnerProfileId)
      .maybeSingle(),
    context.database.client
      .from("profiles")
      .select("timezone,study_day_start")
      .eq("id", context.accountId)
      .maybeSingle(),
  ]);
  const attempt = attemptResult.data;
  if (
    attemptResult.error ||
    learnerResult.error ||
    profileResult.error ||
    !attempt ||
    !learnerResult.data ||
    attempt.qualification_status !== "eligible"
  )
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "This attempt is not available for an SRS update.",
        retryable: false,
      }),
    );
  const [scheduleResult, cardResult] = await Promise.all([
    context.database.client
      .from("card_schedules")
      .select("state,version")
      .eq("learner_profile_id", context.learnerProfileId)
      .eq("card_id", attempt.card_id)
      .maybeSingle(),
    context.database.client
      .from("cards")
      .select("notes!inner(deck_id)")
      .eq("id", attempt.card_id)
      .maybeSingle(),
  ]);
  if (scheduleResult.error || cardResult.error || !cardResult.data)
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "The canonical schedule is unavailable.",
        retryable: true,
      }),
    );
  const settings = settingsRecord(learnerResult.data.settings);
  const timezone =
    learnerResult.data.kind === "self"
      ? (profileResult.data?.timezone ?? "UTC")
      : typeof settings.timezone === "string"
        ? settings.timezone
        : "UTC";
  const studyDayStart =
    learnerResult.data.kind === "self"
      ? (profileResult.data?.study_day_start ?? 240)
      : typeof settings.studyDayStart === "number"
        ? settings.studyDayStart
        : 240;
  const joinedNote = Array.isArray(cardResult.data.notes)
    ? cardResult.data.notes[0]
    : cardResult.data.notes;
  const deckId = joinedNote?.deck_id;
  const reviewedAt = new Date().toISOString();
  const { error: sessionError } = await context.privileged.rpc("admin_create_study_session", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_deck_id: nullableRpcArgument(deckId ?? null),
    p_device_id: context.deviceId,
    p_filter_id: nullableRpcArgument<string>(null),
    p_items: toDatabaseJson([
      {
        cardId: attempt.card_id,
        position: 0,
        scheduleVersion: scheduleResult.data?.version ?? 0,
        state: scheduleResult.data?.state ?? "new",
      },
    ]),
    p_learner_profile_id: context.learnerProfileId,
    p_mode: "due_only",
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_queue_seed: input.studySessionId,
    p_rescheduling: true,
    p_source: "filtered",
    p_started_at: reviewedAt,
    p_study_day_start: studyDayStart,
    p_study_session_id: input.studySessionId,
    p_timezone: timezone,
  });
  if (sessionError)
    return context.applyCookies(
      srsDatabaseError(sessionError, "The explicit scheduling review could not be prepared."),
    );

  const canonicalRequest = new NextRequest(new URL("/api/study/reviews", request.url), {
    body: JSON.stringify({
      cardId: attempt.card_id,
      currentScheduleVersion: scheduleResult.data?.version ?? 0,
      durationMs: input.durationMs,
      idempotencyKey: input.reviewIdempotencyKey,
      rating: input.selectedRating,
      reviewId: input.reviewId,
      reviewedAt,
      source: "filtered",
      studyDayStart,
      studySessionId: input.studySessionId,
      timezone,
    }),
    headers: request.headers,
    method: "POST",
  });
  const canonicalResponse = await recordCanonicalReview(canonicalRequest);
  if (!canonicalResponse.ok) return canonicalResponse;
  const { data: canonicalData } = (await canonicalResponse.clone().json()) as {
    readonly data?: { readonly reviewId?: string };
  };
  const canonicalReviewId = canonicalData?.reviewId ?? input.reviewId;
  const { data, error } = await context.privileged.rpc("admin_link_practice_srs_qualification", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_device_id: context.deviceId,
    p_explicitly_accepted_at: reviewedAt,
    p_learner_profile_id: context.learnerProfileId,
    p_practice_attempt_id: input.attemptId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_qualification_id: input.qualificationId,
    p_review_log_id: canonicalReviewId,
    p_selected_rating: input.selectedRating,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The explicit scheduling link could not be recorded."),
    );
  return context.applyCookies(
    apiSuccess({
      data: {
        qualification: data,
        review: canonicalData,
      },
    }),
  );
}
