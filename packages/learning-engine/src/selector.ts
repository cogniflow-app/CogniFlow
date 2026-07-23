import type {
  ChoiceCandidate,
  ChoiceQuestion,
  LearningCandidate,
  ScoredLearningCandidate,
  SelectionContext,
} from "./types";

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function deterministicJitter(seed: string, key: string): number {
  return hash(`${seed}:${key}`) / 0xffffffff;
}

function includesAny(values: readonly string[], desired: readonly string[] | undefined): boolean {
  return desired?.some((value) => values.includes(value)) ?? false;
}

function accessibilityMismatch(
  candidate: LearningCandidate,
  context: SelectionContext,
): string | null {
  if (context.keyboardOnly && !candidate.supportsKeyboard) return "keyboard";
  if (
    context.audioAvailable === false &&
    candidate.supportsAudio &&
    candidate.questionLevel === "free_recall"
  ) {
    return "audio";
  }
  if (context.reducedMotion && candidate.requiresMotion) return "motion";
  return null;
}

export function scoreLearningCandidate(
  candidate: LearningCandidate,
  context: SelectionContext,
): ScoredLearningCandidate {
  const mismatch = accessibilityMismatch(candidate, context);
  if (mismatch) {
    return Object.freeze({
      candidate,
      score: -10,
      reasons: Object.freeze([`incompatible:${mismatch}`]),
    });
  }

  const reasons: string[] = [];
  let score = (1 - candidate.mastery.overall) * 0.34;
  reasons.push("mastery_gap");

  if (candidate.dueAt) {
    const overdueDays =
      (new Date(context.now).getTime() - new Date(candidate.dueAt).getTime()) / 86_400_000;
    if (overdueDays >= 0) {
      score += bounded(overdueDays / 14) * 0.18 + 0.04;
      reasons.push("due");
    }
  }
  if (candidate.missCount > 0) {
    score += bounded(candidate.missCount / 5) * 0.14;
    reasons.push("recent_miss");
  }
  if (context.examAt) {
    const days = Math.max(
      0.25,
      (new Date(context.examAt).getTime() - new Date(context.now).getTime()) / 86_400_000,
    );
    score += bounded((14 - days) / 14) * (1 - candidate.mastery.recall) * 0.14;
    reasons.push("exam_urgency");
  }
  if (context.preferredDeckIds?.includes(candidate.deckId)) {
    score += 0.06;
    reasons.push("preferred_deck");
  }
  if (includesAny(candidate.tags, context.preferredTags)) {
    score += 0.05;
    reasons.push("preferred_tag");
  }
  if (includesAny(candidate.goalIds, context.goalIds)) {
    score += 0.07;
    reasons.push("goal");
  }
  if (context.desiredLevel === candidate.questionLevel) {
    score += 0.08;
    reasons.push("question_progression");
  }
  score += (1 - Math.abs(candidate.difficulty - 0.55)) * 0.03;

  if (context.recentCardIds.includes(candidate.cardId)) {
    score -= 1;
    reasons.push("anti_repeat");
  }
  if (context.recentSiblingKeys.includes(candidate.siblingKey)) {
    score -= 0.55;
    reasons.push("sibling_spacing");
  }
  score +=
    deterministicJitter(`${context.seed}:${String(context.sessionIndex)}`, candidate.cardId) *
    0.0001;
  return Object.freeze({ candidate, score, reasons: Object.freeze(reasons) });
}

export function selectLearningItems(
  candidates: readonly LearningCandidate[],
  context: SelectionContext,
  limit: number,
): readonly ScoredLearningCandidate[] {
  return Object.freeze(
    candidates
      .map((candidate) => scoreLearningCandidate(candidate, context))
      .filter((candidate) => candidate.score > -10)
      .sort(
        (left, right) =>
          right.score - left.score || left.candidate.cardId.localeCompare(right.candidate.cardId),
      )
      .slice(0, Math.max(0, Math.floor(limit))),
  );
}

export function buildChoiceQuestion(
  target: ChoiceCandidate,
  pool: readonly ChoiceCandidate[],
  seed: string,
  optionCount = 4,
): ChoiceQuestion {
  const distractors = pool
    .filter(
      (candidate) =>
        candidate.cardId !== target.cardId &&
        candidate.siblingKey !== target.siblingKey &&
        candidate.answer !== target.answer,
    )
    .sort(
      (left, right) =>
        Math.abs(left.difficulty - target.difficulty) -
          Math.abs(right.difficulty - target.difficulty) ||
        deterministicJitter(seed, left.cardId) - deterministicJitter(seed, right.cardId) ||
        left.cardId.localeCompare(right.cardId),
    )
    .slice(0, Math.max(0, optionCount - 1));
  const options = [
    { answer: target.answer, correct: true },
    ...distractors.map((candidate) => ({ answer: candidate.answer, correct: false })),
  ].sort(
    (left, right) =>
      deterministicJitter(seed, left.answer) - deterministicJitter(seed, right.answer) ||
      left.answer.localeCompare(right.answer),
  );
  return Object.freeze({ targetCardId: target.cardId, options: Object.freeze(options) });
}
