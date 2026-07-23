import {
  emptyMastery,
  recommendLearnStep,
  selectLearningItems,
  type LearningCandidate,
  type LearningLevel,
  type MasteryState,
} from "@lumen/learning-engine";
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
import { buildStudyQueuePlan } from "@/lib/server/study-repository";

const schema = z
  .object({
    answerDirection: z.enum(["prompt_answer", "answer_prompt", "mixed"]).default("prompt_answer"),
    audio: z.boolean().default(true),
    autoplay: z.boolean().default(false),
    deckIds: z.array(z.uuid()).min(1).max(200).optional(),
    gradingMode: z.enum(["strict", "moderate", "relaxed", "custom"]).default("moderate"),
    goal: z
      .object({
        examAt: z.string().max(80).nullable().default(null),
        id: z.uuid().nullable().default(null),
        kind: z
          .enum([
            "recommended",
            "time",
            "count",
            "mastery",
            "new",
            "due",
            "weak",
            "starred",
            "exam",
          ])
          .default("recommended"),
        masteryTarget: z.number().min(0.5).max(1).nullable().default(null),
        timeMinutes: z.number().int().min(1).max(240).nullable().default(null),
      })
      .strict()
      .default({
        examAt: null,
        id: null,
        kind: "recommended",
        masteryTarget: null,
        timeMinutes: null,
      }),
    hints: z.enum(["off", "on_request"]).default("on_request"),
    language: z.string().trim().min(2).max(35).default("en-US"),
    mode: z.enum([
      "flashcards",
      "learn",
      "write",
      "test",
      "match",
      "spell",
      "pronunciation",
      "diagram",
    ]),
    questionTypes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    retypeCorrect: z.boolean().default(true),
    sessionId: z.uuid(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    targetCount: z.number().int().min(1).max(500).default(12),
    testOptions: z
      .object({
        layout: z.enum(["one_at_a_time", "one_page"]),
        partialCredit: z.boolean(),
        pauseAllowed: z.boolean(),
        reviewPolicy: z.enum(["after_each", "end"]),
      })
      .strict()
      .default({
        layout: "one_at_a_time",
        partialCredit: true,
        pauseAllowed: true,
        reviewPolicy: "end",
      }),
    testAttemptId: z.uuid().optional(),
    testDefinitionId: z.uuid().optional(),
    timerSeconds: z.number().int().min(30).max(14_400).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "test" && (!value.testAttemptId || !value.testDefinitionId)) {
      context.addIssue({ code: "custom", message: "Test storage identifiers are required." });
    }
    if (value.mode !== "test" && (value.testAttemptId || value.testDefinitionId)) {
      context.addIssue({ code: "custom", message: "Test identifiers are mode-specific." });
    }
    if (
      value.goal.kind === "exam" &&
      (!value.goal.examAt ||
        !Number.isFinite(Date.parse(value.goal.examAt)) ||
        Date.parse(value.goal.examAt) <= Date.now())
    ) {
      context.addIssue({ code: "custom", message: "An exam date is required for this goal." });
    }
  });

type Input = z.infer<typeof schema>;

function stateFromRow(
  row: Readonly<Record<string, unknown>> | undefined,
  contentVersion: number,
): MasteryState {
  const empty = emptyMastery(contentVersion);
  if (!row) return empty;
  const stage = typeof row.stage === "string" ? row.stage : empty.stage;
  return {
    recognition: typeof row.recognition === "number" ? row.recognition : 0,
    recall: typeof row.recall === "number" ? row.recall : 0,
    overall: typeof row.overall === "number" ? row.overall : 0,
    stage: [
      "unseen",
      "introduced",
      "recognition",
      "guided_recall",
      "free_recall",
      "mastered",
      "needs_refresh",
    ].includes(stage)
      ? (stage as MasteryState["stage"])
      : empty.stage,
    evidenceCount: typeof row.evidence_count === "number" ? row.evidence_count : 0,
    spacedRecallSuccesses:
      typeof row.spaced_recall_successes === "number" ? row.spaced_recall_successes : 0,
    lastEvidenceAt: typeof row.last_evidence_at === "string" ? row.last_evidence_at : null,
    contentVersion: typeof row.content_version === "number" ? row.content_version : contentVersion,
  };
}

function levelFor(mode: Input["mode"], mastery: MasteryState): LearningLevel {
  if (mode === "flashcards") return "introduction";
  if (mode === "match") return "recognition";
  if (mode === "pronunciation") return "guided_recall";
  if (["write", "spell", "diagram", "test"].includes(mode)) return "free_recall";
  const recommendation = recommendLearnStep(mastery);
  return recommendation === "mastered" ? "delayed_retest" : recommendation;
}

