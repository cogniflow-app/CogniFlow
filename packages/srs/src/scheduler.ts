import {
  applyFsrsRating,
  createEmptyFsrsSchedule,
  fsrsRetrievability,
  previewFsrsRatings,
} from "./fsrs";
import { validatePreset } from "./preset";
import {
  applySm2Rating,
  createEmptySm2Schedule,
  previewSm2Ratings,
  sm2Retrievability,
} from "./sm2";
import type {
  ApplyRatingInput,
  RatingPreviews,
  ReviewHistoryEntry,
  Schedule,
  ScheduleTransition,
  SchedulerPreset,
} from "./types";

export function createEmptySchedule(presetInput: SchedulerPreset, now: Date | string): Schedule {
  const preset = validatePreset(presetInput);
  return preset.algorithm === "fsrs" ? createEmptyFsrsSchedule(now) : createEmptySm2Schedule(now);
}

function assertCompatible(schedule: Schedule, preset: SchedulerPreset): void {
  if (schedule.algorithm !== preset.algorithm) {
    throw new Error(
      `Schedule algorithm ${schedule.algorithm} does not match preset algorithm ${preset.algorithm}.`,
    );
  }
}

export function previewRatings(
  schedule: Schedule,
  presetInput: SchedulerPreset,
  now: Date | string,
): RatingPreviews {
  const preset = validatePreset(presetInput);
  assertCompatible(schedule, preset);
  return preset.algorithm === "fsrs"
    ? previewFsrsRatings(schedule, preset, now)
    : previewSm2Ratings(schedule, preset, now);
}

export function applyRating(input: ApplyRatingInput): ScheduleTransition {
  const preset = validatePreset(input.preset);
  assertCompatible(input.schedule, preset);
  return preset.algorithm === "fsrs"
    ? applyFsrsRating({ ...input, preset })
    : applySm2Rating({ ...input, preset });
}

export function retrievability(schedule: Schedule, at: Date | string): number | null {
  return schedule.algorithm === "fsrs"
    ? fsrsRetrievability(schedule, at)
    : sm2Retrievability(schedule, at);
}

export function rollback(log: Pick<ScheduleTransition, "before" | "after">): Schedule {
  if (log.before.algorithm !== log.after.algorithm)
    throw new Error("Cannot roll back across schedule algorithms.");
  return structuredClone(log.before);
}

export function forget(schedule: Schedule, preset: SchedulerPreset, now: Date | string): Schedule {
  assertCompatible(schedule, validatePreset(preset));
  return createEmptySchedule(preset, now);
}

export function rebuildFromLogs(
  history: readonly ReviewHistoryEntry[],
  preset: SchedulerPreset,
  createdAt: Date | string,
): { schedule: Schedule; transitions: ScheduleTransition[] } {
  let schedule = createEmptySchedule(preset, createdAt);
  const transitions: ScheduleTransition[] = [];
  const ordered = [...history].sort(
    (left, right) => new Date(left.reviewedAt).getTime() - new Date(right.reviewedAt).getTime(),
  );

  for (const entry of ordered) {
    const transition = applyRating({
      schedule,
      preset,
      rating: entry.rating,
      reviewedAt: entry.reviewedAt,
      ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
    });
    transitions.push(transition);
    schedule = transition.after;
  }

  return { schedule, transitions };
}

export function migrateSchedule(
  history: readonly ReviewHistoryEntry[],
  nextPreset: SchedulerPreset,
  createdAt: Date | string,
): Schedule {
  return rebuildFromLogs(history, nextPreset, createdAt).schedule;
}
