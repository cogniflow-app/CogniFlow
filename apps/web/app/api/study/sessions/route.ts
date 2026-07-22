import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { buildStudyQueuePlan } from "@/lib/server/study-repository";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import { studyFilterDefinitionSchema } from "@/lib/study/custom-filter";

const inputSchema = z
  .object({
    deckId: z.uuid().optional(),
    deckIds: z.array(z.uuid()).min(1).max(100).optional(),
    filterId: z.uuid().optional(),
    intervalRangeDays: z
      .object({
        max: z.number().int().min(0).max(36_500),
        min: z.number().int().min(0).max(36_500),
      })
      .strict()
      .optional(),
    mode: z
      .enum([
        "today",
        "new_only",
        "due_only",
        "forgotten_today",
        "leeches",
        "starred",
        "review_ahead",
        "cram",
        "folder",
        "tag_query",
        "interval_range",
        "card_state",
      ])
      .default("today"),
    rescheduling: z.boolean().default(true),
    reviewOrder: z.enum(["due", "random", "relative_overdueness", "retrievability"]).optional(),
    sessionId: z.uuid(),
    stateFilter: z
      .array(z.enum(["new", "learning", "review", "relearning"]))
      .min(1)
      .max(4)
      .optional(),
    tagQuery: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.deckId && value.deckIds)
      context.addIssue({ code: "custom", message: "Choose one deck scope.", path: ["deckIds"] });
    if (value.intervalRangeDays && value.intervalRangeDays.min > value.intervalRangeDays.max)
      context.addIssue({
        code: "custom",
        message: "Interval range is reversed.",
        path: ["intervalRangeDays"],
      });
    if (value.mode === "tag_query" && !value.tagQuery)
      context.addIssue({ code: "custom", message: "A tag is required.", path: ["tagQuery"] });
    if (value.mode === "interval_range" && !value.intervalRangeDays)
      context.addIssue({
        code: "custom",
        message: "An interval range is required.",
        path: ["intervalRangeDays"],
      });
    if (value.mode === "card_state" && !value.stateFilter)
      context.addIssue({
        code: "custom",
        message: "A card state is required.",
        path: ["stateFilter"],
      });
    if (value.mode === "folder" && !value.deckIds)
      context.addIssue({
        code: "custom",
        message: "Folder decks are required.",
        path: ["deckIds"],
      });
  });

const sourceByMode = {
  today: "today",
  new_only: "filtered",
  due_only: "filtered",
  forgotten_today: "filtered",
  leeches: "filtered",
  starred: "filtered",
  review_ahead: "review_ahead",
  cram: "cram",
  folder: "filtered",
  tag_query: "filtered",
  interval_range: "filtered",
  card_state: "filtered",
} as const;

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = inputSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose a valid study session.",
        retryable: false,
      }),
    );
  }
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
  if (profileResult.error || learnerResult.error || !learnerResult.data) {
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "Study preferences are unavailable.",
        retryable: true,
      }),
    );
  }
  const settings =
    typeof learnerResult.data.settings === "object" &&
    learnerResult.data.settings !== null &&
    !Array.isArray(learnerResult.data.settings)
      ? (learnerResult.data.settings as Readonly<Record<string, unknown>>)
      : {};
  let selection = studyFilterDefinitionSchema.parse({
    deckId: parsed.data.deckId,
    deckIds: parsed.data.deckIds,
    intervalRangeDays: parsed.data.intervalRangeDays,
    mode: parsed.data.mode,
    rescheduling: parsed.data.rescheduling,
    reviewOrder: parsed.data.reviewOrder,
    stateFilter: parsed.data.stateFilter,
    tagQuery: parsed.data.tagQuery,
  });
  if (parsed.data.filterId) {
    const { data: filter, error: filterError } = await context.database.client
      .from("study_filters")
      .select("definition")
      .eq("id", parsed.data.filterId)
      .eq("learner_profile_id", context.learnerProfileId)
      .is("deleted_at", null)
      .maybeSingle();
    const saved = studyFilterDefinitionSchema.safeParse(filter?.definition);
    if (filterError || !saved.success)
      return context.applyCookies(
        apiError(422, {
          code: "INVALID_INPUT",
          message: "That saved study filter is unavailable.",
          retryable: false,
        }),
      );
    selection = saved.data;
  }
  if (!selection.rescheduling && selection.mode === "today")
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Preview-only study is available from Custom study.",
        retryable: false,
      }),
    );
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
  const startedAt = new Date();
  const queue = await buildStudyQueuePlan(
    context.accountId,
    context.learnerProfileId,
    timezone,
    studyDayStart,
    {
      deckId: selection.deckId,
      deckIds: selection.deckIds,
      intervalRangeDays: selection.intervalRangeDays,
      mode: selection.mode,
      rescheduling: selection.rescheduling,
      reviewOrder: selection.reviewOrder,
      seed: parsed.data.sessionId,
      stateFilter: selection.stateFilter,
      tagQuery: selection.tagQuery,
    },
    startedAt,
  );
  if (queue.cards.length === 0) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "No cards match this study selection right now.",
        retryable: false,
      }),
    );
  }
  const source = parsed.data.filterId
    ? selection.mode === "cram"
      ? "cram"
      : "filtered"
    : selection.deckId
      ? "deck"
      : sourceByMode[selection.mode];
  const { data, error } = await context.privileged.rpc("admin_create_study_session", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_deck_id: nullableRpcArgument(selection.deckId ?? null),
    p_device_id: context.deviceId,
    p_filter_id: nullableRpcArgument(parsed.data.filterId ?? null),
    p_items: toDatabaseJson(
      queue.cards.map((card, position) => ({
        cardId: card.cardId,
        position,
        scheduleVersion: card.scheduleVersion ?? 0,
        state: card.state,
      })),
    ),
    p_learner_profile_id: context.learnerProfileId,
    p_mode: selection.deckId && !parsed.data.filterId ? "deck" : selection.mode,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_queue_seed: parsed.data.sessionId,
    p_rescheduling: selection.rescheduling,
    p_source: source,
    p_started_at: startedAt.toISOString(),
    p_study_day_start: studyDayStart,
    p_study_session_id: parsed.data.sessionId,
    p_timezone: timezone,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The study session could not be created."),
    );
  return context.applyCookies(apiSuccess({ data, queue: queue.counts }, 201));
}
