"use client";

import {
  createEmptySchedule,
  nextStudyDayBoundary,
  previewRatings,
  type ReviewRating,
} from "@lumen/srs";
import {
  Button,
  ConnectionStatus,
  Dialog,
  Dropdown,
  LinkButton,
  RatingButton,
  RatingGroup,
  StudyProgress,
} from "@lumen/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";

import { StudyCardRenderer } from "@/components/content/study-card-renderer.client";
import type { ReviewCardView, StudySessionSummary } from "@/lib/study/models";

const ratingMeta = [
  { key: "again", label: "Again", shortcut: "1" },
  { key: "hard", label: "Hard", shortcut: "2" },
  { key: "good", label: "Good", shortcut: "3" },
  { key: "easy", label: "Easy", shortcut: "4" },
] as const;

const autoplayAudioKey = "lumen.study.autoplayAudio";
const autoplayAudioEvent = "lumen:study-autoplay-audio";
const unrevealedPreviewDate = new Date(0);

export function StudySessionCompletion({
  summary,
  todayRemaining,
}: {
  readonly summary: StudySessionSummary | null;
  readonly todayRemaining: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minutes = summary?.durationMs ? Math.max(1, Math.round(summary.durationMs / 60_000)) : 0;
  const unavailable = !summary || summary.completed < summary.total;

  async function undoLastReview() {
    if (!summary?.lastReviewId || submitting) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/study/reviews/undo", {
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        reviewLogId: summary.lastReviewId,
        undoEventId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        readonly error?: { readonly message?: string };
      };
      setError(payload.error?.message ?? "The last review could not be undone.");
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <section aria-labelledby="complete-heading" className="study-complete">
      <span aria-hidden="true" className="study-complete__mark">
        {unavailable ? "!" : "✓"}
      </span>
      <p className="eyebrow">{unavailable ? "Session unavailable" : "Session complete"}</p>
      <h1 id="complete-heading">
        {unavailable ? "This session can’t continue." : "That’s the queue."}
      </h1>
      <p>
        {unavailable
          ? "A card was removed or deck access changed. Reviews already submitted are still safe."
          : summary.rescheduling === false
            ? "You finished a practice session. Long-term scheduling was not changed."
            : "Your ratings are saved and the next review dates are ready."}
      </p>
      {summary && !unavailable && (
        <dl className="study-complete__summary">
          <div>
            <dt>Cards</dt>
            <dd>{summary.completed || summary.total}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{minutes} min</dd>
          </div>
          <div>
            <dt>Again</dt>
            <dd>{summary.ratings.again}</dd>
          </div>
          <div>
            <dt>Hard</dt>
            <dd>{summary.ratings.hard}</dd>
          </div>
          <div>
            <dt>Good</dt>
            <dd>{summary.ratings.good}</dd>
          </div>
          <div>
            <dt>Easy</dt>
            <dd>{summary.ratings.easy}</dd>
          </div>
          <div>
            <dt>Today remaining</dt>
            <dd>{todayRemaining}</dd>
          </div>
        </dl>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="study-complete__actions">
        <LinkButton href="/app/study">Return to Study</LinkButton>
        {!unavailable && summary?.lastReviewId && (
          <Button loading={submitting} onClick={() => void undoLastReview()} variant="secondary">
            Undo last review
          </Button>
        )}
        {!unavailable && summary?.deckId && (
          <LinkButton href={`/app/study?deck=${summary.deckId}`} variant="secondary">
            Study more
          </LinkButton>
        )}
        <LinkButton href="/app/stats" variant="secondary">
          View statistics
        </LinkButton>
      </div>
    </section>
  );
}

function subscribeToOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function subscribeToAutoplayAudio(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(autoplayAudioEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(autoplayAudioEvent, onStoreChange);
  };
}

function readAutoplayAudio() {
  return window.localStorage.getItem(autoplayAudioKey) === "true";
}

interface PendingCommand {
  readonly durationMs: number;
  readonly idempotencyKey: string;
  readonly rating: ReviewRating;
  readonly reviewId: string;
  readonly reviewedAt: string;
}

type CanonicalSource = "cram" | "deck" | "filtered" | "folder" | "review_ahead" | "today";

function normalizedSource(value: string): CanonicalSource {
  return ["cram", "deck", "filtered", "folder", "review_ahead", "today"].includes(value)
    ? (value as CanonicalSource)
    : "today";
}

function isInteractiveReviewTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'a,button,input,label,select,textarea,audio,video,canvas,summary,[contenteditable="true"],[role="button"],[role="slider"],[role="radio"],[role="checkbox"]',
    ) !== null
  );
}

