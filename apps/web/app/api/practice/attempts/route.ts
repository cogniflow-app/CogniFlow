import { gradeAnswer, gradeSelection, type GradingRules, type GradeResult } from "@lumen/grading";
import {
  updateMastery,
  type EvidenceKind,
  type MasteryState,
  type PracticeEvidence,
} from "@lumen/learning-engine";
import { z } from "zod";
import type { NextRequest } from "next/server";

import type { PracticeMasteryView } from "@/lib/practice/models";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { sha256Hex } from "@/lib/server/crypto";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import { readPracticeCard } from "@/lib/server/practice-repository";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";

const schema = z
  .object({
    answerRevealed: z.boolean().default(false),
    attemptId: z.uuid(),
    durationMs: z.number().int().min(0).max(86_400_000),
    hintsUsed: z.number().int().min(0).max(100).default(0),
    idempotencyKey: z.uuid(),
    itemPosition: z.number().int().min(0).max(9_999),
    response: z.string().max(4_096),
    responseKind: z.string().trim().min(1).max(80),
    retryCount: z.number().int().min(0).max(100).default(0),
    selfConfidence: z.number().min(0).max(1).nullable().default(null),
    selfVerdict: z.enum(["correct", "partial", "incorrect", "needs_review"]).optional(),
    sessionId: z.uuid(),
  })
  .strict();

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === "string").slice(0, 100);
  return result.length ? result : undefined;
}

function rules(value: Readonly<Record<string, unknown>>): GradingRules {
  const synonymsInput = value.synonyms;
  const synonyms =
    typeof synonymsInput === "object" && synonymsInput !== null && !Array.isArray(synonymsInput)
      ? Object.fromEntries(
          Object.entries(synonymsInput).flatMap(([key, entry]) => {
            const accepted = stringArray(entry);
            return accepted ? [[key, accepted] as const] : [];
          }),
        )
      : undefined;
  const aliases = stringArray(value.aliases);
  const forbiddenKeywords = stringArray(value.forbiddenKeywords);
  const requiredKeywords = stringArray(value.requiredKeywords);
  const listInput =
    typeof value.list === "object" && value.list !== null && !Array.isArray(value.list)
      ? (value.list as Readonly<Record<string, unknown>>)
      : null;
  const listItems = Array.isArray(listInput?.items)
    ? listInput.items.flatMap((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
        const entry = item as Readonly<Record<string, unknown>>;
        if (typeof entry.answer !== "string") return [];
        const entryAliases = stringArray(entry.aliases);
        return [
          {
            answer: entry.answer,
            ...(entryAliases ? { aliases: entryAliases } : {}),
            ...(typeof entry.required === "boolean" ? { required: entry.required } : {}),
          },
        ];
      })
    : [];
  const numericInput =
    typeof value.numeric === "object" && value.numeric !== null && !Array.isArray(value.numeric)
      ? (value.numeric as Readonly<Record<string, unknown>>)
      : null;
  const numeric = numericInput
    ? {
        ...(typeof numericInput.absoluteTolerance === "number"
          ? { absoluteTolerance: numericInput.absoluteTolerance }
          : {}),
        ...(typeof numericInput.relativeTolerance === "number"
          ? { relativeTolerance: numericInput.relativeTolerance }
          : {}),
        ...(typeof numericInput.expectedUnit === "string"
          ? { expectedUnit: numericInput.expectedUnit }
          : {}),
      }
    : null;
  return {
    ...(aliases ? { aliases } : {}),
    ...(forbiddenKeywords ? { forbiddenKeywords } : {}),
    ...(requiredKeywords ? { requiredKeywords } : {}),
    ...(listInput && listItems.length
      ? { list: { items: listItems, orderMatters: listInput.orderMatters === true } }
      : {}),
    ...(numeric && Object.keys(numeric).length ? { numeric } : {}),
    ...(value.allowMath === true ? { allowMath: true } : {}),
    ...(synonyms && Object.keys(synonyms).length ? { synonyms } : {}),
  };
}

function selfGrade(verdict: NonNullable<z.infer<typeof schema>["selfVerdict"]>): GradeResult {
  const correctness = verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0;
  return Object.freeze({
    confidence: verdict === "needs_review" ? 0.5 : 1,
    correctness,
    explanation:
      verdict === "correct"
        ? "You marked this self-reviewed response correct."
        : verdict === "partial"
          ? "You marked this response partly correct."
          : verdict === "needs_review"
            ? "This response is queued for manual self-review."
            : "You marked this response as still learning.",
    matchedRule: "self_review",
    normalizedExpected: [],
    normalizedReceived: "",
    overrideAllowed: verdict !== "correct",
    verdict,
  });
}

function evidenceKind(mode: string, questionKind: string): EvidenceKind {
  if (mode === "write") return "written";
  if (mode === "test") return "test";
  if (mode === "spell") return "spell";
  if (mode === "pronunciation") return "pronunciation";
  if (mode === "diagram") return "diagram";
  if (mode === "match") return "match";
  if (questionKind === "multiple_choice") return "multiple_choice";
  if (questionKind === "true_false") return "true_false";
  if (questionKind === "select_all") return "select_all";
  if (questionKind === "typed") return "typed";
  return "flashcard";
}

function suggestedRating(grade: GradeResult, durationMs: number): "hard" | "good" | "easy" {
  if (grade.correctness >= 0.98 && grade.confidence >= 0.9 && durationMs <= 8_000) return "easy";
  if (grade.correctness >= 0.9 && grade.confidence >= 0.8) return "good";
  return "hard";
}

