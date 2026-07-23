"use client";

import { Button, Input } from "@lumen/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from "react";

import { StudyCardRenderer } from "@/components/content/study-card-renderer.client";
import { useOffline } from "@/components/offline/offline-provider.client";
import {
  practiceModeCopy,
  type PracticeAttemptResult,
  type PracticeCardView,
  type PracticeSessionSummary,
} from "@/lib/practice/models";

import { recordPracticeAttempt } from "./practice-attempt-client";

interface ApiResponse<T> {
  readonly data?: T;
  readonly message?: string;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${String(minutes)}m ${String(seconds % 60)}s` : `${String(seconds)}s`;
}

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function canSpeak(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis?.speak === "function";
}

function speak(text: string, rate = 1, language = "en-US"): void {
  if (!canSpeak() || typeof SpeechSynthesisUtterance === "undefined") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function PracticeSessionComplete({
  summary,
}: {
  readonly summary: PracticeSessionSummary | null;
}) {
  if (!summary)
    return (
      <main className="practice-complete">
        <p className="eyebrow">Practice</p>
        <h1>This session is unavailable</h1>
        <p>It may have been removed from this learner context.</p>
        <a className="button-link" href="/app/study">
          Return to Study
        </a>
      </main>
    );
  const mode = practiceModeCopy[summary.mode];
  const heading =
    summary.mode === "test"
      ? `${String(Math.round(summary.accuracy * 100))}% on this test`
      : summary.mode === "match"
        ? "Board cleared"
        : "You finished the session";
  const completionCopy =
    summary.mode === "test"
      ? "Your score is ready. Review each question below, then practice the concepts that need another pass."
      : summary.mode === "match"
        ? "Every pair is matched. Try again for a faster time, or switch to Write for stronger recall."
        : "Your progress is saved. Practice builds mastery here; your review schedule changes only when you choose to rate an eligible recall.";
  return (
    <main className="practice-complete" data-guide-id="practice-summary">
      <span aria-hidden="true" className="practice-complete__mark">
        ✓
      </span>
      <p className="eyebrow">{mode.label} complete</p>
      <h1>{heading}</h1>
      <p>{completionCopy}</p>
      <dl className="practice-complete__stats">
        <div>
          <dt>Accuracy</dt>
          <dd>{Math.round(summary.accuracy * 100)}%</dd>
        </div>
        <div>
          <dt>Correct</dt>
          <dd>
            {summary.correct} / {summary.answered}
          </dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatDuration(summary.durationMs)}</dd>
        </div>
        <div>
          <dt>Mastered</dt>
          <dd>{summary.mastered}</dd>
        </div>
      </dl>
      {summary.needsWork > 0 && (
        <p className="practice-complete__recommendation">
          Recommended next: a short Write session for {summary.needsWork} concept
          {summary.needsWork === 1 ? "" : "s"} that need stronger recall.
        </p>
      )}
      {summary.mode === "match" && summary.personalBestMs !== null && (
        <p className="practice-complete__recommendation">
          Personal best for this card scope: {formatDuration(summary.personalBestMs)}.
        </p>
      )}
      {summary.mode === "test" && summary.questionReview.length > 0 && (
        <section className="practice-question-review" aria-labelledby="test-review-heading">
          <div>
            <p className="eyebrow">Concept breakdown</p>
            <h2 id="test-review-heading">Review every question</h2>
            <p>
              Partial credit is shown per question. Typed responses may be omitted when the active
              learner&apos;s retention policy minimizes them.
            </p>
          </div>
          <ol>
            {summary.questionReview.map((question) => (
              <li key={`${String(question.position)}:${question.questionKind}`}>
                <header>
                  <strong>Question {question.position + 1}</strong>
                  <span data-verdict={question.verdict}>
                    {Math.round(question.correctness * 100)}% · {question.verdict.replace("_", " ")}
                  </span>
                </header>
                <p>{question.prompt}</p>
                <dl>
                  <div>
                    <dt>Your answer</dt>
                    <dd>{question.response ?? "Not retained"}</dd>
                  </div>
                  <div>
                    <dt>Answer key</dt>
                    <dd>{question.expectedAnswer}</dd>
                  </div>
                </dl>
                <small>{question.explanation}</small>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="practice-complete__actions">
        <a className="button-link" href="/app/study">
          Return to Study
        </a>
        <a className="button-link button-link--secondary" href={`/app/study/mode/${summary.mode}`}>
          {summary.mode === "test" ? "Retake or regenerate" : "Practice again"}
        </a>
        {summary.needsWork > 0 && (
          <a className="button-link button-link--secondary" href="/app/study/mode/write">
            Review mistakes
          </a>
        )}
        {summary.mode === "test" && (
          <button
            className="button-link button-link--secondary"
            onClick={() => window.print()}
            type="button"
          >
            Print answer key
          </button>
        )}
      </div>
    </main>
  );
}

export function PracticeSession({
  card,
  reducedMotion,
  seriousMode,
}: {
  readonly card: PracticeCardView;
  readonly reducedMotion: boolean;
  readonly seriousMode: boolean;
}) {
  const router = useRouter();
  const offline = useOffline();
  const startedAt = useRef(performance.now());
  const pointerStart = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [flipPhase, setFlipPhase] = useState<"answer" | "prompt" | "turning">("prompt");
  const [announcement, setAnnouncement] = useState(
    "Prompt ready. Press Space to reveal the answer.",
  );
  const [response, setResponse] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<readonly string[]>([]);
  const [hintUsed, setHintUsed] = useState(false);
  const [showTextAlternative, setShowTextAlternative] = useState(false);
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(card.session.status === "paused");
  const [sessionVersion, setSessionVersion] = useState(card.session.version);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PracticeAttemptResult | null>(null);
  const [retype, setRetype] = useState("");
  const [overrideSaved, setOverrideSaved] = useState<"answer_key_issue" | "learner_correct" | null>(
    null,
  );
  const [qualificationSaved, setQualificationSaved] = useState(false);
  const [selectedRating, setSelectedRating] = useState<"again" | "hard" | "good" | "easy">("good");
  const [remainingSeconds, setRemainingSeconds] = useState(card.session.config.timerSeconds);
  const [recording, setRecording] = useState(false);
  const [starred, setStarred] = useState(card.schedule?.starred ?? false);
  const flagKey = `lumen:practice-flag:${card.session.id}:${String(card.item.position)}`;
  const [flagged, setFlagged] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(flagKey) === "true",
  );
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [diagramZoom, setDiagramZoom] = useState(1);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const modeCopy = practiceModeCopy[card.session.mode];
  const questionKind = card.item.questionKind;
  const isFlip = questionKind === "flashcard";
  const isChoice =
    questionKind === "multiple_choice" ||
    questionKind === "match" ||
    questionKind === "true_false" ||
    questionKind === "select_all";
  const requiresRetype =
    Boolean(result && result.grade.verdict !== "correct" && card.session.config.retypeCorrect) &&
    !["flashcards", "match", "pronunciation"].includes(card.session.mode);
  const retypeReady =
    !requiresRetype ||
    retype.trim().localeCompare(card.answer.trim(), undefined, { sensitivity: "base" }) === 0;
  const masteryPercent = Math.round((result?.mastery.overall ?? card.mastery.overall) * 100);

  const reveal = useCallback(() => {
    if (revealed || flipPhase !== "prompt" || result) return;
    const finishReveal = () => {
      revealTimer.current = null;
      setRevealed(true);
      setFlipPhase("answer");
      setAnnouncement("Answer revealed. Choose Still learning or Know it.");
    };
    if (
      reducedMotion ||
      seriousMode ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      finishReveal();
      return;
    }
    setFlipPhase("turning");
    setAnnouncement("Revealing answer.");
    revealTimer.current = window.setTimeout(finishReveal, 230);
  }, [flipPhase, reducedMotion, result, revealed, seriousMode]);

  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (card.session.mode !== "test") return;
    if (flagged) window.sessionStorage.setItem(flagKey, "true");
    else window.sessionStorage.removeItem(flagKey);
  }, [card.session.mode, flagKey, flagged]);

  useEffect(() => {
    if (!card.session.config.autoplay || !isFlip || revealed || paused || result) return;
    const timer = window.setTimeout(reveal, 5_000);
    return () => window.clearTimeout(timer);
  }, [card.session.config.autoplay, isFlip, paused, result, reveal, revealed]);

  useEffect(() => {
    if (remainingSeconds === null || paused || result) return;
    if (remainingSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setRemainingSeconds((current) => (current === null ? null : current - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [paused, remainingSeconds, result]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return;
      if (event.code === "Space" && isFlip && !result) {
        event.preventDefault();
        reveal();
      }
      if (event.key === "Escape" && !pending) void changeSession("pause");
      if (event.key === "1" && revealed && isFlip && !result)
        void submit("still_learning", "incorrect");
      if (event.key === "2" && revealed && isFlip && !result) void submit("know", "correct");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    },
    [recordingUrl],
  );

  async function submit(
    responseKind = questionKind,
    selfVerdict?: "correct" | "partial" | "incorrect" | "needs_review",
  ) {
    if (pending || result) return;
    const received =
      questionKind === "select_all" ? JSON.stringify(selectedChoices) : (choice ?? response);
    if (!selfVerdict && !received.trim()) {
      setError("Enter or choose an answer first.");
      return;
    }
    setPending(true);
    setError(null);
    let attempt: PracticeAttemptResult;
    try {
      attempt = await recordPracticeAttempt({
        answerRevealed: revealed,
        card,
        durationMs: performance.now() - startedAt.current,
        hintsUsed: hintUsed ? 1 : 0,
        queueOffline: offline.queuePracticeAttempt,
        response: received,
        responseKind,
        ...(selfVerdict ? { selfVerdict } : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The response could not be saved.");
      setPending(false);
      return;
    }
    if (card.session.mode === "test" && card.session.config.testOptions.reviewPolicy === "end") {
      setAnnouncement("Answer saved. Moving to the next test question.");
      setPending(false);
      router.refresh();
      return;
    }
    setResult(attempt);
    setRevealed(true);
    setFlipPhase("answer");
    if (attempt.qualification.suggestedRating)
      setSelectedRating(attempt.qualification.suggestedRating);
    setPending(false);
  }

  async function changeSession(action: "pause" | "resume" | "abandon") {
    if (pending) return;
    setPending(true);
    setError(null);
    const responseRequest = await fetch(`/api/practice/sessions/${card.session.id}/control`, {
      body: JSON.stringify({ action, expectedVersion: sessionVersion }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await responseRequest.json().catch(() => ({}))) as ApiResponse<{
      readonly version?: number;
    }>;
    if (!responseRequest.ok) {
      setError(payload.message ?? "The session could not be changed.");
      setPending(false);
      return;
    }
    if (typeof payload.data?.version === "number") setSessionVersion(payload.data.version);
    if (action === "pause") setPaused(true);
    if (action === "resume") {
      setPaused(false);
      router.refresh();
    }
    if (action === "abandon") router.push("/app/study" as Route);
    setPending(false);
  }

  async function toggleStar() {
    if (pending) return;
    setPending(true);
    setError(null);
    const responseRequest = await fetch("/api/practice/stars", {
      body: JSON.stringify({
        cardId: card.cardId,
        idempotencyKey: crypto.randomUUID(),
        operation: starred ? "unstar" : "star",
        operationEventId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!responseRequest.ok) setError("The star could not be changed. Your answer is unaffected.");
    else setStarred((current) => !current);
    setPending(false);
  }

  async function override(reason: "answer_key_issue" | "learner_correct") {
    if (!result || pending) return;
    setPending(true);
    const responseRequest = await fetch("/api/practice/overrides", {
      body: JSON.stringify({
        attemptId: result.attemptId,
        overrideId: crypto.randomUUID(),
        reason,
        replacementVerdict: "correct",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (responseRequest.ok) setOverrideSaved(reason);
    else setError("The correction could not be audited.");
    setPending(false);
  }

  async function qualify() {
    if (!result?.qualification.eligible || pending) return;
    setPending(true);
    setError(null);
    const responseRequest = await fetch("/api/practice/qualifications", {
      body: JSON.stringify({
        attemptId: result.attemptId,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt.current)),
        qualificationId: crypto.randomUUID(),
        reviewId: crypto.randomUUID(),
        reviewIdempotencyKey: crypto.randomUUID(),
        selectedRating,
        studySessionId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (responseRequest.ok) setQualificationSaved(true);
    else {
      const payload = (await responseRequest.json().catch(() => ({}))) as ApiResponse<never>;
      setError(payload.message ?? "The SRS rating could not be applied.");
    }
    setPending(false);
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(
        "Local microphone recording is unavailable. Use the text and self-review alternative.",
      );
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(nextStream);
      chunks.current = [];
      stream.current = nextStream;
      recorder.current = next;
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      next.onstop = () => {
        const url = URL.createObjectURL(
          new Blob(chunks.current, { type: next.mimeType || "audio/webm" }),
        );
        setRecordingUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
        nextStream.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        setRecording(false);
      };
      next.start();
      setRecording(true);
    } catch {
      setError("Microphone access was not granted. Nothing was recorded or uploaded.");
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = event.clientX;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (pointerStart.current === null || !isFlip || result) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) > 48) reveal();
  }

  const hint = useMemo(() => {
    const words = card.answer.trim().split(/\s+/u);
    return words
      .map((word) => `${word.slice(0, 1)}${"•".repeat(Math.max(0, word.length - 1))}`)
      .join(" ");
  }, [card.answer]);
  const timeUp = remainingSeconds === 0;

  return (
    <main
      className={`practice-session practice-session--${card.session.config.testOptions.layout} ${reducedMotion ? "practice-session--reduced-motion" : ""}`}
    >
      <header className="practice-session-bar">
        <div className="practice-session-bar__identity">
          <a href="/app/study" aria-label="Exit to Study">
            ←
          </a>
          <span>
            <strong>{card.deckTitle}</strong>
            <small>{modeCopy.label}</small>
          </span>
        </div>
        <div
          className="practice-session-progress"
          aria-label={`${card.session.completed} of ${card.session.total} complete`}
        >
          <span>
            <i
              style={{ width: `${String((card.session.completed / card.session.total) * 100)}%` }}
            />
          </span>
          <small>
            {card.session.completed} / {card.session.total}
          </small>
        </div>
        <div className="practice-session-bar__actions">
          {remainingSeconds !== null && (
            <time aria-label="Time remaining">{formatTimer(remainingSeconds)}</time>
          )}
          <Button
            disabled={
              pending ||
              (card.session.mode === "test" && !card.session.config.testOptions.pauseAllowed)
            }
            onClick={() => void changeSession(paused ? "resume" : "pause")}
            size="sm"
            variant="secondary"
          >
            {paused ? "Resume" : "Pause"}
          </Button>
          {card.session.mode === "test" && (
            <button
              aria-pressed={flagged}
              onClick={() => setFlagged((current) => !current)}
              type="button"
            >
              {flagged ? "Flagged" : "Flag"}
            </button>
          )}
          <button disabled={pending} onClick={() => void changeSession("abandon")} type="button">
            Exit
          </button>
        </div>
      </header>

      {card.session.mode === "test" && (
        <nav className="practice-test-navigation" aria-label="Test questions">
          <span>
            {card.session.items.filter((item) => item.status === "answered").length} answered ·{" "}
            {card.session.items.filter((item) => item.status !== "answered").length} unanswered
          </span>
          <ol>
            {card.session.items.map((item) => {
              const current = item.position === card.item.position;
              const answered = item.status === "answered";
              return (
                <li key={item.position}>
                  {answered ? (
                    <span aria-label={`Question ${String(item.position + 1)}, answered`}>
                      {item.position + 1}
                    </span>
                  ) : (
                    <a
                      aria-current={current ? "step" : undefined}
                      aria-label={`Question ${String(item.position + 1)}${current ? ", current" : ", unanswered"}`}
                      href={`?question=${String(item.position + 1)}`}
                    >
                      {item.position + 1}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
          {card.session.config.testOptions.layout === "one_page" && (
            <small>
              Answer-sheet layout keeps every unanswered question available here; responses save as
              you submit them.
            </small>
          )}
        </nav>
      )}

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      <section className="practice-stage" aria-labelledby="practice-question-label">
        <div className="practice-card-meta">
          <span id="practice-question-label">
            {isFlip ? (revealed ? "Answer" : "Prompt") : questionKind.replaceAll("_", " ")}
          </span>
          <span>
            {card.session.mode === "learn" || card.session.mode === "write"
              ? `Mastery ${String(masteryPercent)}%`
              : `Question ${String(card.item.position + 1)} of ${String(card.session.total)}`}
          </span>
        </div>

        {isFlip && (
          <div className="practice-card-tools" aria-label="Flashcard tools">
            {card.session.config.audio && (
              <Button
                onClick={() =>
                  speak(revealed ? card.answer : card.prompt, 1, card.session.config.language)
                }
                size="sm"
                variant="ghost"
              >
                Hear {revealed ? "answer" : "prompt"}
              </Button>
            )}
            <Button disabled={pending} onClick={() => void toggleStar()} size="sm" variant="ghost">
              {starred ? "★ Starred" : "☆ Star"}
            </Button>
          </div>
        )}

        {isFlip ? (
          <div
            aria-label={`${revealed ? "Answer" : "Prompt"}: ${revealed ? card.answer : card.prompt}. Press Space to flip.`}
            className="practice-flip-card"
            data-flip-phase={flipPhase}
            data-flipped={revealed}
            onClick={reveal}
            onKeyDown={(event) => {
              if (event.key === "Enter") reveal();
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            role="button"
            tabIndex={0}
          >
            <div className="practice-flip-card__inner">
              <article
                className={`practice-flip-card__face practice-flip-card__${revealed ? "back" : "front"}`}
              >
                <small>{revealed ? "Answer" : "Prompt"}</small>
                <p>{revealed ? card.answer : card.prompt}</p>
                <span>
                  {revealed ? "How well did you know it?" : "Click, swipe, or press Space to flip"}
                </span>
              </article>
            </div>
          </div>
        ) : (
          <article className="practice-question-card">
            <div className="practice-question-card__prompt">
              <p>{card.prompt}</p>
            </div>
            {card.session.mode === "diagram" && (
              <div className="practice-diagram-surface">
                <div className="practice-diagram-controls">
                  <label>
                    <span>Zoom</span>
                    <input
                      aria-label="Diagram zoom"
                      max={2}
                      min={1}
                      onChange={(event) => setDiagramZoom(Number(event.target.value))}
                      step={0.1}
                      type="range"
                      value={diagramZoom}
                    />
                  </label>
                  <button onClick={() => setDiagramZoom(1)} type="button">
                    Reset view
                  </button>
                </div>
                <div
                  className="practice-diagram-viewport"
                  style={{ "--practice-diagram-zoom": diagramZoom } as CSSProperties}
                >
                  <StudyCardRenderer renderer={card.renderer} revealed={result !== null} />
                </div>
                <details>
                  <summary>Keyboard and text alternative</summary>
                  <p>{card.renderer.accessibility.nonvisualAlternative}</p>
                  <p>Use the answer field below instead of selecting or dragging a label.</p>
                </details>
              </div>
            )}
            {card.session.mode === "spell" && (
              <div className="practice-audio-controls">
                <Button
                  disabled={!canSpeak()}
                  onClick={() => speak(card.answer, 1, card.session.config.language)}
                  size="sm"
                  variant="secondary"
                >
                  Play word
                </Button>
                <Button
                  disabled={!canSpeak()}
                  onClick={() => speak(card.answer, 0.65, card.session.config.language)}
                  size="sm"
                  variant="secondary"
                >
                  Slower
                </Button>
                <button onClick={() => setShowTextAlternative((current) => !current)} type="button">
                  {showTextAlternative ? "Hide" : "Show"} text alternative
                </button>
                {showTextAlternative && <p>{card.answer}</p>}
                {!canSpeak() && (
                  <p role="status">Browser speech is unavailable. Use the text alternative.</p>
                )}
              </div>
            )}
            {card.session.mode === "pronunciation" && (
              <div className="practice-pronunciation">
                <details className="practice-privacy-note">
                  <summary>Recording privacy</summary>
                  <p>Recording is optional, local to this browser, and never uploaded.</p>
                </details>
                <div>
                  <Button
                    disabled={!canSpeak()}
                    onClick={() => speak(card.answer, 1, card.session.config.language)}
                    size="sm"
                    variant="secondary"
                  >
                    Hear reference
                  </Button>
                  <Button onClick={() => void toggleRecording()} size="sm" variant="secondary">
                    {recording ? "Stop recording" : "Record locally"}
                  </Button>
                </div>
                {recordingUrl && (
                  <audio controls src={recordingUrl}>
                    Local pronunciation recording
                  </audio>
                )}
                <details>
                  <summary>Text and transcript alternative</summary>
                  <p>{card.answer}</p>
                </details>
              </div>
            )}
            {isChoice && (
              <fieldset
                className={`practice-choices ${questionKind === "match" ? "practice-choices--match" : ""}`}
              >
                <legend>
                  {questionKind === "match"
                    ? "Choose the matching answer"
                    : questionKind === "select_all"
                      ? "Select every correct answer"
                      : "Choose one answer"}
                </legend>
                {card.choices.map((option, index) => (
                  <label
                    className={
                      (
                        questionKind === "select_all"
                          ? selectedChoices.includes(option)
                          : choice === option
                      )
                        ? "is-selected"
                        : ""
                    }
                    key={`${option}:${String(index)}`}
                  >
                    <input
                      checked={
                        questionKind === "select_all"
                          ? selectedChoices.includes(option)
                          : choice === option
                      }
                      name="practice-choice"
                      onChange={() => {
                        if (questionKind === "select_all")
                          setSelectedChoices((current) =>
                            current.includes(option)
                              ? current.filter((item) => item !== option)
                              : [...current, option],
                          );
                        else setChoice(option);
                      }}
                      type={questionKind === "select_all" ? "checkbox" : "radio"}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {!isChoice && card.session.mode !== "pronunciation" && (
              <form
                className="practice-answer-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <label htmlFor="practice-answer">Your answer</label>
                <Input
                  autoComplete="off"
                  autoFocus
                  id="practice-answer"
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder="Type what you remember"
                  value={response}
                />
                {hintUsed && (
                  <p className="practice-hint" role="status">
                    Hint: {hint}
                  </p>
                )}
              </form>
            )}
          </article>
        )}

        {(card.session.mode === "learn" || card.session.mode === "write") && (
          <details className="practice-selection-reason">
            <summary>Why this question?</summary>
            <p>{card.selectionReason}</p>
          </details>
        )}

        {!result && !paused && (
          <div className="practice-primary-actions">
            {isFlip ? (
              revealed ? (
                <>
                  <Button
                    disabled={pending}
                    onClick={() => void submit("still_learning", "incorrect")}
                    variant="secondary"
                  >
                    Still learning <kbd>1</kbd>
                  </Button>
                  <Button disabled={pending} onClick={() => void submit("know", "correct")}>
                    Know it <kbd>2</kbd>
                  </Button>
                </>
              ) : (
                <Button disabled={flipPhase !== "prompt"} onClick={reveal}>
                  Show answer <kbd>Space</kbd>
                </Button>
              )
            ) : card.session.mode === "pronunciation" ? (
              <>
                <Button
                  disabled={pending}
                  onClick={() => void submit("pronunciation", "incorrect")}
                  variant="secondary"
                >
                  Needs practice
                </Button>
                <Button disabled={pending} onClick={() => void submit("pronunciation", "correct")}>
                  Sounded right
                </Button>
              </>
            ) : (
              <>
                {card.session.config.hints === "on_request" && !hintUsed && (
                  <Button onClick={() => setHintUsed(true)} variant="ghost">
                    Hint
                  </Button>
                )}
                <Button
                  disabled={pending}
                  onClick={() => void submit("dont_know", "incorrect")}
                  variant="secondary"
                >
                  Don&apos;t know
                </Button>
                <Button
                  disabled={
                    pending ||
                    (isChoice
                      ? questionKind === "select_all"
                        ? selectedChoices.length === 0
                        : !choice
                      : !response.trim())
                  }
                  onClick={() => void submit()}
                >
                  {pending ? "Checking…" : "Check answer"}
                </Button>
              </>
            )}
          </div>
        )}

        {paused && (
          <div
            className="practice-pause-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paused-title"
          >
            <h2 id="paused-title">Session paused</h2>
            <p>Your place is saved on this device and learner profile.</p>
            <Button disabled={pending} onClick={() => void changeSession("resume")}>
              Resume session
            </Button>
          </div>
        )}

        {result && (
          <section
            className={`practice-feedback practice-feedback--${result.grade.verdict}`}
            aria-live="polite"
          >
            <div className="practice-feedback__heading">
              <span aria-hidden="true">
                {result.grade.verdict === "correct"
                  ? "✓"
                  : result.grade.verdict === "partial"
                    ? "◐"
                    : "↺"}
              </span>
              <div>
                <h2>
                  {result.grade.verdict === "correct"
                    ? "Correct"
                    : result.grade.verdict === "partial"
                      ? "Almost there"
                      : "Keep building it"}
                </h2>
                <p>{result.grade.explanation}</p>
              </div>
              <strong>{Math.round(result.grade.correctness * 100)}%</strong>
            </div>
            {!isFlip && (
              <div className="practice-answer-comparison" aria-label="Answer comparison">
                <div>
                  <small>Your answer</small>
                  <del>
                    {(questionKind === "select_all"
                      ? selectedChoices.join(", ")
                      : (choice ?? response)) || "No answer"}
                  </del>
                </div>
                <div>
                  <small>Expected answer</small>
                  <ins>{card.answer}</ins>
                </div>
              </div>
            )}
            {result.grade.overrideAllowed && !overrideSaved && (
              <div className="practice-override-actions">
                <button
                  className="practice-text-action"
                  disabled={pending}
                  onClick={() => void override("learner_correct")}
                  type="button"
                >
                  I was correct
                </button>
                <button
                  className="practice-text-action"
                  disabled={pending}
                  onClick={() => void override("answer_key_issue")}
                  type="button"
                >
                  Report answer-key problem
                </button>
              </div>
            )}
            {overrideSaved && (
              <p className="practice-audit-note">
                {overrideSaved === "answer_key_issue"
                  ? "The answer-key problem was saved as separate audited evidence."
                  : "Your correction was saved as separate audited evidence."}
              </p>
            )}
            {requiresRetype && (
              <label className="practice-retype">
                <span>Retype the correct answer to continue</span>
                <Input onChange={(event) => setRetype(event.target.value)} value={retype} />
              </label>
            )}
            {(card.session.mode === "learn" || card.session.mode === "write") && (
              <>
                <div className="practice-mastery-update">
                  <span>Concept mastery</span>
                  <strong>{masteryPercent}%</strong>
                  <i>
                    <b style={{ width: `${String(masteryPercent)}%` }} />
                  </i>
                </div>
                <div
                  className={`practice-qualification ${result.qualification.eligible ? "is-eligible" : ""}`}
                >
                  <p>{result.qualification.reason}</p>
                  {result.qualification.eligible && !qualificationSaved && (
                    <div>
                      <label>
                        <span>Add to review schedule</span>
                        <select
                          value={selectedRating}
                          onChange={(event) =>
                            setSelectedRating(event.target.value as typeof selectedRating)
                          }
                        >
                          <option value="again">Again</option>
                          <option value="hard">Hard</option>
                          <option value="good">Good</option>
                          <option value="easy">Easy</option>
                        </select>
                      </label>
                      <Button disabled={pending} onClick={() => void qualify()} size="sm">
                        Save review rating
                      </Button>
                    </div>
                  )}
                  {qualificationSaved && <strong>Review schedule updated.</strong>}
                </div>
              </>
            )}
            <div className="practice-feedback__actions">
              <Button disabled={!retypeReady || pending} onClick={() => router.refresh()}>
                Next question →
              </Button>
            </div>
          </section>
        )}
        {error && (
          <p className="form-error practice-session-error" role="alert">
            {error}
          </p>
        )}
        {timeUp && !result && (
          <p className="form-error practice-session-error" role="status">
            Time is up. Submit or mark this item as still learning.
          </p>
        )}
      </section>
      {!seriousMode && !reducedMotion && masteryPercent >= 70 && (
        <span aria-hidden="true" className="practice-milestone-glow" />
      )}
    </main>
  );
}
