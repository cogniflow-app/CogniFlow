import type { GradeResult } from "@lumen/grading";

export const masteryStages = [
  "unseen",
  "introduced",
  "recognition",
  "guided_recall",
  "free_recall",
  "mastered",
  "needs_refresh",
] as const;
export type MasteryStage = (typeof masteryStages)[number];

export const evidenceKinds = [
  "flashcard",
  "multiple_choice",
  "select_all",
  "true_false",
  "match",
  "typed",
  "written",
  "spell",
  "pronunciation",
  "diagram",
  "test",
] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];

export interface MasteryState {
  readonly recognition: number;
  readonly recall: number;
  readonly overall: number;
  readonly stage: MasteryStage;
  readonly evidenceCount: number;
  readonly spacedRecallSuccesses: number;
  readonly lastEvidenceAt: string | null;
  readonly contentVersion: number;
}

export interface PracticeEvidence {
  readonly kind: EvidenceKind;
  readonly occurredAt: string;
  readonly grade: Pick<GradeResult, "correctness" | "confidence" | "verdict">;
  readonly hintsUsed?: number;
  readonly answerRevealed?: boolean;
  readonly retryCount?: number;
  readonly latencyMs?: number;
  readonly expectedLatencyMs?: number;
  readonly selfReportedConfidence?: number;
  readonly contentVersion: number;
}

export const learningLevels = [
  "introduction",
  "recognition",
  "guided_recall",
  "free_recall",
  "delayed_retest",
] as const;
export type LearningLevel = (typeof learningLevels)[number];

export interface LearningCandidate {
  readonly cardId: string;
  readonly noteId: string;
  readonly deckId: string;
  readonly siblingKey: string;
  readonly answerKey: string;
  readonly mastery: MasteryState;
  readonly dueAt: string | null;
  readonly missCount: number;
  readonly difficulty: number;
  readonly tags: readonly string[];
  readonly goalIds: readonly string[];
  readonly questionLevel: LearningLevel;
  readonly supportsKeyboard: boolean;
  readonly supportsAudio: boolean;
  readonly requiresMotion: boolean;
}

export interface SelectionContext {
  readonly seed: string;
  readonly now: string;
  readonly sessionIndex: number;
  readonly recentCardIds: readonly string[];
  readonly recentSiblingKeys: readonly string[];
  readonly preferredDeckIds?: readonly string[];
  readonly preferredTags?: readonly string[];
  readonly goalIds?: readonly string[];
  readonly examAt?: string;
  readonly desiredLevel?: LearningLevel;
  readonly keyboardOnly?: boolean;
  readonly audioAvailable?: boolean;
  readonly reducedMotion?: boolean;
}

export interface ScoredLearningCandidate {
  readonly candidate: LearningCandidate;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface ChoiceCandidate {
  readonly cardId: string;
  readonly siblingKey: string;
  readonly answer: string;
  readonly difficulty: number;
}

export interface ChoiceQuestion {
  readonly targetCardId: string;
  readonly options: readonly { readonly answer: string; readonly correct: boolean }[];
}

export interface ExamPlanInput {
  readonly now: string;
  readonly examAt: string;
  readonly candidateCount: number;
  readonly averageMastery: number;
  readonly minutesPerItem: number;
  readonly minutesAvailablePerDay: number;
  readonly includeWeekends: boolean;
}

export interface ExamPlanDay {
  readonly studyDay: string;
  readonly items: number;
  readonly estimatedMinutes: number;
  readonly focus: "learn" | "mixed" | "recall" | "light_review";
}

export interface ExamPlan {
  readonly daysAvailable: number;
  readonly totalEstimatedMinutes: number;
  readonly recommendedItemsPerDay: number;
  readonly feasible: boolean;
  readonly warning: string | null;
  readonly days: readonly ExamPlanDay[];
}