function masteryForEngine(value: PracticeMasteryView): MasteryState {
  const { version: _version, ...state } = value;
  return state;
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The practice response could not be validated.",
        retryable: false,
      }),
    );
  const input = parsed.data;
  const card = await readPracticeCard(
    input.sessionId,
    context.accountId,
    context.learnerProfileId,
    input.itemPosition,
  );
  if (!card || card.item.position !== input.itemPosition)
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "This practice item changed. Reload the session before answering.",
        retryable: false,
      }),
    );
  if (card.session.status !== "active")
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "Resume this session before answering.",
        retryable: false,
      }),
    );
  const occurredAt = new Date().toISOString();
  const selected = (() => {
    if (card.item.questionKind !== "select_all") return [];
    try {
      const value: unknown = JSON.parse(input.response);
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").slice(0, 100)
        : [];
    } catch {
      return [];
    }
  })();
  const rawGrade = input.selfVerdict
    ? selfGrade(input.selfVerdict)
    : card.item.questionKind === "select_all"
      ? gradeSelection({ correct: card.correctChoices, options: card.choices, selected })
      : gradeAnswer({
          expected: card.answer,
          profile: { mode: card.session.config.gradingMode },
          received: input.response,
          rules: rules(card.answerRules),
        });
  const grade: GradeResult =
    card.session.mode === "test" &&
    card.item.questionKind === "select_all" &&
    !card.session.config.testOptions.partialCredit &&
    rawGrade.verdict === "partial"
      ? Object.freeze({
          ...rawGrade,
          correctness: 0,
          explanation: "This test requires the exact set of correct options.",
          verdict: "incorrect" as const,
        })
      : rawGrade;
  const evidence: PracticeEvidence = {
    answerRevealed: input.answerRevealed,
    contentVersion: card.contentVersion,
    expectedLatencyMs: 12_000,
    grade,
    hintsUsed: input.hintsUsed,
    kind: evidenceKind(card.session.mode, card.item.questionKind),
    latencyMs: input.durationMs,
    occurredAt,
    retryCount: input.retryCount,
    ...(input.selfConfidence === null ? {} : { selfReportedConfidence: input.selfConfidence }),
  };
  const nextMastery = updateMastery(masteryForEngine(card.mastery), evidence);
  const scheduleEligible =
    card.schedule === null ||
    card.schedule.state === "new" ||
    (card.schedule.due !== null && new Date(card.schedule.due) <= new Date(occurredAt));
  const eligible =
    ["learn", "write"].includes(card.session.mode) &&
    ["free_recall", "delayed_retest"].includes(card.item.questionLevel) &&
    grade.verdict === "correct" &&
    grade.correctness >= 0.8 &&
    input.hintsUsed === 0 &&
    !input.answerRevealed &&
    input.retryCount === 0 &&
    scheduleEligible;
  const rating = eligible ? suggestedRating(grade, input.durationMs) : null;
  const response = input.response.trim();
  const responseHash = response ? await sha256Hex(response) : null;
  const command = {
    answerRevealed: input.answerRevealed,
    attemptId: input.attemptId,
    cardId: card.cardId,
    durationMs: input.durationMs,
    grade,
    hintsUsed: input.hintsUsed,
    idempotencyKey: input.idempotencyKey,
    itemPosition: input.itemPosition,
    learnerProfileId: context.learnerProfileId,
    mastery: nextMastery,
    responseHash,
    responseKind: input.responseKind,
    retryCount: input.retryCount,
    sessionId: input.sessionId,
  };
  const commandHash = await sha256Hex(JSON.stringify(command));
  const { data, error } = await context.privileged.rpc("admin_record_practice_attempt", {
    p_actor_account_id: context.accountId,
    p_answer_revealed: input.answerRevealed,
    p_auth_session_id: context.authSessionId,
    p_command_hash: commandHash,
    p_complete_item: true,
    p_confidence: grade.confidence,
    p_content_version: card.contentVersion,
    p_correctness: grade.correctness,
    p_device_id: context.deviceId,
    p_duration_ms: input.durationMs,
    p_expected_mastery_version: card.mastery.version,
    p_explanation: grade.explanation,
    p_hints_used: input.hintsUsed,
    p_idempotency_key: input.idempotencyKey,
    p_item_position: input.itemPosition,
    p_learner_profile_id: context.learnerProfileId,
    p_matched_rule: grade.matchedRule,
    p_new_mastery: toDatabaseJson(nextMastery),
    p_occurred_at: occurredAt,
    p_practice_attempt_id: input.attemptId,
    p_practice_session_id: input.sessionId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_response_hash: nullableRpcArgument(responseHash),
    p_response_kind: input.responseKind,
    p_response_text: nullableRpcArgument(response || null),
    p_retention: response ? "minimized_text" : "discarded",
    p_retry_count: input.retryCount,
    p_self_confidence: nullableRpcArgument(input.selfConfidence),
    p_suggested_rating: nullableRpcArgument(rating),
    p_verdict: grade.verdict,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The practice response could not be saved."),
    );
  return context.applyCookies(
    apiSuccess({
      data: {
        attemptId: input.attemptId,
        grade,
        mastery: { ...nextMastery, version: card.mastery.version + 1 },
        qualification: {
          eligible,
          reason: eligible
            ? `Unaided ${card.item.questionLevel.replaceAll("_", " ")} on a ${card.schedule ? card.schedule.state : "new"} card qualifies. Nothing changes unless you explicitly accept a rating.`
            : "This practice attempt updated mastery only. It did not change your SRS schedule.",
          suggestedRating: rating,
        },
        stored: data,
      },
    }),
  );
}
