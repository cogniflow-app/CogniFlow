import type { EvidenceKind, MasteryStage, MasteryState, PracticeEvidence } from "./types";

const dayMs = 86_400_000;

interface EvidenceWeights {
  readonly recognition: number;
  readonly recall: number;
}

const evidenceWeights: Record<EvidenceKind, EvidenceWeights> = {
  flashcard: { recognition: 0.07, recall: 0.05 },
  multiple_choice: { recognition: 0.13, recall: 0.025 },
  select_all: { recognition: 0.15, recall: 0.04 },
  true_false: { recognition: 0.08, recall: 0.015 },
  match: { recognition: 0.1, recall: 0.02 },
  typed: { recognition: 0.05, recall: 0.19 },
  written: { recognition: 0.04, recall: 0.24 },
  spell: { recognition: 0.04, recall: 0.21 },
  pronunciation: { recognition: 0.04, recall: 0.12 },
  diagram: { recognition: 0.1, recall: 0.15 },
  test: { recognition: 0.08, recall: 0.2 },
};

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function overall(recognition: number, recall: number): number {
  return bounded(recognition * 0.35 + recall * 0.65);
}

export function emptyMastery(contentVersion = 1): MasteryState {
  return Object.freeze({
    recognition: 0,
    recall: 0,
    overall: 0,
    stage: "unseen",
    evidenceCount: 0,
    spacedRecallSuccesses: 0,
    lastEvidenceAt: null,
    contentVersion,
  });
}

export function decayMastery(state: MasteryState, atInput: string | Date): MasteryState {
  if (!state.lastEvidenceAt) return state;
  const at = new Date(atInput).getTime();
  const last = new Date(state.lastEvidenceAt).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(last) || at <= last) return state;
  const days = (at - last) / dayMs;
  const recognition = bounded(state.recognition * 2 ** (-days / 24));
  const recall = bounded(state.recall * 2 ** (-days / 32));
  const nextOverall = overall(recognition, recall);
  const stage: MasteryStage =
    (state.stage === "mastered" || state.stage === "needs_refresh") && nextOverall < 0.68
      ? "needs_refresh"
      : state.stage;
  return Object.freeze({ ...state, recognition, recall, overall: nextOverall, stage });
}

function evidenceMultiplier(state: MasteryState, evidence: PracticeEvidence): number {
  const hints = Math.max(0, evidence.hintsUsed ?? 0);
  const retries = Math.max(0, evidence.retryCount ?? 0);
  const hintPenalty = 0.82 ** hints;
  const revealPenalty = evidence.answerRevealed ? 0.35 : 1;
  const retryPenalty = 0.8 ** retries;
  const confidence = bounded(evidence.selfReportedConfidence ?? evidence.grade.confidence);
  const confidenceFactor = 0.82 + confidence * 0.18;
  const expectedLatency = Math.max(1, evidence.expectedLatencyMs ?? evidence.latencyMs ?? 1);
  const latency = Math.max(0, evidence.latencyMs ?? expectedLatency);
  const latencyFactor = bounded(1.08 - Math.max(0, latency / expectedLatency - 1) * 0.18);

  let spacingFactor = 1;
  if (state.lastEvidenceAt) {
    const delay =
      new Date(evidence.occurredAt).getTime() - new Date(state.lastEvidenceAt).getTime();
    if (delay < 10 * 60_000) spacingFactor = 0.3;
    else if (delay < 6 * 60 * 60_000) spacingFactor = 0.5;
    else if (delay < dayMs) spacingFactor = 0.72;
  }
  return (
    hintPenalty *
    revealPenalty *
    retryPenalty *
    confidenceFactor *
    Math.max(0.55, latencyFactor) *
    spacingFactor
  );
}

function stageFor(
  previous: MasteryState,
  recognition: number,
  recall: number,
  spacedRecallSuccesses: number,
  correctness: number,
): MasteryStage {
  const combined = overall(recognition, recall);
  if (previous.evidenceCount === 0 && correctness <= 0) return "introduced";
  if ((previous.stage === "mastered" || previous.stage === "needs_refresh") && correctness < 0.5) {
    return "needs_refresh";
  }
  if (spacedRecallSuccesses >= 2 && recall >= 0.6 && combined >= 0.5) return "mastered";
  if (recall >= 0.52) return "free_recall";
  if (recall >= 0.25) return "guided_recall";
  if (recognition >= 0.24) return "recognition";
  return "introduced";
}

export function updateMastery(stateInput: MasteryState, evidence: PracticeEvidence): MasteryState {
  const decayed = decayMastery(stateInput, evidence.occurredAt);
  const versionChanged = evidence.contentVersion !== decayed.contentVersion;
  const baseRecognition = versionChanged ? decayed.recognition * 0.72 : decayed.recognition;
  const baseRecall = versionChanged ? decayed.recall * 0.55 : decayed.recall;
  const weights = evidenceWeights[evidence.kind];
  const multiplier = evidenceMultiplier(decayed, evidence);
  const correctness = bounded(evidence.grade.correctness);
  const signedEvidence = correctness >= 0.5 ? correctness : -(1 - correctness) * 0.8;
  const recognition = bounded(baseRecognition + weights.recognition * multiplier * signedEvidence);
  const recall = bounded(baseRecall + weights.recall * multiplier * signedEvidence);

  const previousAt = decayed.lastEvidenceAt ? new Date(decayed.lastEvidenceAt).getTime() : null;
  const currentAt = new Date(evidence.occurredAt).getTime();
  const sufficientlySpaced = previousAt === null || currentAt - previousAt >= 6 * 60 * 60_000;
  const recallEvidence = weights.recall >= 0.12;
  const spacedRecallSuccesses =
    versionChanged || correctness < 0.7
      ? 0
      : recallEvidence &&
          sufficientlySpaced &&
          !evidence.answerRevealed &&
          (evidence.hintsUsed ?? 0) === 0
        ? Math.min(2, decayed.spacedRecallSuccesses + 1)
        : decayed.spacedRecallSuccesses;
  const stage = stageFor(decayed, recognition, recall, spacedRecallSuccesses, correctness);

  return Object.freeze({
    recognition,
    recall,
    overall: overall(recognition, recall),
    stage,
    evidenceCount: decayed.evidenceCount + 1,
    spacedRecallSuccesses,
    lastEvidenceAt: evidence.occurredAt,
    contentVersion: evidence.contentVersion,
  });
}
