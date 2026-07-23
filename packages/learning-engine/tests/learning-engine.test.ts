import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildChoiceQuestion,
  buildExamPlan,
  decayMastery,
  emptyMastery,
  evidenceKinds,
  isMasteryEarned,
  recommendLearnStep,
  selectLearningItems,
  updateMastery,
  type LearningCandidate,
  type PracticeEvidence,
  type SelectionContext,
} from "../src";

const correctGrade = { confidence: 1, correctness: 1, verdict: "correct" as const };

function evidence(
  kind: PracticeEvidence["kind"],
  occurredAt: string,
  overrides: Partial<PracticeEvidence> = {},
): PracticeEvidence {
  return {
    kind,
    occurredAt,
    grade: correctGrade,
    contentVersion: 1,
    ...overrides,
  };
}

function candidate(overrides: Partial<LearningCandidate> = {}): LearningCandidate {
  return {
    cardId: "00000000-0000-4000-8000-000000000001",
    noteId: "00000000-0000-4000-8000-000000000011",
    deckId: "00000000-0000-4000-8000-000000000021",
    siblingKey: "note-1",
    answerKey: "answer-1",
    mastery: emptyMastery(),
    dueAt: "2026-07-20T12:00:00.000Z",
    missCount: 0,
    difficulty: 0.5,
    tags: [],
    goalIds: [],
    questionLevel: "recognition",
    supportsKeyboard: true,
    supportsAudio: false,
    requiresMotion: false,
    ...overrides,
  };
}

const context: SelectionContext = {
  seed: "phase-four",
  now: "2026-07-22T12:00:00.000Z",
  sessionIndex: 0,
  recentCardIds: [],
  recentSiblingKeys: [],
};

describe("mastery evidence", () => {
  it("weights delayed written recall more strongly than lucky recognition", () => {
    const start = emptyMastery();
    const recognition = updateMastery(
      start,
      evidence("multiple_choice", "2026-07-22T12:00:00.000Z"),
    );
    const written = updateMastery(start, evidence("written", "2026-07-22T12:00:00.000Z"));
    expect(written.recall).toBeGreaterThan(recognition.recall * 5);
    expect(recognition.recognition).toBeGreaterThan(written.recognition);
  });

  it("discounts immediate repeats, hints, reveals, and retries", () => {
    const first = updateMastery(emptyMastery(), evidence("written", "2026-07-22T12:00:00.000Z"));
    const assisted = updateMastery(
      first,
      evidence("written", "2026-07-22T12:02:00.000Z", {
        answerRevealed: true,
        hintsUsed: 2,
        retryCount: 2,
      }),
    );
    expect(assisted.recall - first.recall).toBeLessThan(0.02);
    expect(assisted.spacedRecallSuccesses).toBe(first.spacedRecallSuccesses);
  });

  it("requires two spaced recall successes before mastery", () => {
    let state = emptyMastery();
    state = updateMastery(state, evidence("written", "2026-07-20T12:00:00.000Z"));
    expect(state.spacedRecallSuccesses).toBe(1);
    expect(isMasteryEarned(state)).toBe(false);
    for (let index = 0; index < 4; index += 1) {
      state = updateMastery(
        state,
        evidence("written", new Date(Date.UTC(2026, 6, 21 + index, 12)).toISOString()),
      );
    }
    expect(state.spacedRecallSuccesses).toBe(2);
    expect(state.stage).toBe("mastered");
    expect(recommendLearnStep(state)).toBe("mastered");
  });

  it("weakens evidence when authored content changes", () => {
    const learned = updateMastery(
      updateMastery(emptyMastery(), evidence("written", "2026-07-20T12:00:00.000Z")),
      evidence("written", "2026-07-21T12:00:00.000Z"),
    );
    const changed = updateMastery(
      learned,
      evidence("typed", "2026-07-22T12:00:00.000Z", { contentVersion: 2 }),
    );
    expect(changed.contentVersion).toBe(2);
    expect(changed.spacedRecallSuccesses).toBe(0);
    expect(changed.recall).toBeLessThan(learned.recall);
  });

  it("decays mastered knowledge into a refresh state without changing evidence history", () => {
    const mastered = {
      ...emptyMastery(),
      recognition: 0.9,
      recall: 0.9,
      overall: 0.9,
      stage: "mastered" as const,
      evidenceCount: 8,
      spacedRecallSuccesses: 2,
      lastEvidenceAt: "2026-01-01T00:00:00.000Z",
    };
    const decayed = decayMastery(mastered, "2026-07-22T00:00:00.000Z");
    expect(decayed.stage).toBe("needs_refresh");
    expect(decayed.evidenceCount).toBe(8);
  });
});

