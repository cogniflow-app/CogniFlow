"use client";

import {
  createEmptySchedule,
  nextStudyDayBoundary,
  previewRatings,
  type ReviewRating,
} from "@lumen/srs";
import { Button } from "@lumen/ui";
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
import type { ReviewCardView } from "@/lib/study/models";

const ratingMeta = [
  { key: "again", label: "Again", shortcut: "1" },
  { key: "hard", label: "Hard", shortcut: "2" },
  { key: "good", label: "Good", shortcut: "3" },
  { key: "easy", label: "Easy", shortcut: "4" },
] as const;

const autoplayAudioKey = "lumen.study.autoplayAudio";
const autoplayAudioEvent = "lumen:study-autoplay-audio";
const unrevealedPreviewDate = new Date(0);

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<
    "accessibility" | "incorrect" | "other" | "outdated" | "unclear" | "unsafe"
  >("incorrect");
  const [reportDetails, setReportDetails] = useState("");
  const startedAt = useRef<number | null>(null);
  const pendingCommand = useRef<PendingCommand | null>(null);
  const submittingRef = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

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
  useEffect(() => {
    if (!timerVisible) return;
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [timerVisible]);

  const reveal = useCallback(() => {
    if (revealed) return;
    setPreviewedAt(new Date());
    setRevealed(true);
    setAnnouncement("Answer revealed. Choose Again, Hard, Good, or Easy.");
  }, [revealed]);

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
        setError(caught instanceof Error ? caught.message : "The review could not be saved.");
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
    else router.refresh();
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
    if (!swipeEnabled || !pointerStart.current || !revealed) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    pointerStart.current = null;
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
      <header className="review-session__header">
        <div>
          <a href="/app/study">Study</a>
          <span aria-hidden="true"> / </span>
          <strong>{card.deckTitle}</strong>
        </div>
        <div className="review-session__status">
          <span>
            {card.session.completed + 1} of {card.session.total}
          </span>
          <span>
            {card.session.total - card.session.completed} remaining · {scheduleStateLabel}
          </span>
          <span>{online ? "Online · retry protected" : "Offline · grading paused"}</span>
        </div>
      </header>
      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
      {card.contentMismatch && (
        <section aria-label="Content change decision" className="review-warning">
          <p>
            This card’s meaning or answer changed after it was scheduled. Relearn is the
            conservative default; only Preserve when the edit did not affect your memory.
          </p>
          <div className="review-warning__actions">
            <Button disabled={submitting} onClick={() => void contentDecision("relearn")} size="sm">
              Relearn
            </Button>
            <Button
              disabled={submitting}
              onClick={() => void contentDecision("preserve")}
              size="sm"
              variant="secondary"
            >
              Preserve schedule
            </Button>
            <Button
              disabled={submitting}
              onClick={() => void contentDecision("reset")}
              size="sm"
              variant="danger"
            >
              Reset
            </Button>
          </div>
        </section>
      )}
      {!card.session.rescheduling && (
        <p className="review-preview-notice">
          Preview session — ratings are disabled and long-term scheduling will not change.
        </p>
      )}
      <main
        className={`review-card review-card--${revealed ? "answer" : "prompt"}`}
        onPointerDown={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest(
              "a,button,input,select,textarea,[contenteditable='true'],[role='button']",
            )
          )
            return;
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={completeSwipe}
      >
        <span className="review-card__side">
          {revealed ? "Answer" : "Prompt"} · {scheduleStateLabel}
        </span>
        <div className="review-card__content">
          <StudyCardRenderer
            autoplayAudio={autoplayAudio}
            key={card.cardId}
            renderer={card.renderer}
            revealed={revealed}
          />
        </div>
      </main>
      <section aria-label="Review controls" className="review-controls">
        {!revealed ? (
          <Button autoFocus onClick={reveal} size="lg">
            Show answer <kbd>Space</kbd>
          </Button>
        ) : card.session.rescheduling ? (
          <div className="review-ratings">
            {ratingMeta.map((rating) => (
              <Button
                className={`review-rating review-rating--${rating.key}`}
                disabled={submitting || !online}
                key={rating.key}
                onClick={() => void grade(rating.key)}
                variant="secondary"
              >
                <span>{rating.label}</span>
                <small>{previews?.[rating.key].intervalLabel ?? "Previewing…"}</small>
                <kbd>{rating.shortcut}</kbd>
              </Button>
            ))}
          </div>
        ) : (
          <Button disabled={submitting} onClick={() => void sessionControl("preview_next")}>
            Next preview
          </Button>
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
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        )}
      </section>
      <footer className="review-toolbar">
        <Button onClick={() => setTimerVisible((value) => !value)} size="sm" variant="ghost">
          {timerVisible ? `${elapsedSeconds}s` : "Show timer"}
        </Button>
        <label>
          <input
            checked={swipeEnabled}
            onChange={(event) => setSwipeEnabled(event.target.checked)}
            type="checkbox"
          />{" "}
          Swipe selection
        </label>
        <label>
          <input
            checked={autoplayAudio}
            onChange={(event) => {
              const enabled = event.target.checked;
              window.localStorage.setItem(autoplayAudioKey, String(enabled));
              window.dispatchEvent(new Event(autoplayAudioEvent));
            }}
            type="checkbox"
          />{" "}
          Autoplay card audio
        </label>
        <Button
          disabled={submitting}
          onClick={() => void sessionControl("pause")}
          size="sm"
          variant="ghost"
        >
          Pause
        </Button>
        <a href={`/app/decks/${card.deckId}/edit?note=${card.noteId}`}>Edit card</a>
        <Button
          disabled={submitting}
          onClick={() => void control(card.starred ? "unstar" : "star")}
          size="sm"
          variant="ghost"
        >
          {card.starred ? "Unstar" : "Star"}
        </Button>
        <Button
          disabled={submitting}
          onClick={() => void control("bury")}
          size="sm"
          variant="ghost"
        >
          Bury
        </Button>
        <Button disabled={submitting} onClick={() => void burySiblings()} size="sm" variant="ghost">
          Bury siblings
        </Button>
        <Button
          disabled={submitting}
          onClick={() => void control("suspend")}
          size="sm"
          variant="ghost"
        >
          Suspend
        </Button>
        {card.lastReviewId && (
          <Button disabled={submitting} onClick={() => void undo()} size="sm" variant="ghost">
            Undo last
          </Button>
        )}
      </footer>
      <details className="review-advanced">
        <summary>Advanced schedule controls</summary>
        <p>
          These actions change canonical scheduling and create a private audit event. They do not
          rewrite review history.
        </p>
        <label>
          Manual due date
          <input
            onChange={(event) => setManualDue(event.target.value)}
            type="datetime-local"
            value={manualDue}
          />
        </label>
        <Button
          disabled={submitting || !manualDue}
          onClick={setDueDate}
          size="sm"
          variant="secondary"
        >
          Set due date
        </Button>
        <div className="review-range-control">
          <label>
            Reschedule from
            <input
              onChange={(event) => setRangeStart(event.target.value)}
              type="date"
              value={rangeStart}
            />
          </label>
          <label>
            Through
            <input
              onChange={(event) => setRangeEnd(event.target.value)}
              type="date"
              value={rangeEnd}
            />
          </label>
          <Button
            disabled={
              submitting ||
              card.scheduleVersion === 0 ||
              !rangeStart ||
              !rangeEnd ||
              rangeStart > rangeEnd
            }
            onClick={() => void replaceSchedule("reschedule")}
            size="sm"
            variant="secondary"
          >
            Reschedule in range
          </Button>
        </div>
        {schedule.state === "new" && (
          <div className="review-range-control">
            <label>
              New-card due order
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
              size="sm"
              variant="secondary"
            >
              Set due order
            </Button>
          </div>
        )}
        <Button
          disabled={submitting}
          onClick={() => void control("mark_leech")}
          size="sm"
          variant="ghost"
        >
          Mark as leech
        </Button>
        {confirmation ? (
          <div className="review-confirmation" role="alert">
            <span>
              {confirmation === "forget"
                ? "Reset this card to New? Review history remains intact."
                : "Rebuild this card by replaying its non-undone review history?"}
            </span>
            <Button
              disabled={submitting || card.scheduleVersion === 0}
              onClick={() => void replaceSchedule(confirmation)}
              size="sm"
              variant="danger"
            >
              Confirm {confirmation}
            </Button>
            <Button onClick={() => setConfirmation(null)} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <Button
              disabled={submitting || card.scheduleVersion === 0}
              onClick={() => setConfirmation("forget")}
              size="sm"
              variant="ghost"
            >
              Forget / reset
            </Button>
            <Button
              disabled={submitting || card.scheduleVersion === 0}
              onClick={() => setConfirmation("rebuild")}
              size="sm"
              variant="ghost"
            >
              Rebuild from history
            </Button>
          </div>
        )}
      </details>
      <details
        className="review-report"
        onToggle={(event) => setReportOpen(event.currentTarget.open)}
        open={reportOpen}
      >
        <summary>Report content</summary>
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
        <Button
          disabled={submitting}
          onClick={() => void reportContent()}
          size="sm"
          variant="secondary"
        >
          Submit private report
        </Button>
      </details>
    </div>
  );
}
