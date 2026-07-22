import fc from "fast-check";
import { Rating, State, fsrs } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_FSRS_PRESET,
  FSRS_MODEL_VERSION,
  SRS_ENGINE_VERSION,
  TS_FSRS_VERSION,
  applyRating,
  createEmptySchedule,
  deserializePreset,
  forget,
  migrateSchedule,
  previewRatings,
  rebuildFromLogs,
  retrievability,
  rollback,
  serializePreset,
} from "../src";

const now = new Date("2026-07-21T15:00:00.000Z");
const noFuzz = { ...DEFAULT_FSRS_PRESET, fuzzEnabled: false };

describe("FSRS scheduler", () => {
  it("pins and identifies the upstream model", () => {
    expect(TS_FSRS_VERSION).toBe("5.4.1");
    expect(FSRS_MODEL_VERSION).toContain("FSRS-6.0");
    expect(SRS_ENGINE_VERSION).toContain("lumen-srs/1");
  });

  it("creates a serializable FSRS card without a fabricated ease factor", () => {
    const schedule = createEmptySchedule(noFuzz, now);
    expect(schedule).toMatchObject({
      algorithm: "fsrs",
      state: "new",
      due: now.toISOString(),
      legacyEaseFactor: null,
      reps: 0,
    });
    expect(JSON.parse(JSON.stringify(schedule))).toEqual(schedule);
  });

  it("previews all four ratings and applies the selected transition", () => {
    const schedule = createEmptySchedule(noFuzz, now);
    const previews = previewRatings(schedule, noFuzz, now);
    expect(Object.keys(previews)).toEqual(["again", "hard", "good", "easy"]);

    for (const rating of ["again", "hard", "good", "easy"] as const) {
      const transition = applyRating({
        schedule,
        preset: noFuzz,
        rating,
        reviewedAt: now,
        durationMs: 1_200,
      });
      expect(transition.after.due).toBe(previews[rating].due);
      expect(transition.after.state).toBe(previews[rating].state);
      expect(transition.log.durationMs).toBe(1_200);
      expect(transition.log.schedulerVersion).toBe(SRS_ENGINE_VERSION);
    }
  });

  it("labels fuzzed day-scale previews as approximate", () => {
    const reviewSchedule = {
      ...createEmptySchedule(DEFAULT_FSRS_PRESET, now),
      difficulty: 5,
      due: now.toISOString(),
      lastReviewedAt: "2026-07-11T15:00:00.000Z",
      reps: 5,
      scheduledDays: 10,
      stability: 10,
      state: "review" as const,
    };
    expect(
      Object.values(previewRatings(reviewSchedule, DEFAULT_FSRS_PRESET, now)).some((preview) =>
        preview.intervalLabel.startsWith("About "),
      ),
    ).toBe(true);
  });

  it("matches pinned ts-fsrs transitions for every rating", () => {
    const schedule = createEmptySchedule(noFuzz, now);
    const engine = fsrs({
      request_retention: 0.9,
      maximum_interval: 36_500,
      learning_steps: ["1m", "10m"],
      relearning_steps: ["10m"],
      enable_short_term: true,
      enable_fuzz: false,
    });
    const upstream = {
      again: Rating.Again,
      hard: Rating.Hard,
      good: Rating.Good,
      easy: Rating.Easy,
    } as const;
    for (const rating of ["again", "hard", "good", "easy"] as const) {
      const expected = engine.next(
        {
          due: new Date(schedule.due),
          stability: schedule.stability ?? 0,
          difficulty: schedule.difficulty ?? 0,
          elapsed_days: schedule.elapsedDays,
          scheduled_days: schedule.scheduledDays,
          learning_steps: schedule.learningStep,
          reps: schedule.reps,
          lapses: schedule.lapses,
          state: State.New,
        },
        now,
        upstream[rating],
      ).card;
      const actual = applyRating({ schedule, preset: noFuzz, rating, reviewedAt: now }).after;
      expect(actual.due).toBe(expected.due.toISOString());
      expect(actual.stability).toBe(expected.stability);
      expect(actual.difficulty).toBe(expected.difficulty);
      expect(actual.scheduledDays).toBe(expected.scheduled_days);
    }
  });

  it("handles FSRS relearning and maximum-interval bounds", () => {
    const oneDayMaximum = { ...noFuzz, maximumIntervalDays: 1 };
    const graduated = applyRating({
      schedule: createEmptySchedule(oneDayMaximum, now),
      preset: oneDayMaximum,
      rating: "easy",
      reviewedAt: now,
    }).after;
    expect(graduated.state).toBe("review");
    expect(graduated.scheduledDays).toBeLessThanOrEqual(1);

    const lapsed = applyRating({
      schedule: graduated,
      preset: oneDayMaximum,
      rating: "again",
      reviewedAt: "2026-07-22T15:00:00.000Z",
    }).after;
    expect(lapsed).toMatchObject({ lapses: 1, state: "relearning" });
    expect(previewRatings(lapsed, oneDayMaximum, "2026-07-22T15:10:00.000Z")).toHaveProperty(
      "good",
    );
  });

  it("rolls back and rebuilds from immutable history", () => {
    const initial = createEmptySchedule(noFuzz, now);
    const first = applyRating({
      schedule: initial,
      preset: noFuzz,
      rating: "good",
      reviewedAt: now,
    });
    expect(rollback(first)).toEqual(initial);

    const history = [
      { rating: "good" as const, reviewedAt: now.toISOString() },
      { rating: "easy" as const, reviewedAt: "2026-07-22T15:00:00.000Z" },
      { rating: "again" as const, reviewedAt: "2026-07-29T15:00:00.000Z" },
    ];
    const rebuilt = rebuildFromLogs(history, noFuzz, now);
    expect(rebuilt.transitions).toHaveLength(3);
    expect(rebuilt.schedule.reps).toBe(3);
    expect(rebuilt.schedule.lapses).toBe(1);
    expect(rebuildFromLogs(history, noFuzz, now).schedule).toEqual(rebuilt.schedule);
    expect(forget(rebuilt.schedule, noFuzz, "2026-08-01T00:00:00.000Z")).toMatchObject({
      lapses: 0,
      reps: 0,
      state: "new",
    });
  });

  it("round-trips project-owned preset serialization", () => {
    expect(deserializePreset(serializePreset(noFuzz))).toEqual(noFuzz);
  });

  it("migrates imported history by replaying it into a target algorithm", () => {
    const history = [
      { rating: "good" as const, reviewedAt: now.toISOString() },
      { rating: "good" as const, reviewedAt: "2026-07-22T15:00:00.000Z" },
    ];
    const migrated = migrateSchedule(history, { ...noFuzz, algorithm: "sm2" }, now);
    expect(migrated.algorithm).toBe("sm2");
    expect(migrated.legacyEaseFactor).toBe(2_500);
    expect(migrated.stability).toBeNull();
  });

  it("returns bounded retrievability after a review", () => {
    const first = applyRating({
      schedule: createEmptySchedule(noFuzz, now),
      preset: noFuzz,
      rating: "easy",
      reviewedAt: now,
    }).after;
    const value = retrievability(first, "2026-07-23T15:00:00.000Z");
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("keeps no-fuzz transitions deterministic and intervals bounded", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("again", "hard", "good", "easy"), { minLength: 1, maxLength: 40 }),
        (ratings) => {
          const run = () => {
            let schedule = createEmptySchedule(noFuzz, now);
            ratings.forEach((rating, index) => {
              const reviewedAt = new Date(now.getTime() + index * 86_400_000);
              schedule = applyRating({ schedule, preset: noFuzz, rating, reviewedAt }).after;
              expect(schedule.scheduledDays).toBeGreaterThanOrEqual(0);
              expect(schedule.scheduledDays).toBeLessThanOrEqual(noFuzz.maximumIntervalDays);
              expect(new Date(schedule.due).getTime()).toBeGreaterThanOrEqual(reviewedAt.getTime());
            });
            return schedule;
          };
          expect(run()).toEqual(run());
        },
      ),
      { numRuns: 100 },
    );
  });
});
