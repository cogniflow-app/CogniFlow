import { validatePreset } from "./preset";
import type { ReviewHistoryEntry, SchedulerPreset } from "./types";

export const OPTIMIZER_MINIMUM_LOGS = 400;

export interface OptimizerExportRow {
  rating: 1 | 2 | 3 | 4;
  reviewed_at: string;
  duration_ms: number;
}

export interface OptimizationPreview {
  previousPreset: SchedulerPreset;
  proposedPreset: SchedulerPreset;
  reviewCount: number;
  expectedWorkloadChange: number;
  warnings: string[];
}

export interface SchedulerOptimizer {
  readonly available: boolean;
  preview(
    history: readonly ReviewHistoryEntry[],
    preset: SchedulerPreset,
  ): Promise<OptimizationPreview>;
}

export interface SchedulerOptimizerBackend {
  propose(
    history: readonly OptimizerExportRow[],
    preset: SchedulerPreset,
  ): Promise<{
    expectedWorkloadChange: number;
    fsrsWeights: number[];
    warnings?: string[];
  }>;
}

const ratingValue = { again: 1, hard: 2, good: 3, easy: 4 } as const;

export function exportOptimizerHistory(
  history: readonly ReviewHistoryEntry[],
): OptimizerExportRow[] {
  return [...history]
    .sort(
      (left, right) => new Date(left.reviewedAt).getTime() - new Date(right.reviewedAt).getTime(),
    )
    .map((entry) => ({
      rating: ratingValue[entry.rating],
      reviewed_at: new Date(entry.reviewedAt).toISOString(),
      duration_ms: entry.durationMs ?? 0,
    }));
}

export class DisabledSchedulerOptimizer implements SchedulerOptimizer {
  readonly available = false;

  async preview(
    history: readonly ReviewHistoryEntry[],
    _preset: SchedulerPreset,
  ): Promise<OptimizationPreview> {
    if (history.length < OPTIMIZER_MINIMUM_LOGS) {
      throw new Error(
        `Optimization requires at least ${OPTIMIZER_MINIMUM_LOGS} canonical reviews.`,
      );
    }
    throw new Error(
      "Scheduler optimization is disabled. Core review scheduling remains fully available.",
    );
  }
}

export class FeatureFlaggedSchedulerOptimizer implements SchedulerOptimizer {
  readonly available: boolean;

  constructor(
    enabled: boolean,
    private readonly backend: SchedulerOptimizerBackend | null,
  ) {
    this.available = enabled && backend !== null;
  }

  async preview(
    history: readonly ReviewHistoryEntry[],
    presetInput: SchedulerPreset,
  ): Promise<OptimizationPreview> {
    if (!this.available || !this.backend)
      throw new Error(
        "Scheduler optimization is disabled. Core review scheduling remains fully available.",
      );
    if (history.length < OPTIMIZER_MINIMUM_LOGS)
      throw new Error(
        `Optimization requires at least ${OPTIMIZER_MINIMUM_LOGS} canonical reviews.`,
      );
    const preset = validatePreset(presetInput);
    if (preset.algorithm !== "fsrs")
      throw new Error("Parameter optimization is available only for FSRS presets.");
    const proposal = await this.backend.propose(exportOptimizerHistory(history), preset);
    if (!Number.isFinite(proposal.expectedWorkloadChange))
      throw new Error("Optimizer workload estimate must be finite.");
    const proposedPreset = validatePreset({ ...preset, fsrsWeights: proposal.fsrsWeights });
    return {
      expectedWorkloadChange: proposal.expectedWorkloadChange,
      previousPreset: structuredClone(preset),
      proposedPreset,
      reviewCount: history.length,
      warnings: [...(proposal.warnings ?? [])],
    };
  }
}
