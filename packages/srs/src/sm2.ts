import { SRS_ENGINE_VERSION } from "./fsrs";
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

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const DEFAULT_EASE = 2_500;
const MINIMUM_EASE = 1_300;

function date(value: Date | string): Date {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Review time must be a valid date.");
  return parsed;
}

function dueAfter(now: Date, milliseconds: number): string {
  return new Date(now.getTime() + milliseconds).toISOString();
}

function boundedInterval(value: number, preset: SchedulerPreset): number {
  return Math.max(1, Math.min(preset.maximumIntervalDays, Math.round(value)));
}

function learningTransition(
  before: Schedule,
  preset: SchedulerPreset,
  rating: ReviewRating,
  now: Date,
): Schedule {
  const relearning = before.state === "relearning";
  const steps = relearning ? preset.relearningStepsMinutes : preset.learningStepsMinutes;
  const current = Math.max(0, Math.min(before.learningStep, Math.max(0, steps.length - 1)));
  const firstMinutes = steps[0] ?? 1_440;
  const currentMinutes = steps[current] ?? firstMinutes;
  const nextMinutes = steps[current + 1];

  if (rating === "again") {
    return {
      ...before,
      state: relearning ? "relearning" : "learning",
      due: dueAfter(now, firstMinutes * MINUTE_MS),
      lastReviewedAt: now.toISOString(),
      scheduledDays: 0,
      learningStep: 0,
      reps: before.reps + 1,
      lapses: before.lapses + (relearning ? 1 : 0),
      legacyEaseFactor: Math.max(MINIMUM_EASE, (before.legacyEaseFactor ?? DEFAULT_EASE) - 200),
    };
  }

  if (rating === "hard") {
    const hardMinutes = nextMinutes
      ? Math.round((currentMinutes + nextMinutes) / 2)
      : Math.round(currentMinutes * 1.5);
    return {
      ...before,
      state: relearning ? "relearning" : "learning",
      due: dueAfter(now, hardMinutes * MINUTE_MS),
      lastReviewedAt: now.toISOString(),
      scheduledDays: 0,
      learningStep: current,
      reps: before.reps + 1,
      legacyEaseFactor: Math.max(MINIMUM_EASE, (before.legacyEaseFactor ?? DEFAULT_EASE) - 150),
    };
  }

  if (rating === "good" && nextMinutes !== undefined) {
    return {
      ...before,
      state: relearning ? "relearning" : "learning",
      due: dueAfter(now, nextMinutes * MINUTE_MS),
      lastReviewedAt: now.toISOString(),
      scheduledDays: 0,
      learningStep: current + 1,
      reps: before.reps + 1,
    };
  }

  const interval = boundedInterval(
    rating === "easy"
      ? Math.max(4, before.scheduledDays * 1.3)
      : Math.max(1, relearning ? before.scheduledDays * 0.7 : 1),
    preset,
  );
  return {
    ...before,
    state: "review",
    due: dueAfter(now, interval * DAY_MS),
    lastReviewedAt: now.toISOString(),
    elapsedDays: before.lastReviewedAt
      ? Math.max(0, Math.round((now.getTime() - date(before.lastReviewedAt).getTime()) / DAY_MS))
      : 0,
    scheduledDays: interval,
    learningStep: 0,
    reps: before.reps + 1,
    legacyEaseFactor:
      rating === "easy"
        ? Math.min(4_000, (before.legacyEaseFactor ?? DEFAULT_EASE) + 150)
        : (before.legacyEaseFactor ?? DEFAULT_EASE),
  };
}

