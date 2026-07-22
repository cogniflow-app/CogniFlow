export const ratings = ["again", "hard", "good", "easy"] as const;
export type ReviewRating = (typeof ratings)[number];

export const scheduleStates = ["new", "learning", "review", "relearning"] as const;
export type ScheduleState = (typeof scheduleStates)[number];

export const schedulerAlgorithms = ["fsrs", "sm2"] as const;
export type SchedulerAlgorithm = (typeof schedulerAlgorithms)[number];

export type NewCardOrder = "created" | "due" | "random";
export type ReviewOrder = "due" | "relative_overdueness" | "retrievability" | "random";
export type NewReviewMix = "before" | "after" | "interleave";
export type LeechAction = "tag" | "suspend";

export interface SchedulerPreset {
  algorithm: SchedulerAlgorithm;
  requestedRetention: number;
  maximumIntervalDays: number;
  learningStepsMinutes: number[];
  relearningStepsMinutes: number[];
  shortTermEnabled: boolean;
  fuzzEnabled: boolean;
  newCardsPerDay: number;
  reviewsPerDay: number;
  newCardOrder: NewCardOrder;
  reviewOrder: ReviewOrder;
  newReviewMix: NewReviewMix;
  burySiblings: boolean;
  leechThreshold: number;
  leechAction: LeechAction;
  fsrsWeights?: number[] | undefined;
}

export interface Schedule {
  algorithm: SchedulerAlgorithm;
  state: ScheduleState;
  due: string;
  lastReviewedAt: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsedDays: number;
  scheduledDays: number;
  learningStep: number;
  reps: number;
  lapses: number;
  legacyEaseFactor: number | null;
  schedulerVersion: string;
}

export interface RatingPreview {
  rating: ReviewRating;
  due: string;
  intervalSeconds: number;
  intervalLabel: string;
  state: ScheduleState;
}

export type RatingPreviews = Record<ReviewRating, RatingPreview>;

export interface SchedulerReviewLog {
  rating: ReviewRating;
  reviewedAt: string;
  durationMs: number;
  stateBefore: ScheduleState;
  stateAfter: ScheduleState;
  dueBefore: string;
  dueAfter: string;
  scheduleBefore: Schedule;
  scheduleAfter: Schedule;
  schedulerVersion: string;
  requestedRetention: number;
}

export interface ScheduleTransition {
  before: Schedule;
  after: Schedule;
  log: SchedulerReviewLog;
}

export interface ApplyRatingInput {
  schedule: Schedule;
  preset: SchedulerPreset;
  rating: ReviewRating;
  reviewedAt: Date | string;
  durationMs?: number;
}

export interface ReviewHistoryEntry {
  rating: ReviewRating;
  reviewedAt: string;
  durationMs?: number;
}

export type QueueKind = "learning" | "review" | "new";

export interface QueueCandidate {
  algorithm?: SchedulerAlgorithm;
  cardId: string;
  noteId: string;
  deckId: string;
  createdAt: string;
  due: string;
  dueOrder?: number | null;
  difficulty?: number | null;
  lastReviewedAt?: string | null;
  state: ScheduleState;
  stability: number | null;
  suspended: boolean;
  buriedUntil: string | null;
  active: boolean;
  starred?: boolean;
  leech?: boolean;
  forgottenToday?: boolean;
  tags?: string[];
  lapses?: number;
  intervalDays?: number;
  label?: string;
  scheduleVersion?: number;
}

export interface QueueOptions {
  now: Date | string;
  studyDay: string;
  preset: SchedulerPreset;
  alreadyStudiedNew: number;
  alreadyStudiedReviews: number;
  seed: string;
  reviewOrderOverride?: ReviewOrder;
  mode?:
    | "today"
    | "new_only"
    | "due_only"
    | "forgotten_today"
    | "leeches"
    | "starred"
    | "review_ahead"
    | "cram"
    | "folder"
    | "tag_query"
    | "interval_range"
    | "card_state";
  reviewAheadDays?: number;
  rescheduling?: boolean;
  tagQuery?: string[];
  stateFilter?: ScheduleState[];
  intervalRangeDays?: { min: number; max: number };
}

export interface QueuedCard extends QueueCandidate {
  kind: QueueKind;
  rescheduling: boolean;
}

export interface QueueResult {
  cards: QueuedCard[];
  counts: { learning: number; review: number; new: number; total: number };
  excluded: {
    inactive: number;
    suspended: number;
    buried: number;
    future: number;
    sibling: number;
  };
}

export interface StudyDayOptions {
  timezone: string;
  studyDayStartMinutes: number;
}

export interface WorkloadEstimate {
  currentDailyReviews: number;
  estimatedDailyReviews: number;
  relativeChange: number;
  explanation: string;
}
