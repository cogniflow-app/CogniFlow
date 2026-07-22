import { describe, expect, it } from "vitest";

import {
  DEFAULT_FSRS_PRESET,
  DisabledSchedulerOptimizer,
  FeatureFlaggedSchedulerOptimizer,
  OPTIMIZER_MINIMUM_LOGS,
  createEmptySchedule,
  estimateRetentionWorkload,
  exportOptimizerHistory,
  preserveOrRelearnAfterContentChange,
  rescheduleWithinRange,
  setManualDueDate,
} from "../src";

const now = "2026-07-21T15:00:00.000Z";

describe("advanced scheduling operations", () => {
  it("sets and ranges due dates without mutating the input", () => {
    const schedule = createEmptySchedule(DEFAULT_FSRS_PRESET, now);
    expect(setManualDueDate(schedule, "2026-08-01T00:00:00.000Z").due).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(rescheduleWithinRange(schedule, "2026-08-01", "2026-08-11", 0.5).due).toBe(
      "2026-08-06T00:00:00.000Z",
    );
    expect(schedule.due).toBe(now);
  });

  it("applies explicit content-change schedule choices", () => {
    const schedule = createEmptySchedule(DEFAULT_FSRS_PRESET, now);
    expect(
      preserveOrRelearnAfterContentChange("preserve", schedule, DEFAULT_FSRS_PRESET, now),
    ).toEqual(schedule);
    expect(
      preserveOrRelearnAfterContentChange("relearn", schedule, DEFAULT_FSRS_PRESET, now).state,
    ).toBe("relearning");
    expect(
      preserveOrRelearnAfterContentChange("reset", schedule, DEFAULT_FSRS_PRESET, now).state,
    ).toBe("new");
  });

  it("provides a clearly qualified workload estimate", () => {
    const estimate = estimateRetentionWorkload(0.9, 0.95, 100);
    expect(estimate.estimatedDailyReviews).toBeGreaterThan(100);
    expect(estimate.explanation).toContain("estimate");
  });
});

describe("optimizer adapter", () => {
  it("exports a compatible ordered schema but remains unavailable by default", async () => {
    const rows = exportOptimizerHistory([
      { rating: "easy", reviewedAt: "2026-07-22T00:00:00.000Z", durationMs: 2_000 },
      { rating: "again", reviewedAt: "2026-07-21T00:00:00.000Z" },
    ]);
    expect(rows).toEqual([
      { rating: 1, reviewed_at: "2026-07-21T00:00:00.000Z", duration_ms: 0 },
      { rating: 4, reviewed_at: "2026-07-22T00:00:00.000Z", duration_ms: 2_000 },
    ]);
    const optimizer = new DisabledSchedulerOptimizer();
    expect(optimizer.available).toBe(false);
    await expect(optimizer.preview([], DEFAULT_FSRS_PRESET)).rejects.toThrow(
      `at least ${OPTIMIZER_MINIMUM_LOGS}`,
    );
  });

  it("runs a deterministic local backend only when explicitly enabled", async () => {
    const history = Array.from({ length: OPTIMIZER_MINIMUM_LOGS }, (_, index) => ({
      rating: index % 5 === 0 ? ("again" as const) : ("good" as const),
      reviewedAt: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    }));
    const backend = {
      propose: async () => ({
        expectedWorkloadChange: 0.08,
        fsrsWeights: Array.from({ length: 21 }, (_, index) => 0.1 + index / 100),
        warnings: ["Confirm only after comparing the preview."],
      }),
    };
    const disabled = new FeatureFlaggedSchedulerOptimizer(false, backend);
    expect(disabled.available).toBe(false);
    await expect(disabled.preview(history, DEFAULT_FSRS_PRESET)).rejects.toThrow("disabled");

    const enabled = new FeatureFlaggedSchedulerOptimizer(true, backend);
    const preview = await enabled.preview(history, DEFAULT_FSRS_PRESET);
    expect(preview).toMatchObject({
      expectedWorkloadChange: 0.08,
      reviewCount: OPTIMIZER_MINIMUM_LOGS,
    });
    expect(preview.previousPreset.fsrsWeights).toBeUndefined();
    expect(preview.proposedPreset.fsrsWeights).toHaveLength(21);
    expect(preview.warnings[0]).toContain("Confirm");
  });
});
