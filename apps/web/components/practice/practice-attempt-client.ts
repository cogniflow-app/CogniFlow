import { gradeAnswer, gradeSelection, type GradeResult, type GradingRules } from "@lumen/grading";

import type { OfflinePracticeCommand } from "@/components/offline/offline-provider.client";
import type { PracticeAttemptResult, PracticeCardView } from "@/lib/practice/models";

interface ApiResponse<T> {
  readonly data?: T;
  readonly message?: string;
}

export async function recordPracticeAttempt({
  answerRevealed = false,
  card,
  durationMs,
  hintsUsed = 0,
  response,
  responseKind,
  retryCount = 0,
  selfVerdict,
  queueOffline,
}: {
  readonly answerRevealed?: boolean;
  readonly card: PracticeCardView;
  readonly durationMs: number;
  readonly hintsUsed?: number;
  readonly response: string;
  readonly responseKind: string;
  readonly retryCount?: number;
  readonly selfVerdict?: "correct" | "partial" | "incorrect" | "needs_review";
  readonly queueOffline?: (command: OfflinePracticeCommand) => Promise<void>;
}): Promise<PracticeAttemptResult> {
  const command: OfflinePracticeCommand = {
    answerRevealed,
    attemptId: crypto.randomUUID(),
    contentVersion: card.contentVersion,
    durationMs: Math.max(0, Math.round(durationMs)),
    hintsUsed,
    idempotencyKey: crypto.randomUUID(),
    itemPosition: card.item.position,
    response,
    responseKind,
    retryCount,
    selfConfidence: null,
    ...(selfVerdict ? { selfVerdict } : {}),
    sessionId: card.session.id,
  };
  if (!navigator.onLine && queueOffline) {
    await queueOffline(command);
    return localResult(card, command);
  }
  let responseRequest: Response;
  try {
    responseRequest = await fetch("/api/practice/attempts", {
      body: JSON.stringify(command),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    if (!queueOffline) throw error;
    await queueOffline(command);
    return localResult(card, command);
  }
  const payload = (await responseRequest
    .json()
    .catch(() => ({}))) as ApiResponse<PracticeAttemptResult>;
  if (!responseRequest.ok || !payload.data)
    throw new Error(payload.message ?? "Your answer could not be saved. Try again.");
  return payload.data;
}

function selfGrade(verdict: NonNullable<OfflinePracticeCommand["selfVerdict"]>): GradeResult {
  const correctness = verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0;
  return {
    confidence: verdict === "needs_review" ? 0.5 : 1,
    correctness,
    explanation: "This local grade will be verified by the server when synchronization completes.",
    matchedRule: "offline_self_review",
    normalizedExpected: [],
    normalizedReceived: "",
    overrideAllowed: verdict !== "correct",
    verdict,
  };
}

function localGrade(card: PracticeCardView, command: OfflinePracticeCommand): GradeResult {
  if (command.selfVerdict) return selfGrade(command.selfVerdict);
  if (card.item.questionKind === "select_all") {
    let selected: string[] = [];
    try {
      const parsed: unknown = JSON.parse(command.response);
      if (Array.isArray(parsed))
        selected = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      selected = [];
    }
    return gradeSelection({
      correct: card.correctChoices,
      options: card.choices,
      selected,
    });
  }
  return gradeAnswer({
    expected: [card.answer],
    profile: { mode: card.session.config.gradingMode },
    received: command.response,
    rules: card.answerRules as GradingRules,
  });
}

function localResult(
  card: PracticeCardView,
  command: OfflinePracticeCommand,
): PracticeAttemptResult {
  return {
    attemptId: command.attemptId,
    grade: localGrade(card, command),
    mastery: card.mastery,
    qualification: {
      eligible: false,
      reason: "Synchronize this attempt before applying an optional SRS rating.",
      suggestedRating: null,
    },
  };
}
