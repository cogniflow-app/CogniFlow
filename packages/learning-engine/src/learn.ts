import type { LearningLevel, MasteryState } from "./types";

export function recommendLearnStep(state: MasteryState): LearningLevel | "mastered" {
  switch (state.stage) {
    case "unseen":
    case "introduced":
      return state.evidenceCount === 0 ? "introduction" : "recognition";
    case "recognition":
      return "guided_recall";
    case "guided_recall":
      return "free_recall";
    case "free_recall":
    case "needs_refresh":
      return "delayed_retest";
    case "mastered":
      return "mastered";
  }
}

export function isMasteryEarned(state: MasteryState): boolean {
  return state.stage === "mastered" && state.spacedRecallSuccesses >= 2;
}
