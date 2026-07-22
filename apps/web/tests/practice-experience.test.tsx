import { CARD_SCHEMA_VERSION, generateCardBlueprints, type RichDocument } from "@lumen/domain";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticeAttemptResult, PracticeCardView, PracticeMode } from "@/lib/practice/models";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import {
  PracticeSession,
  PracticeSessionComplete,
} from "../components/practice/practice-session.client";
import { PracticeMatchBoard } from "../components/practice/practice-match-board.client";
import { PracticeSetup } from "../components/practice/practice-setup.client";
import { PracticeTestPaper } from "../components/practice/practice-test-paper.client";

function rich(text: string): RichDocument {
  return {
    attrs: { language: "en" },
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    schemaVersion: 2,
    type: "doc",
  };
}

function practiceCard(mode: PracticeMode = "flashcards"): PracticeCardView {
  const renderer = generateCardBlueprints({
    back: rich("Mitochondrion"),
    front: rich("Which organelle produces most cellular ATP?"),
    kind: "basic",
    schemaVersion: CARD_SCHEMA_VERSION,
  })[0]?.renderer;
  if (!renderer) throw new Error("Practice fixture did not generate a renderer.");
  return {
    answer: "Mitochondrion",
    answerRules: {},
    cardId: "0190d9f0-0000-7000-8000-000000000003",
    choices: ["Mitochondrion", "Nucleus", "Ribosome", "Golgi apparatus"],
    contentVersion: 1,
    correctChoices: [],
    deckId: "0190d9f0-0000-7000-8000-000000000004",
    deckTitle: "Biology",
    item: {
      attemptCount: 0,
      position: 0,
      questionKind: mode === "flashcards" ? "flashcard" : "typed",
      questionLevel: mode === "flashcards" ? "introduction" : "free_recall",
    },
    mastery: {
      contentVersion: 1,
      evidenceCount: 0,
      lastEvidenceAt: null,
      overall: 0,
      recall: 0,
      recognition: 0,
      spacedRecallSuccesses: 0,
      stage: "introduced",
      version: 0,
    },
    noteId: "0190d9f0-0000-7000-8000-000000000010",
    prompt: "Which organelle produces most cellular ATP?",
    renderer,
    schedule: null,
    selectionReason: "This is a brief introduction before recall practice.",
    session: {
      completed: 0,
      config: {
        answerDirection: "prompt_answer",
        audio: true,
        autoplay: false,
        gradingMode: "moderate",
        goal: {
          examAt: null,
          id: null,
          kind: "recommended",
          masteryTarget: null,
          timeMinutes: null,
        },
        hints: "on_request",
        language: "en-US",
        questionTypes: ["flashcard"],
        retypeCorrect: true,
        targetCount: 1,
        tags: [],
        testOptions: {
          layout: "one_at_a_time",
          partialCredit: true,
          pauseAllowed: true,
          reviewPolicy: "end",
        },
        testAttemptId: null,
        testDefinitionId: null,
        timerSeconds: null,
      },
      id: "0190d9f0-0000-7000-8000-000000000005",
      items: [{ position: 0, status: "pending" }],
      mode,
      status: "active",
      total: 1,
      version: 1,
    },
  };
}

function practiceCards(
  mode: "match" | "test",
  kinds: readonly string[],
): readonly PracticeCardView[] {
  const prompts = [
    "Which organelle produces most cellular ATP?",
    "Which structure contains genetic material?",
    "Where are proteins assembled?",
    "Which organelle modifies and packages proteins?",
  ];
  const answers = ["Mitochondrion", "Nucleus", "Ribosome", "Golgi apparatus"];
  const items = kinds.map((kind, position) => ({
    position,
    status: "pending" as const,
    kind,
  }));
  return kinds.map((kind, position) => {
    const base = practiceCard(mode);
    return {
      ...base,
      answer: answers[position] ?? `Answer ${String(position + 1)}`,
      cardId: `0190d9f0-0000-7000-8000-${String(position + 3).padStart(12, "0")}`,
      choices:
        kind === "true_false"
          ? ["True", "False"]
          : ["Mitochondrion", "Nucleus", "Ribosome", "Golgi apparatus"],
      correctChoices: kind === "select_all" ? ["Mitochondrion", "Nucleus"] : [],
      item: {
        ...base.item,
        position,
        questionKind: kind,
        questionLevel: mode === "match" ? ("recognition" as const) : ("free_recall" as const),
      },
      prompt: prompts[position] ?? `Question ${String(position + 1)}`,
      session: {
        ...base.session,
        config: {
          ...base.session.config,
          questionTypes: kinds,
          testOptions: {
            layout: "one_page" as const,
            partialCredit: true,
            pauseAllowed: true,
            reviewPolicy: "end" as const,
          },
        },
        items: items.map(({ kind: _kind, ...item }) => item),
        mode,
        total: kinds.length,
      },
    };
  });
}

const attemptResult: PracticeAttemptResult = {
  attemptId: "0190d9f0-0000-7000-8000-000000000099",
  grade: {
    confidence: 1,
    correctness: 1,
    explanation: "The response matches an accepted answer.",
    matchedRule: "exact",
    normalizedExpected: ["mitochondrion"],
    normalizedReceived: "mitochondrion",
    overrideAllowed: false,
    verdict: "correct",
  },
  mastery: {
    contentVersion: 1,
    evidenceCount: 1,
    lastEvidenceAt: "2026-07-22T12:00:00.000Z",
    overall: 0.42,
    recall: 0.5,
    recognition: 0.25,
    spacedRecallSuccesses: 1,
    stage: "guided_recall",
    version: 1,
  },
  qualification: {
    eligible: false,
    reason: "Practice evidence remains separate from the canonical SRS schedule.",
    suggestedRating: null,
  },
};