function reviewTransition(
  before: Schedule,
  preset: SchedulerPreset,
  rating: ReviewRating,
  now: Date,
): Schedule {
  const ease = before.legacyEaseFactor ?? DEFAULT_EASE;
  const elapsedDays = before.lastReviewedAt
    ? Math.max(0, Math.round((now.getTime() - date(before.lastReviewedAt).getTime()) / DAY_MS))
    : 0;

  if (rating === "again") {
    const relearnMinutes = preset.relearningStepsMinutes[0];
    if (preset.shortTermEnabled && relearnMinutes !== undefined) {
      return {
        ...before,
        state: "relearning",
        due: dueAfter(now, relearnMinutes * MINUTE_MS),
        lastReviewedAt: now.toISOString(),
        elapsedDays,
        learningStep: 0,
        reps: before.reps + 1,
        lapses: before.lapses + 1,
        legacyEaseFactor: Math.max(MINIMUM_EASE, ease - 200),
      };
    }
    return {
      ...before,
      due: dueAfter(now, DAY_MS),
      lastReviewedAt: now.toISOString(),
      elapsedDays,
      scheduledDays: 1,
      reps: before.reps + 1,
      lapses: before.lapses + 1,
      legacyEaseFactor: Math.max(MINIMUM_EASE, ease - 200),
    };
  }

  const factor = ease / 1_000;
  const interval = boundedInterval(
    rating === "hard"
      ? before.scheduledDays * 1.2
      : rating === "easy"
        ? before.scheduledDays * factor * 1.3
        : before.scheduledDays <= 1
          ? 6
          : before.scheduledDays * factor,
    preset,
  );
  const easeDelta = rating === "hard" ? -150 : rating === "easy" ? 150 : 0;

  return {
    ...before,
    due: dueAfter(now, interval * DAY_MS),
    lastReviewedAt: now.toISOString(),
    elapsedDays,
    scheduledDays: interval,
    reps: before.reps + 1,
    legacyEaseFactor: Math.max(MINIMUM_EASE, Math.min(4_000, ease + easeDelta)),
  };
}

export function createEmptySm2Schedule(nowInput: Date | string): Schedule {
  const now = date(nowInput);
  return {
    algorithm: "sm2",
    state: "new",
    due: now.toISOString(),
    lastReviewedAt: null,
    stability: null,
    difficulty: null,
    elapsedDays: 0,
    scheduledDays: 0,
    learningStep: 0,
    reps: 0,
    lapses: 0,
    legacyEaseFactor: DEFAULT_EASE,
    schedulerVersion: SRS_ENGINE_VERSION,
  };
}

export function applySm2Rating(input: ApplyRatingInput): ScheduleTransition {
  if (input.schedule.algorithm !== "sm2") throw new Error("SM-2 cannot apply an FSRS schedule.");
  const reviewedAt = date(input.reviewedAt);
  const durationMs = input.durationMs ?? 0;
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000) {
    throw new Error("Review duration must be an integer from 0 through 86400000 milliseconds.");
  }
  const after =
    input.schedule.state === "review"
      ? reviewTransition(input.schedule, input.preset, input.rating, reviewedAt)
      : learningTransition(input.schedule, input.preset, input.rating, reviewedAt);

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

export function previewSm2Ratings(
  schedule: Schedule,
  preset: SchedulerPreset,
  nowInput: Date | string,
): RatingPreviews {
  const now = date(nowInput);
  return Object.fromEntries(
    (["again", "hard", "good", "easy"] as const).map((rating) => {
      const after = applySm2Rating({ schedule, preset, rating, reviewedAt: now }).after;
      const seconds = Math.max(0, Math.round((date(after.due).getTime() - now.getTime()) / 1_000));
      const preview: RatingPreview = {
        rating,
        due: after.due,
        intervalSeconds: seconds,
        intervalLabel: formatInterval(seconds),
        state: after.state,
      };
      return [rating, preview];
    }),
  ) as RatingPreviews;
}

export function sm2Retrievability(schedule: Schedule, atInput: Date | string): number | null {
  if (schedule.state === "new" || !schedule.lastReviewedAt || schedule.scheduledDays <= 0)
    return null;
  const elapsed = Math.max(
    0,
    (date(atInput).getTime() - date(schedule.lastReviewedAt).getTime()) / DAY_MS,
  );
  return Math.max(
    0,
    Math.min(1, Math.exp((-Math.log(10) * elapsed) / Math.max(1, schedule.scheduledDays))),
  );
}
