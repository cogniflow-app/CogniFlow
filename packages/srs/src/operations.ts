import { createEmptySchedule, rebuildFromLogs } from "./scheduler";
import type { ReviewHistoryEntry, Schedule, SchedulerPreset, WorkloadEstimate } from "./types";

export function setManualDueDate(schedule: Schedule, due: Date | string): Schedule {
  const parsed = due instanceof Date ? new Date(due) : new Date(due);
  if (Number.isNaN(parsed.getTime())) throw new Error("Manual due date must be valid.");
  return { ...schedule, due: parsed.toISOString() };
}

export function rescheduleWithinRange(
  schedule: Schedule,
  earliest: Date | string,
  latest: Date | string,
  deterministicFraction: number,
): Schedule {
  const start = new Date(earliest).getTime();
  const end = new Date(latest).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new Error("Reschedule range is invalid.");
  if (
    !Number.isFinite(deterministicFraction) ||
    deterministicFraction < 0 ||
    deterministicFraction > 1
  ) {
    throw new Error("Deterministic fraction must be between zero and one.");
  }
  return {
    ...schedule,
    due: new Date(Math.round(start + (end - start) * deterministicFraction)).toISOString(),
  };
}

export function rebuildSchedule(
  history: readonly ReviewHistoryEntry[],
  preset: SchedulerPreset,
  createdAt: Date | string,
): Schedule {
  return rebuildFromLogs(history, preset, createdAt).schedule;
}

export function preserveOrRelearnAfterContentChange(
  choice: "preserve" | "relearn" | "reset",
  schedule: Schedule,
  preset: SchedulerPreset,
  now: Date | string,
): Schedule {
  if (choice === "preserve") return structuredClone(schedule);
  if (choice === "reset") return createEmptySchedule(preset, now);
  const empty = createEmptySchedule(preset, now);
  return { ...empty, state: "relearning", lapses: schedule.lapses, reps: schedule.reps };
}

export function estimateRetentionWorkload(
  currentRetention: number,
  nextRetention: number,
  currentDailyReviews: number,
): WorkloadEstimate {
  if (currentRetention <= 0 || currentRetention >= 1 || nextRetention <= 0 || nextRetention >= 1) {
    throw new Error("Retention must be between zero and one.");
  }
  const multiplier = Math.log(currentRetention) / Math.log(nextRetention);
  const estimatedDailyReviews = Math.max(0, Math.round(currentDailyReviews * multiplier));
  const relativeChange =
    currentDailyReviews === 0
      ? 0
      : (estimatedDailyReviews - currentDailyReviews) / currentDailyReviews;
  return {
    currentDailyReviews,
    estimatedDailyReviews,
    relativeChange,
    explanation:
      "This planning estimate uses the ratio of forgetting-curve review frequencies; actual workload depends on your cards and history.",
  };
}
