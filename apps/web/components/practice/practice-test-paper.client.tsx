"use client";

import { Button } from "@lumen/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useOffline } from "@/components/offline/offline-provider.client";
import type { PracticeCardView } from "@/lib/practice/models";

import { recordPracticeAttempt } from "./practice-attempt-client";

type TestResponse = string | readonly string[];
type TestResponses = Readonly<Record<number, TestResponse>>;

const questionLabels: Readonly<Record<string, string>> = {
  list: "List answer",
  multiple_choice: "Multiple choice",
  ordering: "Ordering",
  select_all: "Select all",
  true_false: "True or false",
  typed: "Written answer",
};

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function hasAnswer(value: TestResponse | undefined): boolean {
  return Array.isArray(value)
    ? value.length > 0
    : typeof value === "string" && value.trim().length > 0;
}

function storedResponses(key: string): TestResponses {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const entries: [number, TestResponse][] = [];
    for (const [position, response] of Object.entries(value)) {
      const parsedPosition = Number.parseInt(position, 10);
      if (!Number.isInteger(parsedPosition)) continue;
      if (typeof response === "string") entries.push([parsedPosition, response]);
      else if (Array.isArray(response))
        entries.push([
          parsedPosition,
          response.filter((item): item is string => typeof item === "string"),
        ]);
    }
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function PracticeTestPaper({
  cards,
  reducedMotion,
}: {
  readonly cards: readonly PracticeCardView[];
  readonly reducedMotion: boolean;
}) {
  const first = cards[0];
  if (!first) return null;
  return <PracticeTestPaperReady cards={cards} first={first} reducedMotion={reducedMotion} />;
}

function PracticeTestPaperReady({
  cards,
  first,
  reducedMotion,
}: {
  readonly cards: readonly PracticeCardView[];
  readonly first: PracticeCardView;
  readonly reducedMotion: boolean;
}) {
  const router = useRouter();
  const offline = useOffline();
  const storageKey = `lumen:test-draft:${first.session.id}`;
  const [responses, setResponses] = useState<TestResponses>({});
  const [hydrated, setHydrated] = useState(false);
  const [flagged, setFlagged] = useState<ReadonlySet<number>>(() => new Set());
  const [submitted, setSubmitted] = useState<ReadonlySet<number>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(first.session.status === "paused");
  const [sessionVersion, setSessionVersion] = useState(first.session.version);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(first.session.config.timerSeconds);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => {
      setResponses((current) =>
        Object.keys(current).length > 0 ? current : storedResponses(storageKey),
      );
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(responses));
  }, [hydrated, responses, storageKey]);

  useEffect(() => {
    if (paused || first.session.config.timerSeconds === null) return;
    const timer = window.setInterval(
      () => setRemainingSeconds((current) => (current === null ? null : Math.max(0, current - 1))),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [first.session.config.timerSeconds, paused]);

  const answered = useMemo(
    () =>
      cards.filter(
        (card) => submitted.has(card.item.position) || hasAnswer(responses[card.item.position]),
      ).length,
    [cards, responses, submitted],
  );
  const totalAnswered = Math.min(first.session.total, first.session.completed + answered);

  function updateResponse(position: number, value: TestResponse) {
    setResponses((current) => ({ ...current, [position]: value }));
  }

  function toggleChoice(position: number, option: string) {
    const current = responses[position];
    const choices = Array.isArray(current) ? current : [];
    updateResponse(
      position,
      choices.includes(option)
        ? choices.filter((choice) => choice !== option)
        : [...choices, option],
    );
  }

  async function changeSession(action: "pause" | "resume") {
    if (pending) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/practice/sessions/${first.session.id}/control`, {
      body: JSON.stringify({ action, expectedVersion: sessionVersion }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      readonly data?: { readonly version?: number };
      readonly message?: string;
    };
    if (!response.ok) {
      setError(payload.message ?? "The test could not be paused.");
      setPending(false);
      return;
    }
    if (typeof payload.data?.version === "number") setSessionVersion(payload.data.version);
    setPaused(action === "pause");
    setPending(false);
  }

  async function submitTest(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const pendingCards = cards.filter((card) => !submitted.has(card.item.position));
    if (pendingCards.length === 0) return;
    setPending(true);
    setError(null);
    const durationPerQuestion = Math.max(
      0,
      (performance.now() - (startedAt.current || performance.now())) / pendingCards.length,
    );
    const nextSubmitted = new Set(submitted);
    try {
      for (const card of pendingCards) {
        const response = responses[card.item.position];
        const responseText = Array.isArray(response)
          ? JSON.stringify(response)
          : typeof response === "string"
            ? response
            : "";
        await recordPracticeAttempt({
          card,
          durationMs: durationPerQuestion,
          queueOffline: offline.queuePracticeAttempt,
          response: responseText,
          responseKind: card.item.questionKind,
          ...(hasAnswer(response) ? {} : { selfVerdict: "incorrect" as const }),
        });
        nextSubmitted.add(card.item.position);
        setSubmitted(new Set(nextSubmitted));
      }
      window.sessionStorage.removeItem(storageKey);
      router.refresh();
    } catch (caught) {
      setSubmitted(new Set(nextSubmitted));
      setError(
        caught instanceof Error
          ? `${caught.message} Your saved answers are still here; submit again to continue.`
          : "The test could not be submitted. Your answers are still here.",
      );
    } finally {
      setPending(false);
    }
  }

  const complete = first.session.completed + submitted.size;
  return (
    <main
      className={`practice-session practice-test-paper ${reducedMotion ? "practice-session--reduced-motion" : ""}`}
    >
      <header className="practice-session-bar practice-session-bar--test">
        <div className="practice-session-bar__identity">
          <a href="/app/study" aria-label="Save and exit to Study">
            ←
          </a>
          <span>
            <strong>{first.deckTitle}</strong>
            <small>Practice test</small>
          </span>
        </div>
        <div
          aria-label={`${String(totalAnswered)} of ${String(first.session.total)} questions answered`}
          className="practice-session-progress"
        >
          <span>
            <i style={{ width: `${String((totalAnswered / first.session.total) * 100)}%` }} />
          </span>
          <small>
            {totalAnswered} / {first.session.total} answered
          </small>
        </div>
        <div className="practice-session-bar__actions">
          {remainingSeconds !== null && (
            <time aria-label="Time remaining">{formatTimer(remainingSeconds)}</time>
          )}
          {first.session.config.testOptions.pauseAllowed && (
            <Button
              disabled={pending}
              onClick={() => void changeSession(paused ? "resume" : "pause")}
              size="sm"
              variant="secondary"
            >
              {paused ? "Resume" : "Pause"}
            </Button>
          )}
          <a className="practice-exit-link" href="/app/study">
            Save &amp; exit
          </a>
        </div>
      </header>

      <form className="practice-test-document" onSubmit={(event) => void submitTest(event)}>
        <header className="practice-test-document__intro">
          <p className="eyebrow">Practice test</p>
          <h1>Show what you know</h1>
          <p>Work at your pace. Your answers stay on this page until you submit the whole test.</p>
        </header>
        <div className="practice-test-document__layout">
          <div className="practice-test-questions">
            {cards.map((card, index) => {
              const kind = card.item.questionKind;
              const response = responses[card.item.position];
              const isSubmitted = submitted.has(card.item.position);
              return (
                <section
                  aria-labelledby={`test-question-${String(card.item.position)}`}
                  className="practice-test-question"
                  data-accent={index % 4}
                  key={card.item.position}
                >
                  <header>
                    <div>
                      <span>{card.item.position + 1}</span>
                      <small>{questionLabels[kind] ?? "Written answer"}</small>
                    </div>
                    <button
                      aria-label={`${flagged.has(card.item.position) ? "Unflag" : "Flag"} question ${String(card.item.position + 1)}`}
                      aria-pressed={flagged.has(card.item.position)}
                      onClick={() =>
                        setFlagged((current) => {
                          const next = new Set(current);
                          if (next.has(card.item.position)) next.delete(card.item.position);
                          else next.add(card.item.position);
                          return next;
                        })
                      }
                      type="button"
                    >
                      {flagged.has(card.item.position) ? "★ Flagged" : "☆ Flag"}
                    </button>
                  </header>
                  <h2 id={`test-question-${String(card.item.position)}`}>{card.prompt}</h2>
                  {(kind === "multiple_choice" || kind === "true_false") && (
                    <fieldset className="practice-test-options">
                      <legend>Choose one answer</legend>
                      {card.choices.map((option, optionIndex) => (
                        <label key={`${option}:${String(optionIndex)}`}>
                          <input
                            checked={response === option}
                            disabled={isSubmitted}
                            name={`question-${String(card.item.position)}`}
                            onChange={() => updateResponse(card.item.position, option)}
                            type="radio"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {kind === "select_all" && (
                    <fieldset className="practice-test-options">
                      <legend>Select every correct answer</legend>
                      {card.choices.map((option, optionIndex) => (
                        <label key={`${option}:${String(optionIndex)}`}>
                          <input
                            checked={Array.isArray(response) && response.includes(option)}
                            disabled={isSubmitted}
                            onChange={() => toggleChoice(card.item.position, option)}
                            type="checkbox"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {!["multiple_choice", "select_all", "true_false"].includes(kind) && (
                    <label className="practice-test-written">
                      <span>
                        {kind === "ordering"
                          ? "Put one item on each line, in the correct order"
                          : kind === "list"
                            ? "List each part of your answer"
                            : "Your answer"}
                      </span>
                      <textarea
                        autoComplete="off"
                        disabled={isSubmitted}
                        onChange={(event) => updateResponse(card.item.position, event.target.value)}
                        placeholder={
                          kind === "ordering" || kind === "list"
                            ? "One item per line"
                            : "Type what you remember"
                        }
                        rows={kind === "ordering" || kind === "list" ? 5 : 3}
                        value={typeof response === "string" ? response : ""}
                      />
                    </label>
                  )}
                  {isSubmitted && <p className="practice-test-question__saved">Saved ✓</p>}
                </section>
              );
            })}
          </div>

          <aside className="practice-test-overview" aria-label="Test progress">
            <strong>Test progress</strong>
            <p>
              {totalAnswered} answered · {first.session.total - totalAnswered} unanswered
            </p>
            <ol>
              {cards.map((card) => (
                <li key={card.item.position}>
                  <a
                    aria-label={`Go to question ${String(card.item.position + 1)}${hasAnswer(responses[card.item.position]) ? ", answered" : ", unanswered"}${flagged.has(card.item.position) ? ", flagged" : ""}`}
                    data-answered={
                      submitted.has(card.item.position) || hasAnswer(responses[card.item.position])
                    }
                    data-flagged={flagged.has(card.item.position)}
                    href={`#test-question-${String(card.item.position)}`}
                  >
                    {card.item.position + 1}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <footer className="practice-test-submit">
          <div>
            <strong>Ready to finish?</strong>
            <span>
              {cards.length - answered === 0
                ? "Every question has an answer."
                : `${String(cards.length - answered)} unanswered question${cards.length - answered === 1 ? "" : "s"} will be marked incorrect.`}
            </span>
          </div>
          <Button disabled={pending || complete >= first.session.total} type="submit">
            {pending
              ? `Submitting ${String(submitted.size)} of ${String(cards.length)}…`
              : "Submit test"}
          </Button>
        </footer>
        {remainingSeconds === 0 && (
          <p className="practice-session-error" role="status">
            Time is up. Submit the test when you are ready.
          </p>
        )}
        {error && (
          <p className="form-error practice-session-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {paused && (
        <div
          aria-labelledby="paused-title"
          aria-modal="true"
          className="practice-pause-panel"
          role="dialog"
        >
          <h2 id="paused-title">Test paused</h2>
          <p>Your answers are saved in this browser.</p>
          <Button disabled={pending} onClick={() => void changeSession("resume")}>
            Resume test
          </Button>
        </div>
      )}
    </main>
  );
}
