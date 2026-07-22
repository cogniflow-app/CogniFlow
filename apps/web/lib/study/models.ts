import type { Schedule, SchedulerPreset } from "@lumen/srs";
import type { StudyRendererContract } from "@lumen/domain";

import type { StudyFilterDefinition } from "./custom-filter";

export interface StudyDeckRow {
  readonly buried: number;
  readonly deckId: string;
  readonly due: number;
  readonly learning: number;
  readonly name: string;
  readonly new: number;
  readonly suspended: number;
  readonly total: number;
}

export interface StudyDashboardSnapshot {
  readonly completedToday: number;
  readonly decks: readonly StudyDeckRow[];
  readonly folders: readonly {
    readonly deckIds: readonly string[];
    readonly id: string;
    readonly name: string;
  }[];
  readonly due: number;
  readonly learning: number;
  readonly new: number;
  readonly recentSession: { readonly completed: number; readonly completedAt: string } | null;
  readonly resumableSession: {
    readonly completed: number;
    readonly id: string;
    readonly total: number;
  } | null;
  readonly savedFilters: readonly {
    readonly definition: StudyFilterDefinition;
    readonly id: string;
    readonly name: string;
    readonly version: number;
  }[];
  readonly total: number;
  readonly tags: readonly string[];
}

export interface ReviewCardView {
  readonly cardId: string;
  readonly contentMismatch: boolean;
  readonly deckId: string;
  readonly deckTitle: string;
  readonly lastReviewId: string | null;
  readonly noteId: string;
  readonly position: number;
  readonly preset: SchedulerPreset;
  readonly renderer: StudyRendererContract;
  readonly schedule: Schedule | null;
  readonly scheduleVersion: number;
  readonly starred: boolean;
  readonly session: {
    readonly completed: number;
    readonly id: string;
    readonly mode: string;
    readonly rescheduling: boolean;
    readonly source: string;
    readonly studyDayStart: number;
    readonly timezone: string;
    readonly total: number;
  };
}

export interface StudyStatistics {
  readonly answerTimeBuckets: readonly { readonly count: number; readonly label: string }[];
  readonly cardsByState: Readonly<Record<"learning" | "new" | "relearning" | "review", number>>;
  readonly deckBreakdown: readonly {
    readonly deckId: string;
    readonly name: string;
    readonly reviews: number;
    readonly timeMs: number;
  }[];
  readonly difficultyBuckets: readonly { readonly count: number; readonly label: string }[];
  readonly dueToday: number;
  readonly forecast: readonly { readonly count: number; readonly day: string }[];
  readonly heatmap: readonly {
    readonly count: number;
    readonly day: string;
    readonly durationMs: number;
  }[];
  readonly intervalBuckets: readonly { readonly count: number; readonly label: string }[];
  readonly lapses: number;
  readonly leeches: number;
  readonly mature: number;
  readonly meanDifficulty: number | null;
  readonly meanRetrievability: number | null;
  readonly meanStability: number | null;
  readonly newCards: number;
  readonly ratingCounts: Readonly<Record<"again" | "easy" | "good" | "hard", number>>;
  readonly recentDailyAverage: number;
  readonly recallRate: number | null;
  readonly reviewCount: number;
  readonly reviewTimeMs: number;
  readonly stabilityBuckets: readonly { readonly count: number; readonly label: string }[];
  readonly tagBreakdown: readonly {
    readonly name: string;
    readonly reviews: number;
    readonly timeMs: number;
  }[];
  readonly timeline: readonly {
    readonly cardId: string;
    readonly deckId: string;
    readonly label: string;
    readonly noteId: string;
    readonly rating: "again" | "easy" | "good" | "hard";
    readonly reviewedAt: string;
  }[];
  readonly young: number;
}