describe("Phase 04 practice experience", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    navigation.push.mockReset();
    navigation.refresh.mockReset();
    window.sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: attemptResult }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
      ),
    );
  });

  it("keeps a flashcard answer out of the DOM through the first half of the flip", () => {
    vi.useFakeTimers();
    const { container } = render(
      <PracticeSession card={practiceCard()} reducedMotion={false} seriousMode={false} />,
    );

    expect(screen.getByText(/Which organelle/)).toBeVisible();
    expect(screen.queryByText("Mitochondrion")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    expect(container.querySelector(".practice-flip-card")).toHaveAttribute(
      "data-flip-phase",
      "turning",
    );
    expect(screen.queryByText("Mitochondrion")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(229));
    expect(screen.queryByText("Mitochondrion")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Mitochondrion")).toBeVisible();
    expect(container.querySelector(".practice-flip-card")).toHaveAttribute(
      "data-flip-phase",
      "answer",
    );
  });

  it("reveals without animation for reduced motion and submits practice-only evidence", async () => {
    const user = userEvent.setup();
    render(<PracticeSession card={practiceCard()} reducedMotion seriousMode />);

    await user.keyboard(" ");
    expect(screen.getByText("Mitochondrion")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Know it/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("/api/practice/attempts");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ answerRevealed: true, responseKind: "know" });
    expect(body).not.toHaveProperty("rating");
    expect(body).not.toHaveProperty("scheduleAfter");
    expect(await screen.findByText("Correct")).toBeVisible();
    expect(screen.queryByText(/canonical SRS schedule/i)).not.toBeInTheDocument();
  });

  it("reports practice mastery separately from canonical review state at completion", () => {
    render(
      <PracticeSessionComplete
        summary={{
          accuracy: 0.75,
          answered: 4,
          completedAt: "2026-07-22T12:00:00.000Z",
          correct: 3,
          durationMs: 90_000,
          mastered: 1,
          mode: "learn",
          needsWork: 1,
          personalBestMs: null,
          questionReview: [],
          sessionId: "0190d9f0-0000-7000-8000-000000000005",
          status: "completed",
          total: 4,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "You finished the session" })).toBeVisible();
    expect(screen.getByText(/review schedule changes only when you choose/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Review mistakes" })).toHaveAttribute(
      "href",
      "/app/study/mode/write",
    );
  });

  it("renders a shuffled Match board and removes each correctly selected pair", async () => {
    const user = userEvent.setup();
    render(
      <PracticeMatchBoard
        cards={practiceCards("match", ["match", "match"])}
        reducedMotion={false}
        seriousMode={false}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Term:|Definition:/ })).toHaveLength(4);
    await user.click(
      screen.getByRole("button", {
        name: "Term: Which organelle produces most cellular ATP?",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Definition: Mitochondrion" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("button", {
        name: "Term: Which organelle produces most cellular ATP?",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Term:|Definition:/ })).toHaveLength(2);
    expect(screen.getByText(/1 remaining/i)).toBeVisible();
  });

  it("keeps an incorrect Match pair on the board and offers the accessible list view", async () => {
    const user = userEvent.setup();
    render(
      <PracticeMatchBoard
        cards={practiceCards("match", ["match", "match"])}
        reducedMotion
        seriousMode
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Term: Which organelle produces most cellular ATP?",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Definition: Nucleus" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Not a pair/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByLabelText(/Match for Which organelle/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Check pairs" })).toBeEnabled();
  });

  it("shows a mixed Test as one scrollable form and submits every question together", async () => {
    const user = userEvent.setup();
    const cards = practiceCards("test", ["multiple_choice", "typed", "true_false", "select_all"]);
    render(<PracticeTestPaper cards={cards} reducedMotion={false} />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Submit test" })).toBeEnabled();
    const firstMitochondrion = screen.getAllByLabelText("Mitochondrion", {
      selector: "input",
    })[0];
    if (!firstMitochondrion) throw new Error("Multiple-choice fixture was not rendered.");
    await user.click(firstMitochondrion);
    await user.type(screen.getByLabelText("Your answer"), "Nucleus");
    await user.click(screen.getByLabelText("True", { selector: "input" }));
    const selectAllMitochondrion = screen.getAllByLabelText("Mitochondrion", {
      selector: "input",
    })[1];
    if (!selectAllMitochondrion) throw new Error("Select-all fixture was not rendered.");
    await user.click(selectAllMitochondrion);
    await user.click(screen.getByRole("button", { name: "Submit test" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === "/api/practice/attempts")).toBe(
      true,
    );
  });
});

describe.each([
  "flashcards",
  "learn",
  "write",
  "test",
  "match",
  "spell",
  "pronunciation",
  "diagram",
] as const)("%s setup", (mode) => {
  it("offers a functional setup with real deck scope and an enabled start action", () => {
    render(
      <PracticeSetup
        decks={[{ id: "0190d9f0-0000-7000-8000-000000000004", name: "Biology", total: 12 }]}
        mode={mode}
      />,
    );

    expect(screen.getByRole("heading", { name: new RegExp(`Set up .*`, "i") })).toBeVisible();
    expect(screen.getByText("Biology")).toBeVisible();
    expect(screen.getByRole("button", { name: new RegExp(`Start`, "i") })).toBeEnabled();
    expect(screen.getByText(/practice only|review schedule/i)).toBeVisible();
  });
});
