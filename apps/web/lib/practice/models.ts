import type { GradeResult, GradingMode } from "@lumen/grading";
import type { MasteryStage, MasteryState } from "@lumen/learning-engine";
import type { StudyRendererContract } from "@lumen/domain";

export const practiceModes = [
  "flashcards",
  "learn",
  "write",
  "test",
  "match",
  "spell",
  "pronunciation",
  "diagram",
] as const;

export type PracticeMode = (typeof practiceModes)[number];

export const practiceModeCopy: Readonly<
  Record<
    PracticeMode,
    {
      readonly description: string;
      readonly eyebrow: string;
      readonly label: string;
      readonly shortcut: string;
    }
  >
> = Object.freeze({
  flashcards: {
    description: "Flip through real deck content, sort what you know, and keep SRS untouched.",
    eyebrow: "Explore",
    label: "Flashcards",
    shortcut: "Space to flip",
  },
  learn: {
    description: "Move from recognition to delayed written recall as mastery grows.",
    eyebrow: "Adaptive",
    label: "Learn",
    shortcut: "Questions adapt",
  },
  write: {
    description: "Practice precise recall with explainable flexible grading and a second pass.",
    eyebrow: "Recall",
    label: "Write",
    shortcut: "Type your answer",
  },
  test: {
    description: "Generate a seeded practice test with scoring, review, and no SRS side effects.",
    eyebrow: "Assess",
    label: "Test",
    shortcut: "Timed or untimed",
  },
  match: {
    description: "Pair prompts and answers with keyboard, touch, or an accessible list.",
    eyebrow: "Fast practice",
    label: "Match",
    shortcut: "Beat your best",
  },
  spell: {
    description: "Hear or read a prompt, replay it slowly, and type the spelling.",
    eyebrow: "Language",
    label: "Spell",
    shortcut: "Local speech",
  },
  pronunciation: {
    description: "Speak, record locally if you choose, replay, and self-assess privately.",
    eyebrow: "Language",
    label: "Pronunciation",
    shortcut: "Nothing uploads",
  },
  diagram: {
    description: "Recall labels with visual hotspots and a complete keyboard text alternative.",
    eyebrow: "Visual",
    label: "Diagram",
    shortcut: "Visual + text",
  },
});

export interface PracticeSessionConfig {
  readonly audio: boolean;
  readonly answerDirection: "prompt_answer" | "answer_prompt" | "mixed";
  readonly autoplay: boolean;
  readonly gradingMode: GradingMode;
  readonly goal: {
    readonly examAt: string | null;
    readonly id: string | null;
    readonly kind:
      "recommended" | "time" | "count" | "mastery" | "new" | "due" | "weak" | "starred" | "exam";
    readonly masteryTarget: number | null;
    readonly timeMinutes: number | null;
  };
  readonly hints: "off" | "on_request";
  readonly language: string;
  readonly questionTypes: readonly string[];
  readonly retypeCorrect: boolean;
  readonly targetCount: number;
  readonly tags: readonly string[];
  readonly testOptions: {
    readonly layout: "one_at_a_time" | "one_page";
    readonly partialCredit: boolean;
    readonly pauseAllowed: boolean;
    readonly reviewPolicy: "after_each" | "end";
  };
  readonly testAttemptId: string | null;
  readonly testDefinitionId: string | null;
  readonly timerSeconds: number | null;
}

export interface PracticeMasteryView extends MasteryState {
  readonly version: number;
}

export interface PracticeCardView {
  readonly answer: string;
  readonly answerRules: Readonly<Record<string, unknown>>;
  readonly cardId: string;
  readonly choices: readonly string[];
  readonly correctChoices: readonly string[];
  readonly contentVersion: number;
  readonly deckId: string;
  readonly deckTitle: string;
  readonly item: {
    readonly attemptCount: number;
    readonly position: number;
    readonly questionKind: string;
    readonly questionLevel:
      "introduction" | "recognition" | "guided_recall" | "free_recall" | "delayed_retest";
  };
  readonly mastery: PracticeMasteryView;
  readonly noteId: string;
  readonly prompt: string;
  readonly renderer: StudyRendererContract;
  readonly schedule: {
    readonly due: string | null;
    readonly starred: boolean;
    readonly state: string;
    readonly version: number;
  } | null;
  readonly selectionReason: string;
  readonly session: {
    readonly completed: number;
    readonly config: PracticeSessionConfig;
    readonly id: string;
    readonly items: readonly {
      readonly position: number;
      readonly status: "pending" | "shown" | "answered" | "skipped";
    }[];
    readonly mode: PracticeMode;
    readonly status: "active" | "paused";
    readonly total: number;
    readonly version: number;
  };
}

export interface PracticeAttemptResult {
  readonly attemptId: string;
  readonly grade: GradeResult;
  readonly mastery: PracticeMasteryView;
  readonly qualification: {
    readonly eligible: boolean;
    readonly reason: string;
    readonly suggestedRating: "again" | "hard" | "good" | "easy" | null;
  };
}

export interface PracticeSessionSummary {
  readonly accuracy: number;
  readonly answered: number;
  readonly completedAt: string | null;
  readonly correct: number;
  readonly durationMs: number;
  readonly mastered: number;
  readonly mode: PracticeMode;
  readonly needsWork: number;
  readonly personalBestMs: number | null;
  readonly questionReview: readonly {
    readonly correctness: number;
    readonly expectedAnswer: string;
    readonly explanation: string;
    readonly position: number;
    readonly prompt: string;
    readonly questionKind: string;
    readonly response: string | null;
    readonly verdict: "correct" | "partial" | "incorrect" | "needs_review";
  }[];
  readonly sessionId: string;
  readonly status: "active" | "paused" | "completed" | "abandoned";
  readonly total: number;
}

export interface PracticeHubSnapshot {
  readonly averageMastery: number;
  readonly activeExamPlan: {
    readonly examAt: string;
    readonly id: string;
    readonly name: string;
    readonly plan: Readonly<Record<string, unknown>>;
  } | null;
  readonly activeGoalCount: number;
  readonly masteredCount: number;
  readonly recentSessions: readonly {
    readonly completed: number;
    readonly completedAt: string | null;
    readonly id: string;
    readonly mode: PracticeMode;
    readonly total: number;
  }[];
  readonly resumableSession: {
    readonly completed: number;
    readonly id: string;
    readonly mode: PracticeMode;
    readonly total: number;
  } | null;
  readonly weakCount: number;
}

export interface PracticeModePreference {
  readonly config: Readonly<Record<string, unknown>>;
  readonly version: number;
}

export type { MasteryStage };
