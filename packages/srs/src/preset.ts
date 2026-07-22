import { z } from "zod";

import { ratings, scheduleStates, schedulerAlgorithms, type SchedulerPreset } from "./types";

const minuteStepSchema = z
  .number()
  .int()
  .min(1)
  .max(30 * 24 * 60);

export const schedulerPresetSchema = z
  .object({
    algorithm: z.enum(schedulerAlgorithms),
    requestedRetention: z.number().min(0.7).max(0.99),
    maximumIntervalDays: z.number().int().min(1).max(36_500),
    learningStepsMinutes: z.array(minuteStepSchema).max(10),
    relearningStepsMinutes: z.array(minuteStepSchema).max(10),
    shortTermEnabled: z.boolean(),
    fuzzEnabled: z.boolean(),
    newCardsPerDay: z.number().int().min(0).max(10_000),
    reviewsPerDay: z.number().int().min(0).max(100_000),
    newCardOrder: z.enum(["created", "due", "random"]),
    reviewOrder: z.enum(["due", "relative_overdueness", "retrievability", "random"]),
    newReviewMix: z.enum(["before", "after", "interleave"]),
    burySiblings: z.boolean(),
    leechThreshold: z.number().int().min(1).max(100),
    leechAction: z.enum(["tag", "suspend"]),
    fsrsWeights: z.array(z.number().finite()).min(17).max(21).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !value.shortTermEnabled &&
      (value.learningStepsMinutes.length > 0 || value.relearningStepsMinutes.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["shortTermEnabled"],
        message: "Short-term scheduling must be enabled when learning steps are configured.",
      });
    }
  });

export const DEFAULT_FSRS_PRESET: Readonly<SchedulerPreset> = Object.freeze({
  algorithm: "fsrs",
  requestedRetention: 0.9,
  maximumIntervalDays: 36_500,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  shortTermEnabled: true,
  fuzzEnabled: true,
  newCardsPerDay: 20,
  reviewsPerDay: 200,
  newCardOrder: "created",
  reviewOrder: "due",
  newReviewMix: "interleave",
  burySiblings: true,
  leechThreshold: 8,
  leechAction: "tag",
});

export const DEFAULT_SM2_PRESET: Readonly<SchedulerPreset> = Object.freeze({
  ...DEFAULT_FSRS_PRESET,
  algorithm: "sm2",
});

export function validatePreset(input: unknown): SchedulerPreset {
  return schedulerPresetSchema.parse(input);
}

export function serializePreset(preset: SchedulerPreset): string {
  return JSON.stringify(validatePreset(preset));
}

export function deserializePreset(serialized: string): SchedulerPreset {
  return validatePreset(JSON.parse(serialized) as unknown);
}

export function parseSteps(input: string): number[] {
  const normalized = input.trim();
  if (!normalized) return [];

  return normalized.split(/[\s,]+/u).map((raw) => {
    const match = /^(\d+)(m|h|d)$/iu.exec(raw);
    if (!match) throw new Error(`Invalid step \"${raw}\". Use values such as 1m, 2h, or 1d.`);
    const value = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    const minutes = value * (unit === "d" ? 1_440 : unit === "h" ? 60 : 1);
    return minuteStepSchema.parse(minutes);
  });
}

export function formatSteps(steps: readonly number[]): string {
  return steps
    .map((minutes) => {
      if (minutes % 1_440 === 0) return `${minutes / 1_440}d`;
      if (minutes % 60 === 0) return `${minutes / 60}h`;
      return `${minutes}m`;
    })
    .join(" ");
}

export const reviewRatingSchema = z.enum(ratings);
export const scheduleStateSchema = z.enum(scheduleStates);
export const scheduleSchema = z
  .object({
    algorithm: z.enum(schedulerAlgorithms),
    state: scheduleStateSchema,
    due: z.iso.datetime({ offset: true }),
    lastReviewedAt: z.iso.datetime({ offset: true }).nullable(),
    stability: z.number().finite().min(0).max(36_500).nullable(),
    difficulty: z.number().finite().min(0).max(10).nullable(),
    elapsedDays: z.number().int().min(0).max(36_500),
    scheduledDays: z.number().int().min(0).max(36_500),
    learningStep: z.number().int().min(0).max(100),
    reps: z.number().int().min(0).max(10_000_000),
    lapses: z.number().int().min(0).max(10_000_000),
    legacyEaseFactor: z.number().int().min(1_300).max(4_000).nullable(),
    schedulerVersion: z.string().min(1).max(120),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.algorithm === "fsrs" && value.legacyEaseFactor !== null) {
      context.addIssue({
        code: "custom",
        path: ["legacyEaseFactor"],
        message: "FSRS does not use ease.",
      });
    }
    if (value.algorithm === "sm2" && (value.stability !== null || value.difficulty !== null)) {
      context.addIssue({
        code: "custom",
        path: ["stability"],
        message: "SM-2 does not store FSRS memory state.",
      });
    }
  });
