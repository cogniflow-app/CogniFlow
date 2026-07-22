import { buildExamPlan } from "@lumen/learning-engine";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { buildStudyQueuePlan } from "@/lib/server/study-repository";

const schema = z
  .object({
    deckIds: z.array(z.uuid()).min(1).max(200).optional(),
    examAt: z.iso.datetime({ offset: true }),
    examPlanId: z.uuid(),
    expectedVersion: z.number().int().min(0).default(0),
    includeWeekends: z.boolean().default(true),
    minutesAvailablePerDay: z.number().int().min(5).max(1_440),
    name: z.string().trim().min(1).max(120),
    status: z.enum(["active", "completed", "archived"]).default("active"),
  })
  .strict();

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success || new Date(parsed.data.examAt) <= new Date())
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose a future exam date and a realistic daily study window.",
        retryable: false,
      }),
    );
  const input = parsed.data;
  const [profileResult, learnerResult] = await Promise.all([
    context.database.client
      .from("profiles")
      .select("timezone,study_day_start")
      .eq("id", context.accountId)
      .maybeSingle(),
    context.database.client
      .from("learner_profiles")
      .select("kind,settings")
      .eq("id", context.learnerProfileId)
      .maybeSingle(),
  ]);
  if (profileResult.error || learnerResult.error || !learnerResult.data)
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "Study-day preferences are unavailable.",
        retryable: true,
      }),
    );
  const settings = record(learnerResult.data.settings);
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
  const now = new Date();
  const [all, due] = await Promise.all([
    buildStudyQueuePlan(
      context.accountId,
      context.learnerProfileId,
      timezone,
      studyDayStart,
      {
        deckIds: input.deckIds,
        mode: "cram",
        rescheduling: false,
        seed: input.examPlanId,
      },
      now,
    ),
    buildStudyQueuePlan(
      context.accountId,
      context.learnerProfileId,
      timezone,
      studyDayStart,
      {
        deckIds: input.deckIds,
        mode: "due_only",
        rescheduling: true,
        seed: input.examPlanId,
      },
      now,
    ),
  ]);
  if (all.cards.length === 0)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Add active cards to the selected decks before making an exam plan.",
        retryable: false,
      }),
    );
  const masteryResult = await context.database.client
    .from("concept_mastery")
    .select("overall")
    .eq("learner_profile_id", context.learnerProfileId)
    .in(
      "card_id",
      all.cards.map((card) => card.cardId),
    );
  if (masteryResult.error)
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "Current mastery is unavailable.",
        retryable: true,
      }),
    );
  const masteries = masteryResult.data ?? [];
  const averageMastery = masteries.length
    ? masteries.reduce((sum, mastery) => sum + mastery.overall, 0) / all.cards.length
    : 0;
  const plan = buildExamPlan({
    averageMastery,
    candidateCount: all.cards.length,
    examAt: input.examAt,
    includeWeekends: input.includeWeekends,
    minutesAvailablePerDay: input.minutesAvailablePerDay,
    minutesPerItem: 1.5,
    now: now.toISOString(),
  });
  const assumptions = {
    averageMastery,
    currentDueLoad: due.cards.length,
    minutesPerItem: 1.5,
    noGradePromise: true,
  };
  const scope = { deckIds: input.deckIds ?? [...new Set(all.cards.map((card) => card.deckId))] };
  const { data, error } = await context.privileged.rpc("admin_upsert_exam_plan", {
    p_actor_account_id: context.accountId,
    p_assumptions: toDatabaseJson(assumptions),
    p_auth_session_id: context.authSessionId,
    p_config_schema_version: 1,
    p_device_id: context.deviceId,
    p_exam_at: input.examAt,
    p_exam_plan_id: input.examPlanId,
    p_expected_version: input.expectedVersion,
    p_learner_profile_id: context.learnerProfileId,
    p_name: input.name,
    p_occurred_at: now.toISOString(),
    p_plan: toDatabaseJson(plan),
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_scope: toDatabaseJson(scope),
    p_status: input.status,
    p_timezone: timezone,
  });
  if (error || !data)
    return context.applyCookies(srsDatabaseError(error ?? {}, "The exam plan could not be saved."));
  return context.applyCookies(apiSuccess({ data: { plan, saved: data, assumptions, scope } }));
}