export function ReviewSession({
  card,
  reducedMotion,
  seriousMode,
}: {
  readonly card: ReviewCardView;
  readonly reducedMotion: boolean;
  readonly seriousMode: boolean;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [flipPhase, setFlipPhase] = useState<"answer" | "prompt" | "turning">("prompt");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Prompt ready. Press Space to reveal the answer.",
  );
  const [timerVisible, setTimerVisible] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [swipeEnabled, setSwipeEnabled] = useState(false);
  const [swipeSelection, setSwipeSelection] = useState<ReviewRating | null>(null);
  const [previewedAt, setPreviewedAt] = useState<Date | null>(null);
  const [manualDue, setManualDue] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [dueOrder, setDueOrder] = useState(1);
  const [confirmation, setConfirmation] = useState<"forget" | "rebuild" | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState<"due" | "order" | "reschedule" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<
    "accessibility" | "incorrect" | "other" | "outdated" | "unclear" | "unsafe"
  >("incorrect");
  const [reportDetails, setReportDetails] = useState("");
  const startedAt = useRef<number | null>(null);
  const pendingCommand = useRef<PendingCommand | null>(null);
  const submittingRef = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const revealTimer = useRef<number | null>(null);

  const online = useSyncExternalStore(
    subscribeToOnlineStatus,
    () => navigator.onLine,
    () => true,
  );
  const autoplayAudio = useSyncExternalStore(
    subscribeToAutoplayAudio,
    readAutoplayAudio,
    () => false,
  );
  const previewDate = previewedAt ?? unrevealedPreviewDate;
  const schedule = useMemo(
    () => card.schedule ?? createEmptySchedule(card.preset, previewDate),
    [card.preset, card.schedule, previewDate],
  );
  const previews = useMemo(
    () => (previewedAt ? previewRatings(schedule, card.preset, previewedAt) : null),
    [card.preset, previewedAt, schedule],
  );
  const scheduleStateLabel =
    schedule.state === "new"
      ? "New"
      : schedule.state === "relearning"
        ? "Relearning"
        : schedule.state === "learning"
          ? "Learning"
          : "Review";

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!timerVisible) return;
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [timerVisible]);

  const reveal = useCallback(() => {
    if (revealed || flipPhase !== "prompt") return;
    const finishReveal = () => {
      revealTimer.current = null;
      setPreviewedAt(new Date());
      setRevealed(true);
      setFlipPhase("answer");
      setAnnouncement("Answer revealed. Choose Again, Hard, Good, or Easy.");
    };
    if (reducedMotion || seriousMode) {
      finishReveal();
      return;
    }
    setFlipPhase("turning");
    setAnnouncement("Revealing answer.");
    revealTimer.current = window.setTimeout(finishReveal, 230);
  }, [flipPhase, reducedMotion, revealed, seriousMode]);

  const grade = useCallback(
    async (rating: ReviewRating) => {
      if (!revealed || submittingRef.current || !online) return;
      const existing = pendingCommand.current;
      const command =
        existing?.rating === rating
          ? existing
          : {
              durationMs: Math.min(
                86_400_000,
                Math.max(0, Date.now() - (startedAt.current ?? Date.now())),
              ),
              idempotencyKey: crypto.randomUUID(),
              rating,
              reviewId: crypto.randomUUID(),
              reviewedAt: new Date().toISOString(),
            };
      pendingCommand.current = command;
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);
      setAnnouncement(`Saving ${rating}…`);
      try {
        const response = await fetch("/api/study/reviews", {
          body: JSON.stringify({
            cardId: card.cardId,
            currentScheduleVersion: card.scheduleVersion,
            durationMs: command.durationMs,
            idempotencyKey: command.idempotencyKey,
            rating,
            reviewId: command.reviewId,
            reviewedAt: command.reviewedAt,
            source: normalizedSource(card.session.source),
            studyDayStart: card.session.studyDayStart,
            studySessionId: card.session.id,
            timezone: card.session.timezone,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          readonly error?: { readonly message?: string };
        };
        if (!response.ok)
          throw new Error(payload.error?.message ?? "The review could not be saved.");
        pendingCommand.current = null;
        setAnnouncement(`${rating} saved. Loading the next card.`);
        router.refresh();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "The review could not be saved.";
        setError(
          /conflict|schedule|version/i.test(message)
            ? "This card changed in another session. Reload before rating it again."
            : message,
        );
        setAnnouncement("The review was not saved. Retry when ready.");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [card, online, revealed, router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("a,button,input,select,textarea,[contenteditable='true'],[role='button']")
      )
        return;
      if ((event.key === " " || event.key === "Enter") && !revealed) {
        event.preventDefault();
        reveal();
        return;
      }
      if (revealed) {
        const match = ratingMeta.find((rating) => rating.shortcut === event.key);
        if (match) {
          event.preventDefault();
          void grade(match.key);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [grade, reveal, revealed]);

  async function undo() {
    if (!card.lastReviewId || submitting) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/study/reviews/undo", {
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        reviewLogId: card.lastReviewId,
        undoEventId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        readonly error?: { readonly message?: string };
      };
      setError(payload.error?.message ?? "The review could not be undone.");
    } else {
      setAnnouncement("Last review undone.");
      router.refresh();
    }
    setSubmitting(false);
  }

  async function control(
    operation: "bury" | "due_order" | "manual_due" | "mark_leech" | "star" | "suspend" | "unstar",
    overrideValue: Readonly<Record<string, unknown>> = {},
  ) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const value =
      operation === "bury"
        ? {
            until: nextStudyDayBoundary(new Date(), {
              studyDayStartMinutes: card.session.studyDayStart,
              timezone: card.session.timezone,
            }).toISOString(),
          }
        : overrideValue;
    const response = await fetch("/api/study/schedules/control", {
      body: JSON.stringify({
        cardId: card.cardId,
        effectiveAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
        operation,
        operationEventId: crypto.randomUUID(),
        studySessionId: card.session.id,
        value,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("That schedule control could not be applied.");
    else {
      setAdvancedOpen(null);
      router.refresh();
    }
    setSubmitting(false);
  }

  async function burySiblings() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/study/schedules/bury-siblings", {
      body: JSON.stringify({
        buriedUntil: nextStudyDayBoundary(new Date(), {
          studyDayStartMinutes: card.session.studyDayStart,
          timezone: card.session.timezone,
        }).toISOString(),
        cardId: card.cardId,
        idempotencyKey: crypto.randomUUID(),
        operationEventId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("This note has no active sibling cards to bury.");
    else {
      setAnnouncement("Sibling cards buried until the next study day.");
      router.refresh();
    }
    setSubmitting(false);
  }

  async function contentDecision(choice: "preserve" | "relearn" | "reset") {
    if (!card.contentMismatch || submitting) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/study/schedules/content-decision", {
      body: JSON.stringify({
        cardId: card.cardId,
        choice,
        expectedScheduleVersion: card.scheduleVersion,
        idempotencyKey: crypto.randomUUID(),
        operationEventId: crypto.randomUUID(),
        studySessionId: card.session.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("The content-change decision could not be saved. Reload and retry.");
    else {
      setAnnouncement(`${choice} schedule decision saved.`);
      router.refresh();
    }
    setSubmitting(false);
  }

  async function replaceSchedule(operation: "forget" | "manual_due" | "rebuild" | "reschedule") {
    if (submitting || card.scheduleVersion === 0) return;
    let due: string | undefined;
    if (operation === "manual_due") {
      const parsed = new Date(manualDue);
      if (!manualDue || Number.isNaN(parsed.valueOf())) {
        setError("Choose a valid due date and time.");
        return;
      }
      due = parsed.toISOString();
    }
    if (operation === "reschedule" && (!rangeStart || !rangeEnd || rangeStart > rangeEnd)) {
      setError("Choose a valid reschedule range.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/study/schedules/replace", {
      body: JSON.stringify({
        cardId: card.cardId,
        ...(due ? { due } : {}),
        expectedScheduleVersion: card.scheduleVersion,
        idempotencyKey: crypto.randomUUID(),
        operation,
        operationEventId: crypto.randomUUID(),
        ...(operation === "reschedule" ? { rangeEnd, rangeStart } : {}),
        studySessionId: card.session.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("The schedule changed or the operation could not be applied.");
    else {
      setConfirmation(null);
      setAdvancedOpen(null);
      setAnnouncement(`${operation.replace("_", " ")} completed and audited.`);
      router.refresh();
    }
    setSubmitting(false);
  }

  function setDueDate() {
    const parsed = new Date(manualDue);
    if (!manualDue || Number.isNaN(parsed.valueOf())) {
      setError("Choose a valid due date and time.");
      return;
    }
    void control("manual_due", { due: parsed.toISOString() });
  }

  async function reportContent() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/study/reports", {
      body: JSON.stringify({
        cardId: card.cardId,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
        idempotencyKey: crypto.randomUUID(),
        reason: reportReason,
        reportId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("The content report could not be saved.");
    else {
      setReportOpen(false);
      setReportDetails("");
      setAnnouncement("Content report saved privately for follow-up.");
    }
    setSubmitting(false);
  }

  async function sessionControl(action: "pause" | "preview_next") {
    if (submitting) return;
    setSubmitting(true);
    const response = await fetch(`/api/study/sessions/${card.session.id}/control`, {
      body: JSON.stringify({
        action,
        ...(action === "preview_next" ? { cardId: card.cardId } : {}),
        eventId: crypto.randomUUID(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setError(
        action === "pause" ? "The session could not be paused." : "The preview could not advance.",
      );
      setSubmitting(false);
      return;
    }
    if (action === "pause") router.push("/app/study" as Route);
    else router.refresh();
    setSubmitting(false);
  }

  function completeSwipe(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!swipeEnabled || !start || !revealed) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return;
    const rating: ReviewRating =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "good" : "again") : dy < 0 ? "easy" : "hard";
    setSwipeSelection(rating);
    setAnnouncement(`${rating} selected by swipe. Confirm to save; no grade has been submitted.`);
  }

  return (
    <div
      className={[
        "review-session",
        seriousMode ? "review-session--serious" : "",
        reducedMotion ? "review-session--reduced-motion" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="review-session__topbar">
        <div className="review-session__identity">
          <Dropdown
            align="start"
            items={[
              {
                label: "Study dashboard",
                onSelect: () => router.push("/app/study" as Route),
              },
              {
                label: "Open this deck",
                onSelect: () => router.push(`/app/decks/${card.deckId}` as Route),
              },
              {
                label: "Statistics",
                onSelect: () => router.push("/app/stats" as Route),
              },
              {
                label: "Scheduling settings",
                onSelect: () => router.push("/app/settings/scheduling" as Route),
              },
            ]}
            label="Open study navigation"
            trigger={
              <Button size="sm" variant="ghost">
                Menu
              </Button>
            }
          />
          <div>
            <strong>{card.deckTitle}</strong>
            <span>{scheduleStateLabel} card</span>
          </div>
        </div>
        <StudyProgress
          className="review-session__progress"
          current={card.session.completed}
          total={card.session.total}
        />
        <div className="review-session__top-actions">
          <ConnectionStatus online={online} />
          {timerVisible && (
            <span aria-label={`Elapsed time: ${elapsedSeconds} seconds`} className="review-timer">
              {elapsedSeconds}s
            </span>
          )}
          <Button
            disabled={submitting}
            onClick={() => void sessionControl("pause")}
            size="sm"
            variant="secondary"
          >
            Pause
          </Button>
          <a className="review-session__exit" href="/app/study">
            Exit
          </a>
        </div>
      </header>

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      <div className="review-session__body">
        {card.contentMismatch && (
          <section aria-label="Content change decision" className="review-warning">
            <div>
              <strong>This card changed since it was scheduled</strong>
              <p>
                Relearn is recommended when the meaning or answer changed. Your review history is
                preserved whichever option you choose.
              </p>
            </div>
            <div className="review-warning__actions">
              <Button
                disabled={submitting}
                onClick={() => void contentDecision("relearn")}
                size="sm"
              >
                Relearn (recommended)
              </Button>
              <Button
                disabled={submitting}
                onClick={() => void contentDecision("preserve")}
                size="sm"
                variant="secondary"
              >
                Keep schedule
              </Button>
              <Button
                disabled={submitting}
                onClick={() => void contentDecision("reset")}
                size="sm"
                variant="danger"
              >
                Start over
              </Button>
              <a href="/app/settings/scheduling">Learn how scheduling works</a>
            </div>
          </section>
        )}

        {!card.session.rescheduling && (
          <div className="review-preview-notice" role="status">
            <strong>Preview mode</strong>
            <span>Ratings are off and long-term scheduling will not change.</span>
          </div>
        )}

        <div
          aria-label={`${revealed ? "Answer" : "Prompt"}, card ${card.position + 1} of ${card.session.total}`}
          className="review-card-scene"
          data-revealed={revealed}
          onClick={(event) => {
            if (!revealed && !isInteractiveReviewTarget(event.target)) reveal();
          }}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          onPointerDown={(event) => {
            if (isInteractiveReviewTarget(event.target)) return;
            pointerStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={completeSwipe}
          role="group"
        >
          <div className="review-card-flipper" data-flip-phase={flipPhase} data-flipped={revealed}>
            <article className={`review-card review-card--${revealed ? "answer" : "prompt"}`}>
              <span className="review-card__side">{revealed ? "Answer" : "Prompt"}</span>
              <div className="review-card__content">
                <StudyCardRenderer
                  autoplayAudio={autoplayAudio}
                  key={card.cardId}
                  renderer={card.renderer}
                  revealed={revealed}
                />
              </div>
            </article>
          </div>
        </div>

        <section aria-label="Review controls" className="review-controls">
          {!revealed ? (
            <Button
              autoFocus
              className="review-show-answer"
              disabled={flipPhase !== "prompt"}
              onClick={reveal}
              size="lg"
            >
              Show answer <kbd>Space</kbd>
            </Button>
          ) : card.session.rescheduling ? (
            <RatingGroup>
              {ratingMeta.map((rating) => (
                <RatingButton
                  disabled={submitting || !online}
                  interval={previews?.[rating.key].intervalLabel ?? "Previewing…"}
                  key={rating.key}
                  label={rating.label}
                  onClick={() => void grade(rating.key)}
                  rating={rating.key}
                  shortcut={rating.shortcut}
                />
              ))}
            </RatingGroup>
          ) : (
            <Button disabled={submitting} onClick={() => void sessionControl("preview_next")}>
              Next preview
            </Button>
          )}

          {!online && (
            <div className="review-connection-message" role="status">
              Your card stays here while offline. Reconnect to submit the same rating safely.
            </div>
          )}
          {swipeSelection && (
            <div className="swipe-confirm" role="status">
              <span>{swipeSelection} selected. Swipe never grades automatically.</span>
              <Button disabled={submitting} onClick={() => void grade(swipeSelection)} size="sm">
                Confirm {swipeSelection}
              </Button>
              <Button onClick={() => setSwipeSelection(null)} size="sm" variant="ghost">
                Cancel
              </Button>
            </div>
          )}
          {error && (
            <div className="form-message form-message--error review-error" role="alert">
              <span>{error}</span>
              {/another session/i.test(error) && (
                <Button onClick={() => router.refresh()} size="sm" variant="secondary">
                  Reload card
                </Button>
              )}
            </div>
          )}
        </section>

        <footer className="review-toolbar" aria-label="Card actions">
          <div className="review-toolbar__primary">
            <Button
              disabled={submitting}
              onClick={() => void control(card.starred ? "unstar" : "star")}
              size="sm"
              variant="ghost"
            >
              {card.starred ? "Unstar" : "Star"}
            </Button>
            {card.lastReviewId && (
              <Button disabled={submitting} onClick={() => void undo()} size="sm" variant="ghost">
                Undo last
              </Button>
            )}
            <a href={`/app/decks/${card.deckId}/edit?note=${card.noteId}`}>Edit card</a>
          </div>
          <Dropdown
            items={[
              { type: "label", label: "Card actions" },
              {
                label: "Bury until tomorrow",
                disabled: submitting,
                onSelect: () => void control("bury"),
              },
              {
                label: "Bury related cards",
                disabled: submitting,
                onSelect: () => void burySiblings(),
              },
              {
                label: "Suspend card",
                disabled: submitting,
                onSelect: () => void control("suspend"),
              },
              {
                label: "Mark as difficult",
                disabled: submitting,
                onSelect: () => void control("mark_leech"),
              },
              { type: "separator" },
              { type: "label", label: "Scheduling" },
              {
                label: "Set due date…",
                disabled: submitting,
                onSelect: () => setAdvancedOpen("due"),
              },
              {
                label: "Reschedule in a range…",
                disabled: submitting || card.scheduleVersion === 0,
                onSelect: () => setAdvancedOpen("reschedule"),
              },
              ...(schedule.state === "new"
                ? [
                    {
                      label: "Set new-card order…",
                      disabled: submitting,
                      onSelect: () => setAdvancedOpen("order"),
                    },
                  ]
                : []),
              {
                label: "Reset to New…",
                disabled: submitting || card.scheduleVersion === 0,
                onSelect: () => setConfirmation("forget"),
                destructive: true,
              },
              {
                label: "Rebuild from history…",
                disabled: submitting || card.scheduleVersion === 0,
                onSelect: () => setConfirmation("rebuild"),
              },
              { type: "separator" },
              {
                type: "checkbox",
                checked: timerVisible,
                label: "Show timer",
                onCheckedChange: setTimerVisible,
              },
              {
                type: "checkbox",
                checked: swipeEnabled,
                label: "Swipe selection",
                onCheckedChange: setSwipeEnabled,
              },
              {
                type: "checkbox",
                checked: autoplayAudio,
                label: "Autoplay card audio",
                onCheckedChange: (enabled) => {
                  window.localStorage.setItem(autoplayAudioKey, String(enabled));
                  window.dispatchEvent(new Event(autoplayAudioEvent));
                },
              },
              { type: "separator" },
              { label: "Report content…", onSelect: () => setReportOpen(true) },
            ]}
            label="More card and study options"
            trigger={
              <Button size="sm" variant="secondary">
                More
              </Button>
            }
          />
        </footer>
      </div>

      <Dialog
        description="This changes the card’s scheduling state and creates a private audit event. Review history is not rewritten."
        onOpenChange={(open) => !open && setAdvancedOpen(null)}
        open={advancedOpen !== null}
        title={
          advancedOpen === "due"
            ? "Set due date"
            : advancedOpen === "order"
              ? "Set new-card order"
              : "Reschedule card"
        }
      >
        {advancedOpen === "due" && (
          <div className="review-dialog-form">
            <label>
              Due date and time
              <input
                onChange={(event) => setManualDue(event.target.value)}
                type="datetime-local"
                value={manualDue}
              />
            </label>
            <Button disabled={submitting || !manualDue} onClick={setDueDate}>
              Set due date
            </Button>
          </div>
        )}
        {advancedOpen === "reschedule" && (
          <div className="review-dialog-form">
            <label>
              Earliest date
              <input
                onChange={(event) => setRangeStart(event.target.value)}
                type="date"
                value={rangeStart}
              />
            </label>
            <label>
              Latest date
              <input
                onChange={(event) => setRangeEnd(event.target.value)}
                type="date"
                value={rangeEnd}
              />
            </label>
            <Button
              disabled={submitting || !rangeStart || !rangeEnd || rangeStart > rangeEnd}
              onClick={() => void replaceSchedule("reschedule")}
            >
              Reschedule card
            </Button>
          </div>
        )}
        {advancedOpen === "order" && (
          <div className="review-dialog-form">
            <label>
              New-card position
              <input
                min="0"
                onChange={(event) => setDueOrder(event.target.valueAsNumber)}
                type="number"
                value={dueOrder}
              />
            </label>
            <Button
              disabled={submitting || !Number.isInteger(dueOrder) || dueOrder < 0}
              onClick={() => void control("due_order", { order: dueOrder })}
            >
              Save position
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog
        description={
          confirmation === "forget"
            ? "The card returns to New. Existing review history remains available for audit and statistics."
            : "The schedule is recalculated from non-undone review history."
        }
        footer={
          <>
            <Button onClick={() => setConfirmation(null)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={submitting || card.scheduleVersion === 0}
              onClick={() => confirmation && void replaceSchedule(confirmation)}
              variant="danger"
            >
              {confirmation === "forget" ? "Reset card" : "Rebuild schedule"}
            </Button>
          </>
        }
        onOpenChange={(open) => !open && setConfirmation(null)}
        open={confirmation !== null}
        title={confirmation === "forget" ? "Reset this card to New?" : "Rebuild this schedule?"}
      >
        <p className="review-dialog-note">
          This operation is recorded and cannot be hidden from the audit trail.
        </p>
      </Dialog>

      <Dialog
        description="Reports are private and do not identify you to other learners."
        onOpenChange={setReportOpen}
        open={reportOpen}
        title="Report card content"
      >
        <div className="review-dialog-form">
          <label>
            Reason
            <select
              onChange={(event) => setReportReason(event.target.value as typeof reportReason)}
              value={reportReason}
            >
              <option value="incorrect">Incorrect answer</option>
              <option value="outdated">Outdated</option>
              <option value="unclear">Unclear</option>
              <option value="unsafe">Unsafe or inappropriate</option>
              <option value="accessibility">Accessibility issue</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Details (optional)
            <textarea
              maxLength={1000}
              onChange={(event) => setReportDetails(event.target.value)}
              value={reportDetails}
            />
          </label>
          <Button disabled={submitting} onClick={() => void reportContent()}>
            Submit private report
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
