import { describe, expect, it } from "vitest";

import {
  DEFAULT_SM2_PRESET,
  applyRating,
  createEmptySchedule,
  previewRatings,
  type Schedule,
} from "../src";

const now = new Date("2026-07-21T15:00:00.000Z");

describe("SM-2 compatibility", () => {
  it("stores ease only for SM-2 schedules and honors learning steps", () => {
    const schedule = createEmptySchedule(DEFAULT_SM2_PRESET, now);
    expect(schedule.legacyEaseFactor).toBe(2_500);
    expect(schedule.stability).toBeNull();
    const previews = previewRatings(schedule, DEFAULT_SM2_PRESET, now);
    expect(previews.again.intervalSeconds).toBe(60);
    expect(previews.good.intervalSeconds).toBe(600);
    expect(previews.easy.intervalSeconds).toBe(4 * 86_400);
  });

  it("changes ease and intervals for review ratings", () => {
    const review = {
      ...createEmptySchedule(DEFAULT_SM2_PRESET, now),
      state: "review" as const,
      scheduledDays: 10,
      lastReviewedAt: "2026-07-11T15:00:00.000Z",
    };
    const hard = applyRating({
      schedule: review,
      preset: DEFAULT_SM2_PRESET,
      rating: "hard",
      reviewedAt: now,
    }).after;
    const good = applyRating({
      schedule: review,
      preset: DEFAULT_SM2_PRESET,
      rating: "good",
      reviewedAt: now,
    }).after;
    const easy = applyRating({
      schedule: review,
      preset: DEFAULT_SM2_PRESET,
      rating: "easy",
      reviewedAt: now,
    }).after;
    expect(hard).toMatchObject({ scheduledDays: 12, legacyEaseFactor: 2_350 });
    expect(good).toMatchObject({ scheduledDays: 25, legacyEaseFactor: 2_500 });
    expect(easy).toMatchObject({ scheduledDays: 33, legacyEaseFactor: 2_650 });
  });

  it("moves a lapse into relearning and never drops ease below 1.3", () => {
    let schedule: Schedule = {
      ...createEmptySchedule(DEFAULT_SM2_PRESET, now),
      state: "review" as const,
      scheduledDays: 10,
      legacyEaseFactor: 1_300,
      lastReviewedAt: "2026-07-11T15:00:00.000Z",
    };
    schedule = applyRating({
      schedule,
      preset: DEFAULT_SM2_PRESET,
      rating: "again",
      reviewedAt: now,
    }).after;
    expect(schedule).toMatchObject({ state: "relearning", lapses: 1, legacyEaseFactor: 1_300 });
  });
});
