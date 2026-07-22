import {
  DEFAULT_FSRS_PRESET,
  scheduleSchema,
  schedulerPresetSchema,
  type Schedule,
  type SchedulerPreset,
} from "@lumen/srs";

type UnknownRow = Readonly<Record<string, unknown>>;

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];
}

export function presetFromDatabase(row: UnknownRow | null | undefined): SchedulerPreset {
  if (!row) return { ...DEFAULT_FSRS_PRESET };
  const parsed = schedulerPresetSchema.safeParse({
    algorithm: row.algorithm,
    requestedRetention: numberValue(row.requested_retention, 0.9),
    maximumIntervalDays: numberValue(row.maximum_interval_days, 36_500),
    learningStepsMinutes: numberArray(row.learning_steps_minutes),
    relearningStepsMinutes: numberArray(row.relearning_steps_minutes),
    shortTermEnabled: row.short_term_enabled === true,
    fuzzEnabled: row.fuzz_enabled !== false,
    newCardsPerDay: numberValue(row.new_cards_per_day, 20),
    reviewsPerDay: numberValue(row.reviews_per_day, 200),
    newCardOrder: row.new_card_order,
    reviewOrder: row.review_order,
    newReviewMix: row.new_review_mix,
    burySiblings: row.bury_siblings !== false,
    leechThreshold: numberValue(row.leech_threshold, 8),
    leechAction: row.leech_action,
    ...(Array.isArray(row.fsrs_weights) ? { fsrsWeights: numberArray(row.fsrs_weights) } : {}),
  });
  return parsed.success ? parsed.data : { ...DEFAULT_FSRS_PRESET };
}

export function scheduleFromDatabase(row: UnknownRow | null | undefined): Schedule | null {
  if (!row) return null;
  const parsed = scheduleSchema.safeParse({
    algorithm: row.algorithm,
    state: row.state,
    due: row.due,
    lastReviewedAt: row.last_reviewed_at ?? null,
    stability: row.stability ?? null,
    difficulty: row.difficulty ?? null,
    elapsedDays: numberValue(row.elapsed_days),
    scheduledDays: numberValue(row.scheduled_days),
    learningStep: numberValue(row.learning_step),
    reps: numberValue(row.reps),
    lapses: numberValue(row.lapses),
    legacyEaseFactor: row.legacy_ease_factor ?? null,
    schedulerVersion: row.scheduler_version,
  });
  return parsed.success ? parsed.data : null;
}

export function presetToDatabase(preset: SchedulerPreset): UnknownRow {
  return {
    algorithm: preset.algorithm,
    bury_siblings: preset.burySiblings,
    fsrs_weights: preset.fsrsWeights ?? null,
    fuzz_enabled: preset.fuzzEnabled,
    learning_steps_minutes: preset.learningStepsMinutes,
    leech_action: preset.leechAction,
    leech_threshold: preset.leechThreshold,
    maximum_interval_days: preset.maximumIntervalDays,
    new_card_order: preset.newCardOrder,
    new_cards_per_day: preset.newCardsPerDay,
    new_review_mix: preset.newReviewMix,
    relearning_steps_minutes: preset.relearningStepsMinutes,
    requested_retention: preset.requestedRetention,
    review_order: preset.reviewOrder,
    reviews_per_day: preset.reviewsPerDay,
    short_term_enabled: preset.shortTermEnabled,
  };
}

export function tagsFromDatabase(value: unknown): string[] {
  return stringArray(value);
}
