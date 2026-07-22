"use client";

import { Button, Input } from "@lumen/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  practiceModeCopy,
  type PracticeMode,
  type PracticeModePreference,
  type PracticeSessionConfig,
} from "@/lib/practice/models";

interface DeckOption {
  readonly id: string;
  readonly name: string;
  readonly total: number;
}

interface ApiBody {
  readonly message?: string;
}

const questionChoices = [
  ["flashcard", "Flashcard"],
  ["multiple_choice", "Multiple choice"],
  ["select_all", "Select all"],
  ["true_false", "True / false"],
  ["typed", "Typed answer"],
  ["ordering", "Ordering"],
  ["list", "List answer"],
] as const;

type GoalKind = PracticeSessionConfig["goal"]["kind"];

function preferenceRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function preferenceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function preferenceNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function preferenceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function PracticeSetup({
  decks,
  initialDeckId,
  initialGoal,
  mode,
  preference,
  tags,
}: {
  readonly decks: readonly DeckOption[];
  readonly initialDeckId?: string | undefined;
  readonly initialGoal?: string | undefined;
  readonly mode: PracticeMode;
  readonly preference?: PracticeModePreference | null | undefined;
  readonly tags?: readonly string[] | undefined;
}) {
  const router = useRouter();
  const copy = practiceModeCopy[mode];
  const saved = preference?.config ?? {};
  const savedGoal = preferenceRecord(saved.goal);
  const savedGoalKind = preferenceString(savedGoal.kind, "recommended");
  const allowedGoals: readonly GoalKind[] = [
    "recommended",
    "time",
    "count",
    "mastery",
    "new",
    "due",
    "weak",
    "starred",
    "exam",
  ];
  const requestedGoal = allowedGoals.includes(initialGoal as GoalKind)
    ? (initialGoal as GoalKind)
    : null;
  const [selectedDeckIds, setSelectedDeckIds] = useState<readonly string[]>(
    initialDeckId && decks.some((deck) => deck.id === initialDeckId) ? [initialDeckId] : [],
  );
  const [targetCount, setTargetCount] = useState(
    preferenceNumber(saved.targetCount, mode === "match" ? 8 : 12),
  );
  const [gradingMode, setGradingMode] = useState<"strict" | "moderate" | "relaxed">(() => {
    const value = preferenceString(saved.gradingMode, "moderate");
    return value === "strict" || value === "relaxed" ? value : "moderate";
  });
  const [answerDirection, setAnswerDirection] = useState<
    "prompt_answer" | "answer_prompt" | "mixed"
  >(() => {
    const value = preferenceString(saved.answerDirection, "prompt_answer");
    return value === "answer_prompt" || value === "mixed" ? value : "prompt_answer";
  });
  const [questionTypes, setQuestionTypes] = useState<readonly string[]>(
    Array.isArray(saved.questionTypes)
      ? saved.questionTypes.filter((item): item is string => typeof item === "string")
      : mode === "test"
        ? ["multiple_choice", "typed", "true_false"]
        : ["flashcard", "multiple_choice", "typed"],
  );
  const [hints, setHints] = useState<"off" | "on_request">(
    saved.hints === "off" ? "off" : "on_request",
  );
  const [retypeCorrect, setRetypeCorrect] = useState(preferenceBoolean(saved.retypeCorrect, true));
  const [autoplay, setAutoplay] = useState(preferenceBoolean(saved.autoplay, false));
  const [audio, setAudio] = useState(preferenceBoolean(saved.audio, true));
  const [language, setLanguage] = useState(preferenceString(saved.language, "en-US"));
  const [goalKind, setGoalKind] = useState<GoalKind>(
    requestedGoal ??
      (allowedGoals.includes(savedGoalKind as GoalKind)
        ? (savedGoalKind as GoalKind)
        : "recommended"),
  );
  const [timeMinutes, setTimeMinutes] = useState(preferenceNumber(savedGoal.timeMinutes, 10));
  const [masteryTarget, setMasteryTarget] = useState(
    preferenceNumber(savedGoal.masteryTarget, 0.8),
  );
  const [examAt, setExamAt] = useState(preferenceString(savedGoal.examAt, ""));
  const [selectedTags, setSelectedTags] = useState<readonly string[]>(
    Array.isArray(saved.tags)
      ? saved.tags.filter((item): item is string => typeof item === "string")
      : [],
  );
  const savedTimer = preferenceNumber(saved.timerSeconds, mode === "match" ? 180 : 600);
  const [timed, setTimed] = useState(
    (typeof saved.timerSeconds === "number" && savedTimer > 0) || mode === "match",
  );
  const [timerMinutes, setTimerMinutes] = useState(Math.max(1, Math.round(savedTimer / 60)));
  const savedTestOptions = preferenceRecord(saved.testOptions);
  const [reviewPolicy, setReviewPolicy] = useState<"after_each" | "end">(
    savedTestOptions.reviewPolicy === "after_each" ? "after_each" : "end",
  );
  const [testLayout, setTestLayout] = useState<"one_at_a_time" | "one_page">(
    savedTestOptions.layout === "one_page" ? "one_page" : "one_at_a_time",
  );
  const [partialCredit, setPartialCredit] = useState(
    preferenceBoolean(savedTestOptions.partialCredit, true),
  );
  const [pauseAllowed, setPauseAllowed] = useState(
    preferenceBoolean(savedTestOptions.pauseAllowed, true),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCardCount = useMemo(
    () =>
      selectedDeckIds.length
        ? decks
            .filter((deck) => selectedDeckIds.includes(deck.id))
            .reduce((sum, deck) => sum + deck.total, 0)
        : decks.reduce((sum, deck) => sum + deck.total, 0),
    [decks, selectedDeckIds],
  );

  function toggleDeck(deckId: string) {
    setSelectedDeckIds((current) =>
      current.includes(deckId) ? current.filter((id) => id !== deckId) : [...current, deckId],
    );
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    const sessionId = crypto.randomUUID();
    const goalId = goalKind === "recommended" || goalKind === "count" ? null : crypto.randomUUID();
    const testAttemptId = mode === "test" ? crypto.randomUUID() : undefined;
    const testDefinitionId = mode === "test" ? crypto.randomUUID() : undefined;
    const config = {
      answerDirection,
      audio,
      autoplay,
      gradingMode,
      goal: {
        examAt: goalKind === "exam" ? examAt || null : null,
        kind: goalKind,
        masteryTarget: goalKind === "mastery" ? masteryTarget : null,
        timeMinutes: goalKind === "time" ? timeMinutes : null,
      },
      hints,
      language,
      questionTypes,
      retypeCorrect,
      tags: selectedTags,
      targetCount,
      testOptions: {
        layout: testLayout,
        partialCredit,
        pauseAllowed,
        reviewPolicy,
      },
      timerSeconds: timed ? timerMinutes * 60 : null,
    };
    const preferenceResponse = await fetch("/api/practice/preferences", {
      body: JSON.stringify({
        config,
        expectedVersion: preference?.version ?? 0,
        mode,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!preferenceResponse.ok && preferenceResponse.status !== 409) {
      setError("Your practice preferences could not be saved. Try again.");
      setPending(false);
      return;
    }
    const response = await fetch("/api/practice/sessions", {
      body: JSON.stringify({
        ...config,
        goal: { ...config.goal, id: goalId },
        ...(selectedDeckIds.length ? { deckIds: selectedDeckIds } : {}),
        mode,
        sessionId,
        ...(testAttemptId ? { testAttemptId } : {}),
        ...(testDefinitionId ? { testDefinitionId } : {}),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ApiBody;
      setError(payload.message ?? "The practice session could not be started.");
      setPending(false);
      return;
    }
    router.push(`/app/practice/session/${sessionId}` as Route);
  }

  const gradingRelevant = ["learn", "write", "spell", "diagram", "test"].includes(mode);
  const questionMixRelevant = mode === "learn" || mode === "test";
  const visibleQuestionChoices =
    mode === "test" ? questionChoices.filter(([value]) => value !== "flashcard") : questionChoices;

  return (
    <main className="practice-setup" data-guide-id="practice-setup">
      <a className="practice-back-link" href="/app/study">
        ← Study
      </a>
      <header className="practice-setup__header">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>Set up {copy.label}</h1>
        <p>{copy.description}</p>
      </header>

      <div className="practice-setup__layout">
        <section aria-labelledby="scope-heading" className="practice-setup-card">
          <div className="practice-setup-card__heading">
            <span>1</span>
            <div>
              <h2 id="scope-heading">Choose the material</h2>
              <p>Leave every deck unchecked to use all active cards.</p>
            </div>
          </div>
          <div className="practice-deck-picker">
            {decks.map((deck) => (
              <label key={deck.id}>
                <input
                  checked={selectedDeckIds.includes(deck.id)}
                  onChange={() => toggleDeck(deck.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{deck.name}</strong>
                  <small>{deck.total} cards</small>
                </span>
              </label>
            ))}
            {decks.length === 0 && <p>Add cards to your library before starting practice.</p>}
          </div>
        </section>

        <section aria-labelledby="session-heading" className="practice-setup-card">
          <div className="practice-setup-card__heading">
            <span>2</span>
            <div>
              <h2 id="session-heading">Shape the session</h2>
              <p>These preferences affect practice only—not your review schedule.</p>
            </div>
          </div>
          <div className="practice-setup-fields">
            <label>
              <span>Goal</span>
              <select
                value={goalKind}
                onChange={(event) => setGoalKind(event.target.value as GoalKind)}
              >
                <option value="recommended">Recommended mix</option>
                <option value="weak">Strengthen weak areas</option>
                <option value="due">Practice due material</option>
                <option value="new">Introduce new material</option>
                <option value="starred">Starred cards</option>
                <option value="count">Question count</option>
                <option value="time">Time goal</option>
                <option value="mastery">Mastery goal</option>
                <option value="exam">Prepare for an exam date</option>
              </select>
            </label>
            <label>
              <span>Questions</span>
              <Input
                max={Math.max(
                  1,
                  Math.min(500, selectedCardCount * (mode === "learn" || mode === "write" ? 2 : 1)),
                )}
                min={1}
                onChange={(event) => setTargetCount(Number(event.target.value))}
                type="number"
                value={targetCount}
              />
            </label>
            {goalKind === "time" && (
              <label>
                <span>Minutes</span>
                <Input
                  min={1}
                  max={240}
                  onChange={(event) => setTimeMinutes(Number(event.target.value))}
                  type="number"
                  value={timeMinutes}
                />
              </label>
            )}
            {goalKind === "mastery" && (
              <label>
                <span>Session mastery target</span>
                <select
                  value={masteryTarget}
                  onChange={(event) => setMasteryTarget(Number(event.target.value))}
                >
                  <option value={0.7}>70%</option>
                  <option value={0.8}>80% recommended</option>
                  <option value={0.9}>90%</option>
                </select>
              </label>
            )}
            {goalKind === "exam" && (
              <label>
                <span>Exam date</span>
                <Input
                  onChange={(event) => setExamAt(event.target.value)}
                  type="date"
                  value={examAt}
                />
              </label>
            )}
            <label className="practice-switch-row">
              <input
                checked={audio}
                onChange={(event) => setAudio(event.target.checked)}
                type="checkbox"
              />
              <span>Audio when available</span>
            </label>
            {(mode === "spell" || mode === "pronunciation") && (
              <label>
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="it-IT">Italian</option>
                  <option value="pt-BR">Portuguese (Brazil)</option>
                  <option value="ja-JP">Japanese</option>
                </select>
              </label>
            )}
            <label>
              <span>Answer direction</span>
              <select
                value={answerDirection}
                onChange={(event) =>
                  setAnswerDirection(event.target.value as typeof answerDirection)
                }
              >
                <option value="prompt_answer">Prompt → answer</option>
                <option value="answer_prompt">Answer → prompt</option>
                <option value="mixed">Mix both directions</option>
              </select>
            </label>
            {gradingRelevant && (
              <label>
                <span>Grading strictness</span>
                <select
                  value={gradingMode}
                  onChange={(event) => setGradingMode(event.target.value as typeof gradingMode)}
                >
                  <option value="moderate">Moderate</option>
                  <option value="strict">Strict</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </label>
            )}
            {(mode === "test" || mode === "match") && (
              <label className="practice-switch-row">
                <input
                  checked={timed}
                  onChange={(event) => setTimed(event.target.checked)}
                  type="checkbox"
                />
                <span>Timed session</span>
              </label>
            )}
            {timed && (
              <label>
                <span>Timer (minutes)</span>
                <Input
                  max={240}
                  min={1}
                  onChange={(event) => setTimerMinutes(Number(event.target.value))}
                  type="number"
                  value={timerMinutes}
                />
              </label>
            )}
          </div>
          {(tags?.length ?? 0) > 0 && (
            <details className="practice-advanced-options">
              <summary>Tags and advanced scope</summary>
              <fieldset className="practice-question-mix">
                <legend>Tags</legend>
                {tags?.map((tag) => (
                  <label key={tag}>
                    <input
                      checked={selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      type="checkbox"
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </fieldset>
            </details>
          )}
          {questionMixRelevant && (
            <fieldset className="practice-question-mix">
              <legend>Question mix</legend>
              {visibleQuestionChoices.map(([value, label]) => (
                <label key={value}>
                  <input
                    checked={questionTypes.includes(value)}
                    onChange={() =>
                      setQuestionTypes((current) =>
                        current.includes(value)
                          ? current.filter((item) => item !== value)
                          : [...current, value],
                      )
                    }
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {mode === "test" && (
            <details className="practice-advanced-options">
              <summary>Test behavior</summary>
              <div className="practice-inline-options">
                <label>
                  <span>Test layout</span>
                  <select
                    value={testLayout}
                    onChange={(event) =>
                      setTestLayout(event.target.value as "one_at_a_time" | "one_page")
                    }
                  >
                    <option value="one_at_a_time">One question at a time</option>
                    <option value="one_page">Answer sheet with question navigation</option>
                  </select>
                </label>
                <label>
                  <span>Answer review</span>
                  <select
                    value={reviewPolicy}
                    onChange={(event) =>
                      setReviewPolicy(event.target.value as "after_each" | "end")
                    }
                  >
                    <option value="end">After the test</option>
                    <option value="after_each">After each answer</option>
                  </select>
                </label>
                <label>
                  <input
                    checked={partialCredit}
                    onChange={(event) => setPartialCredit(event.target.checked)}
                    type="checkbox"
                  />{" "}
                  Partial credit for select-all
                </label>
                <label>
                  <input
                    checked={pauseAllowed}
                    onChange={(event) => setPauseAllowed(event.target.checked)}
                    type="checkbox"
                  />{" "}
                  Allow pause and resume
                </label>
              </div>
            </details>
          )}
          {(mode === "learn" || mode === "write") && (
            <div className="practice-inline-options">
              <label>
                <input
                  checked={hints === "on_request"}
                  onChange={(event) => setHints(event.target.checked ? "on_request" : "off")}
                  type="checkbox"
                />{" "}
                Hints on request
              </label>
              <label>
                <input
                  checked={retypeCorrect}
                  onChange={(event) => setRetypeCorrect(event.target.checked)}
                  type="checkbox"
                />{" "}
                Retype after reveal
              </label>
            </div>
          )}
          {mode === "flashcards" && (
            <label className="practice-switch-row">
              <input
                checked={autoplay}
                onChange={(event) => setAutoplay(event.target.checked)}
                type="checkbox"
              />{" "}
              <span>Autoplay after five seconds</span>
            </label>
          )}
          {mode === "pronunciation" && (
            <details className="practice-privacy-note">
              <summary>Recording privacy</summary>
              <p>
                Microphone access is optional. Recordings stay in this browser and are never
                uploaded.
              </p>
            </details>
          )}
          {mode === "diagram" && (
            <p className="practice-privacy-note">
              Every visual prompt includes a text label flow and keyboard alternative.
            </p>
          )}
        </section>
      </div>

      <footer className="practice-setup__footer">
        <div>
          <strong>
            {goalKind === "time"
              ? `${String(timeMinutes)} minutes`
              : goalKind === "mastery"
                ? `${String(Math.round(masteryTarget * 100))}% session mastery target`
                : `${String(Math.min(targetCount, Math.max(0, selectedCardCount * 2)))} prompts planned`}
          </strong>
          <small>{selectedCardCount} cards in scope</small>
        </div>
        <Button disabled={pending || decks.length === 0} onClick={() => void start()}>
          {pending ? "Building session…" : `Start ${copy.label}`}
        </Button>
      </footer>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
