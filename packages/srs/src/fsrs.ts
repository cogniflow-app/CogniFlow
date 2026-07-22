import {
  FSRSVersion,
  Rating,
  State,
  createEmptyCard as createFsrsCard,
  fsrs,
  type Card,
  type Grade,
  type StepUnit,
} from "ts-fsrs";

import { formatInterval } from "./time";
import type {
  ApplyRatingInput,
  RatingPreview,
  RatingPreviews,
  ReviewRating,
  Schedule,
  ScheduleTransition,
  SchedulerPreset,
} from "./types";

export const TS_FSRS_VERSION = "5.4.1";
export const FSRS_MODEL_VERSION = FSRSVersion;
export const SRS_ENGINE_VERSION = `lumen-srs/1 (${FSRS_MODEL_VERSION})`;

const ratingToFsrs: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const stateToFsrs = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
} as const;

const stateFromFsrs = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
} as const;

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Review time must be a valid date.");
  return date;
}

function toSteps(minutes: readonly number[]): StepUnit[] {
  return minutes.map((value) => `${value}m` as StepUnit);
}

function engineFor(preset: SchedulerPreset) {
  const engine = fsrs({
    request_retention: preset.requestedRetention,
    maximum_interval: preset.maximumIntervalDays,
    learning_steps: toSteps(preset.learningStepsMinutes),
    relearning_steps: toSteps(preset.relearningStepsMinutes),
    enable_short_term: preset.shortTermEnabled,
    enable_fuzz: preset.fuzzEnabled,
    ...(preset.fsrsWeights ? { w: preset.fsrsWeights } : {}),
  });
  return engine;
}

function toCard(schedule: Schedule): Card {
  if (schedule.algorithm !== "fsrs") throw new Error("FSRS cannot apply an SM-2 schedule.");
  return {
    due: new Date(schedule.due),
    stability: schedule.stability ?? 0,
    difficulty: schedule.difficulty ?? 0,
    elapsed_days: schedule.elapsedDays,
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningStep,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: stateToFsrs[schedule.state],
    ...(schedule.lastReviewedAt ? { last_review: new Date(schedule.lastReviewedAt) } : {}),
  };
}

function fromCard(card: Card): Schedule {
  return {
    algorithm: "fsrs",
    state: stateFromFsrs[card.state],
    due: card.due.toISOString(),
    lastReviewedAt: card.last_review?.toISOString() ?? null,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningStep: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    legacyEaseFactor: null,
    schedulerVersion: SRS_ENGINE_VERSION,
  };
}

function deterministicSeed(schedule: Schedule, now: Date): string {
  return [
    schedule.due,
    schedule.lastReviewedAt ?? "new",
    schedule.reps,
    schedule.lapses,
    now.toISOString(),
  ].join(":");
}

export function createEmptyFsrsSchedule(nowInput: Date | string): Schedule {
  const card = createFsrsCard(toDate(nowInput));
  return fromCard(card);
}

export function previewFsrsRatings(
  schedule: Schedule,
  preset: SchedulerPreset,
  nowInput: Date | string,
): RatingPreviews {
  const now = toDate(nowInput);
  const engine = engineFor(preset);
  engine.seed = deterministicSeed(schedule, now);
  const result = engine.repeat(toCard(schedule), now);

  return Object.fromEntries(
    (Object.entries(ratingToFsrs) as [ReviewRating, Grade][]).map(([rating, grade]) => {
      const card = result[grade].card;
      const seconds = Math.max(0, Math.round((card.due.getTime() - now.getTime()) / 1_000));
      const preview: RatingPreview = {
        rating,
        due: card.due.toISOString(),
        intervalSeconds: seconds,
        intervalLabel:
          preset.fuzzEnabled && seconds >= 86_400
            ? `About ${formatInterval(seconds)}`
            : formatInterval(seconds),
        state: stateFromFsrs[card.state],
      };
      return [rating, preview];
    }),
  ) as RatingPreviews;
}

export function applyFsrsRating(input: ApplyRatingInput): ScheduleTransition {
  const reviewedAt = toDate(input.reviewedAt);
  const durationMs = input.durationMs ?? 0;
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000) {
    throw new Error("Review duration must be an integer from 0 through 86400000 milliseconds.");
  }
  const engine = engineFor(input.preset);
  engine.seed = deterministicSeed(input.schedule, reviewedAt);
  const next = engine.next(toCard(input.schedule), reviewedAt, ratingToFsrs[input.rating]);
  const after = fromCard(next.card);

  return {
    before: input.schedule,
    after,
    log: {
      rating: input.rating,
      reviewedAt: reviewedAt.toISOString(),
      durationMs,
      stateBefore: input.schedule.state,
      stateAfter: after.state,
      dueBefore: input.schedule.due,
      dueAfter: after.due,
      scheduleBefore: input.schedule,
      scheduleAfter: after,
      schedulerVersion: SRS_ENGINE_VERSION,
      requestedRetention: input.preset.requestedRetention,
    },
  };
}

export function fsrsRetrievability(schedule: Schedule, atInput: Date | string): number | null {
  if (schedule.state === "new" || schedule.stability === null || schedule.stability <= 0)
    return null;
  const engine = fsrs();
  const value = engine.get_retrievability(toCard(schedule), toDate(atInput), false);
  return Math.max(0, Math.min(1, value));
}