describe("deterministic learning selection", () => {
  it("prioritizes due misses and avoids recent cards and siblings", () => {
    const dueMiss = candidate({ cardId: "a", missCount: 4, siblingKey: "a-note" });
    const known = candidate({
      cardId: "b",
      siblingKey: "b-note",
      dueAt: null,
      mastery: { ...emptyMastery(), recognition: 0.9, recall: 0.9, overall: 0.9 },
    });
    const repeated = candidate({ cardId: "c", siblingKey: "recent-note", missCount: 9 });
    const selected = selectLearningItems(
      [known, repeated, dueMiss],
      { ...context, recentCardIds: ["c"], recentSiblingKeys: ["recent-note"] },
      3,
    );
    expect(selected[0]?.candidate.cardId).toBe("a");
    expect(selected.at(-1)?.candidate.cardId).toBe("c");
  });

  it("is stable for the same seed and filters inaccessible interactions", () => {
    const candidates = [
      candidate({ cardId: "a" }),
      candidate({ cardId: "b", supportsKeyboard: false }),
      candidate({ cardId: "c" }),
    ];
    const first = selectLearningItems(candidates, { ...context, keyboardOnly: true }, 3);
    const second = selectLearningItems(candidates, { ...context, keyboardOnly: true }, 3);
    expect(first).toEqual(second);
    expect(first.map((item) => item.candidate.cardId)).not.toContain("b");
  });

  it("builds distinct distractors without siblings or duplicate answers", () => {
    const target = { answer: "mitochondria", cardId: "a", difficulty: 0.5, siblingKey: "note-a" };
    const question = buildChoiceQuestion(
      target,
      [
        target,
        { answer: "mitochondria", cardId: "duplicate", difficulty: 0.5, siblingKey: "note-d" },
        { answer: "nucleus", cardId: "sibling", difficulty: 0.5, siblingKey: "note-a" },
        { answer: "ribosome", cardId: "b", difficulty: 0.45, siblingKey: "note-b" },
        { answer: "chloroplast", cardId: "c", difficulty: 0.6, siblingKey: "note-c" },
      ],
      "choices",
    );
    expect(question.options.filter((option) => option.correct)).toHaveLength(1);
    expect(new Set(question.options.map((option) => option.answer)).size).toBe(
      question.options.length,
    );
    expect(question.options.map((option) => option.answer)).not.toContain("nucleus");
  });

  it("keeps every generated candidate score deterministic and finite", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            difficulty: fc.double({ min: 0, max: 1, noNaN: true }),
            missCount: fc.nat(20),
          }),
          { maxLength: 100 },
        ),
        (inputs) => {
          const candidates = inputs.map((input, index) =>
            candidate({
              cardId: `card-${String(index)}`,
              siblingKey: `note-${String(index)}`,
              ...input,
            }),
          );
          const first = selectLearningItems(candidates, context, candidates.length);
          const second = selectLearningItems(candidates, context, candidates.length);
          expect(first).toEqual(second);
          expect(first.every((item) => Number.isFinite(item.score))).toBe(true);
        },
      ),
    );
  });

  it("selects a bounded session from 10,000 cards within the large-deck budget", () => {
    const candidates = Array.from({ length: 10_000 }, (_, index) =>
      candidate({
        cardId: `large-card-${String(index).padStart(5, "0")}`,
        difficulty: (index % 100) / 100,
        missCount: index % 7,
        noteId: `large-note-${String(index).padStart(5, "0")}`,
        siblingKey: `large-note-${String(index).padStart(5, "0")}`,
      }),
    );
    const started = performance.now();
    const selected = selectLearningItems(candidates, context, 40);
    const elapsedMs = performance.now() - started;
    expect(selected).toHaveLength(40);
    expect(elapsedMs).toBeLessThan(1_500);
  });

  it("exposes Match only as an explicit low-weight practice evidence kind, never a generic game", () => {
    expect(evidenceKinds).toContain("match");
    expect(evidenceKinds).not.toContain("game");
  });
});

describe("exam planning", () => {
  it("produces a dated phased workload and an honest feasibility warning", () => {
    const plan = buildExamPlan({
      now: "2026-07-22T12:00:00.000Z",
      examAt: "2026-07-29T12:00:00.000Z",
      candidateCount: 120,
      averageMastery: 0.2,
      minutesPerItem: 2,
      minutesAvailablePerDay: 15,
      includeWeekends: true,
    });
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0]?.focus).toBe("learn");
    expect(plan.days.at(-1)?.focus).toBe("light_review");
    expect(plan.feasible).toBe(false);
    expect(plan.warning).toMatch(/unlikely/u);
  });

  it("rejects an exam date that is not in the future", () => {
    expect(() =>
      buildExamPlan({
        now: "2026-07-22T12:00:00.000Z",
        examAt: "2026-07-21T12:00:00.000Z",
        candidateCount: 1,
        averageMastery: 0,
        minutesPerItem: 1,
        minutesAvailablePerDay: 10,
        includeWeekends: true,
      }),
    ).toThrow(/future/u);
  });
});