function kindFor(
  mode: Input["mode"],
  level: LearningLevel,
  index: number,
  questionTypes: readonly string[],
): string {
  if (mode === "flashcards") return "flashcard";
  if (mode === "write") return "written";
  if (mode === "match") return "match";
  if (mode === "spell") return "spell";
  if (mode === "pronunciation") return "pronunciation";
  if (mode === "diagram") return "diagram";
  const supported = questionTypes.filter((type) =>
    (mode === "test"
      ? ["multiple_choice", "select_all", "true_false", "typed", "ordering", "list"]
      : ["flashcard", "multiple_choice", "select_all", "true_false", "typed", "ordering", "list"]
    ).includes(type),
  );
  if (mode === "test")
    return (
      supported[index % supported.length] ??
      ["multiple_choice", "typed", "true_false"][index % 3] ??
      "typed"
    );
  const preferred =
    level === "introduction" ? "flashcard" : level === "recognition" ? "multiple_choice" : "typed";
  return supported.includes(preferred) ? preferred : (supported[0] ?? preferred);
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose a valid practice setup.",
        retryable: false,
      }),
    );
  const input = parsed.data;
  const startedAt = new Date();
  const queue = await buildStudyQueuePlan(
    context.accountId,
    context.learnerProfileId,
    "UTC",
    240,
    {
      deckIds: input.deckIds,
      mode: "cram",
      rescheduling: false,
      reviewOrder: "random",
      seed: input.sessionId,
    },
    startedAt,
  );
  if (queue.cards.length === 0)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Add an active card to this study scope before starting practice.",
        retryable: false,
      }),
    );
  const cardIds = queue.cards.map((card) => card.cardId);
  const [cardRows, masteryRows] = await Promise.all([
    context.database.client
      .from("cards")
      .select("id,note_id,content_version")
      .in("id", cardIds)
      .eq("active", true)
      .is("deleted_at", null),
    context.database.client
      .from("concept_mastery")
      .select("*")
      .eq("learner_profile_id", context.learnerProfileId)
      .in("card_id", cardIds),
  ]);
  if (cardRows.error || masteryRows.error)
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "Practice mastery is temporarily unavailable.",
        retryable: true,
      }),
    );
  const cardById = new Map((cardRows.data ?? []).map((card) => [card.id, card]));
  const masteryByCard = new Map(
    (masteryRows.data ?? []).map((mastery) => [mastery.card_id, mastery]),
  );
  const candidates: LearningCandidate[] = queue.cards.flatMap((queued) => {
    const card = cardById.get(queued.cardId);
    if (!card) return [];
    const state = stateFromRow(masteryByCard.get(card.id), card.content_version);
    const matchesGoal =
      input.goal.kind === "recommended" ||
      input.goal.kind === "count" ||
      input.goal.kind === "time" ||
      input.goal.kind === "mastery" ||
      input.goal.kind === "exam" ||
      (input.goal.kind === "weak" && state.overall < 0.5) ||
      (input.goal.kind === "starred" && queued.starred) ||
      (input.goal.kind === "new" && queued.state === "new") ||
      (input.goal.kind === "due" &&
        queued.state !== "new" &&
        queued.due !== null &&
        new Date(queued.due) <= startedAt);
    const matchesTags =
      input.tags.length === 0 || input.tags.some((tag) => (queued.tags ?? []).includes(tag));
    if (!matchesGoal || !matchesTags) return [];
    return [
      {
        answerKey: card.id,
        cardId: card.id,
        deckId: queued.deckId,
        difficulty: queued.difficulty ?? 0.5,
        dueAt: queued.due,
        goalIds: input.goal.id ? [input.goal.id] : [],
        mastery: state,
        missCount: 0,
        noteId: card.note_id,
        questionLevel: levelFor(input.mode, state),
        requiresMotion: false,
        siblingKey: card.note_id,
        supportsAudio: true,
        supportsKeyboard: true,
        tags: queued.tags ?? [],
      },
    ];
  });
  if (candidates.length === 0)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "No active cards match this goal and scope. Choose a broader goal or deck.",
        retryable: false,
      }),
    );
  const effectiveTargetCount =
    input.goal.kind === "time" && input.goal.timeMinutes
      ? Math.min(input.targetCount, Math.max(1, Math.floor((input.goal.timeMinutes * 60) / 45)))
      : input.targetCount;
  const needsSecondPass = input.mode === "learn" || input.mode === "write";
  const uniqueLimit = needsSecondPass
    ? Math.max(1, Math.ceil(effectiveTargetCount / 2))
    : effectiveTargetCount;
  const selected = selectLearningItems(
    candidates,
    {
      audioAvailable: true,
      now: startedAt.toISOString(),
      recentCardIds: [],
      recentSiblingKeys: [],
      reducedMotion: false,
      seed: input.sessionId,
      sessionIndex: 0,
      ...(input.goal.examAt ? { examAt: input.goal.examAt } : {}),
      ...(input.goal.id ? { goalIds: [input.goal.id] } : {}),
      ...(input.tags.length ? { preferredTags: input.tags } : {}),
    },
    uniqueLimit,
  ).map((item) => item.candidate);
  const queueItems = needsSecondPass
    ? [
        ...selected,
        ...selected.map((candidate) => ({
          ...candidate,
          questionLevel: "delayed_retest" as const,
        })),
      ].slice(0, effectiveTargetCount)
    : selected;
  const config = {
    audio: input.audio,
    answerDirection: input.answerDirection,
    autoplay: input.autoplay,
    gradingMode: input.gradingMode,
    goal: input.goal,
    hints: input.hints,
    language: input.language,
    mode: input.mode,
    questionTypes: input.questionTypes,
    rescheduling: false,
    retypeCorrect: input.retypeCorrect,
    targetCount: queueItems.length,
    tags: input.tags,
    testOptions: input.testOptions,
    testAttemptId: input.testAttemptId ?? null,
    testDefinitionId: input.testDefinitionId ?? null,
    timerSeconds: input.timerSeconds,
  };
  const scope = { deckIds: input.deckIds ?? [...new Set(queue.cards.map((card) => card.deckId))] };
  const items = queueItems.map((candidate, position) => ({
    cardId: candidate.cardId,
    position,
    questionKind: kindFor(input.mode, candidate.questionLevel, position, input.questionTypes),
    questionLevel: candidate.questionLevel,
    seedFragment: `${input.sessionId}:${String(position)}`,
  }));
  if (input.goal.id) {
    const goalNames: Readonly<Record<string, string>> = {
      due: "Practice due material",
      exam: "Prepare for an exam",
      mastery: "Reach a mastery target",
      new: "Introduce new material",
      starred: "Practice starred cards",
      time: "Practice for a set time",
      weak: "Strengthen weak areas",
    };
    const { error: goalError } = await context.privileged.rpc("admin_upsert_learning_goal", {
      p_actor_account_id: context.accountId,
      p_auth_session_id: context.authSessionId,
      p_device_id: context.deviceId,
      p_expected_version: 0,
      p_goal_id: input.goal.id,
      p_goal_type: input.goal.kind,
      p_learner_profile_id: context.learnerProfileId,
      p_name: goalNames[input.goal.kind] ?? "Practice goal",
      p_occurred_at: startedAt.toISOString(),
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      p_progress: toDatabaseJson({ completedItems: 0, practiceSessionId: input.sessionId }),
      p_status: "active",
      p_target: toDatabaseJson({ ...input.goal, scope, tags: input.tags }),
    });
    if (goalError)
      return context.applyCookies(
        srsDatabaseError(goalError, "The learning goal could not be saved."),
      );
  }
  const commandHash = await sha256Hex(
    JSON.stringify({
      accountId: context.accountId,
      config,
      items,
      learnerProfileId: context.learnerProfileId,
      scope,
      sessionId: input.sessionId,
    }),
  );
  const { data, error } = await context.privileged.rpc("admin_create_practice_session", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_command_hash: commandHash,
    p_config: toDatabaseJson(config),
    p_config_schema_version: 1,
    p_device_id: context.deviceId,
    p_items: toDatabaseJson(items),
    p_learner_profile_id: context.learnerProfileId,
    p_mode: input.mode,
    p_practice_session_id: input.sessionId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_queue_seed: input.sessionId,
    p_scope: toDatabaseJson(scope),
    p_started_at: startedAt.toISOString(),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The practice session could not be started."),
    );
  if (input.mode === "test" && input.testAttemptId && input.testDefinitionId) {
    const { error: definitionError } = await context.privileged.rpc(
      "admin_upsert_practice_test_definition",
      {
        p_actor_account_id: context.accountId,
        p_auth_session_id: context.authSessionId,
        p_config: toDatabaseJson(config),
        p_config_schema_version: 1,
        p_definition_id: input.testDefinitionId,
        p_device_id: context.deviceId,
        p_expected_version: 0,
        p_learner_profile_id: context.learnerProfileId,
        p_name: "Practice test",
        p_occurred_at: startedAt.toISOString(),
        p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      },
    );
    if (definitionError)
      return context.applyCookies(
        srsDatabaseError(definitionError, "The test definition could not be stored."),
      );
    const { error: attemptError } = await context.privileged.rpc(
      "admin_create_practice_test_attempt",
      {
        p_actor_account_id: context.accountId,
        p_auth_session_id: context.authSessionId,
        p_available_points: queueItems.length,
        p_definition_id: input.testDefinitionId,
        p_device_id: context.deviceId,
        p_learner_profile_id: context.learnerProfileId,
        p_practice_session_id: input.sessionId,
        p_profile_session_id: nullableRpcArgument(context.profileSessionId),
        p_question_count: queueItems.length,
        p_seed: input.sessionId,
        p_started_at: startedAt.toISOString(),
        p_test_attempt_id: input.testAttemptId,
      },
    );
    if (attemptError)
      return context.applyCookies(
        srsDatabaseError(attemptError, "The test attempt could not be stored."),
      );
  }
  return context.applyCookies(apiSuccess({ data }));
}
