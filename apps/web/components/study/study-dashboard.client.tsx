"use client";

import { Button } from "@lumen/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StudyDashboardSnapshot } from "@/lib/study/models";

interface ApiErrorBody {
  readonly error?: { readonly message?: string };
}

export function StudyDashboard({
  learnerName,
  snapshot,
}: {
  readonly learnerName: string;
  readonly snapshot: StudyDashboardSnapshot;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDeckIds, setCustomDeckIds] = useState<readonly string[]>([]);
  const [customFolderId, setCustomFolderId] = useState(snapshot.folders[0]?.id ?? "");
  const [customTag, setCustomTag] = useState(snapshot.tags[0] ?? "");
  const [customState, setCustomState] = useState<"learning" | "new" | "relearning" | "review">(
    "review",
  );
  const [intervalMin, setIntervalMin] = useState(1);
  const [intervalMax, setIntervalMax] = useState(30);
  const [customRescheduling, setCustomRescheduling] = useState(false);
  const [savedFilterName, setSavedFilterName] = useState("");
  const [savedFilterMode, setSavedFilterMode] = useState<
    | "card_state"
    | "cram"
    | "due_only"
    | "folder"
    | "forgotten_today"
    | "interval_range"
    | "leeches"
    | "new_only"
    | "review_ahead"
    | "starred"
    | "tag_query"
  >("due_only");
  const [savedReviewOrder, setSavedReviewOrder] = useState<
    "due" | "random" | "relative_overdueness" | "retrievability"
  >("due");
  const [status, setStatus] = useState<string | null>(null);

  async function start(input: {
    deckId?: string;
    deckIds?: readonly string[];
    filterId?: string;
    intervalRangeDays?: { readonly max: number; readonly min: number };
    mode?:
      | "card_state"
      | "cram"
      | "due_only"
      | "folder"
      | "forgotten_today"
      | "interval_range"
      | "leeches"
      | "new_only"
      | "review_ahead"
      | "starred"
      | "tag_query";
    rescheduling?: boolean;
    reviewOrder?: "due" | "random" | "relative_overdueness" | "retrievability";
    stateFilter?: readonly ("learning" | "new" | "relearning" | "review")[];
    tagQuery?: readonly string[];
  }) {
    const sessionId = crypto.randomUUID();
    setPending(input.filterId ?? input.deckId ?? input.mode ?? "today");
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/study/sessions", {
        body: JSON.stringify({
          ...(input.deckId ? { deckId: input.deckId } : {}),
          ...(input.deckIds ? { deckIds: input.deckIds } : {}),
          ...(input.filterId ? { filterId: input.filterId } : {}),
          ...(input.intervalRangeDays ? { intervalRangeDays: input.intervalRangeDays } : {}),
          mode: input.mode ?? "today",
          rescheduling: input.rescheduling ?? true,
          ...(input.reviewOrder ? { reviewOrder: input.reviewOrder } : {}),
          sessionId,
          ...(input.stateFilter ? { stateFilter: input.stateFilter } : {}),
          ...(input.tagQuery ? { tagQuery: input.tagQuery } : {}),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
      if (!response.ok)
        throw new Error(payload.error?.message ?? "The session could not be started.");
      router.push(`/app/study/session/${sessionId}` as Route);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The session could not be started.");
      setPending(null);
    }
  }

  async function resume(sessionId: string) {
    setPending("resume");
    const response = await fetch(`/api/study/sessions/${sessionId}/control`, {
      body: JSON.stringify({ action: "resume", eventId: crypto.randomUUID() }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (response.ok || response.status === 409)
      router.push(`/app/study/session/${sessionId}` as Route);
    else {
      setError("The paused session could not be resumed.");
      setPending(null);
    }
  }

  async function saveStudyFilter() {
    const name = savedFilterName.trim();
    if (!name || pending) return;
    let deckIds = customDeckIds.length ? [...customDeckIds] : undefined;
    if (savedFilterMode === "folder") {
      const folder = snapshot.folders.find((candidate) => candidate.id === customFolderId);
      deckIds = folder ? [...folder.deckIds] : undefined;
      if (!deckIds?.length) {
        setError("Choose a folder before saving this filter.");
        return;
      }
    }
    if (savedFilterMode === "tag_query" && !customTag) {
      setError("Choose a tag before saving this filter.");
      return;
    }
    setPending("save-filter");
    setError(null);
    setStatus(null);
    const response = await fetch("/api/study/filters", {
      body: JSON.stringify({
        definition: {
          ...(deckIds?.length ? { deckIds } : {}),
          ...(savedFilterMode === "interval_range"
            ? { intervalRangeDays: { max: intervalMax, min: intervalMin } }
            : {}),
          mode: savedFilterMode,
          rescheduling: customRescheduling,
          ...(savedFilterMode === "due_only" ? { reviewOrder: savedReviewOrder } : {}),
          ...(savedFilterMode === "card_state" ? { stateFilter: [customState] } : {}),
          ...(savedFilterMode === "tag_query" ? { tagQuery: [customTag] } : {}),
        },
        expectedVersion: 0,
        filterId: crypto.randomUUID(),
        name,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("The saved filter could not be created.");
    else {
      setSavedFilterName("");
      setStatus("Study filter saved.");
      router.refresh();
    }
    setPending(null);
  }

  async function deleteStudyFilter(filterId: string, expectedVersion: number) {
    if (pending) return;
    setPending(filterId);
    setError(null);
    const response = await fetch("/api/study/filters", {
      body: JSON.stringify({ expectedVersion, filterId }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });
    if (!response.ok) setError("The saved filter could not be deleted.");
    else {
      setStatus("Study filter deleted.");
      router.refresh();
    }
    setPending(null);
  }

  const available = snapshot.due + snapshot.learning + snapshot.new;
  return (
    <div className="study-dashboard">
      <header className="study-page-header">
        <div>
          <p className="eyebrow">Study</p>
          <h1>Ready when you are, {learnerName}</h1>
          <p>Work through what is due, then introduce new cards at your daily pace.</p>
        </div>
        <div className="study-header-actions">
          <a className="button button--secondary" href="/app/stats">
            View statistics
          </a>
          <a className="button button--secondary" href="/app/settings/scheduling">
            Scheduling
          </a>
        </div>
      </header>

      {snapshot.resumableSession && (
        <section className="study-resume" aria-labelledby="resume-heading">
          <div>
            <h2 id="resume-heading">Continue where you left off</h2>
            <p>
              {snapshot.resumableSession.completed} of {snapshot.resumableSession.total} cards
              completed.
            </p>
          </div>
          <Button
            disabled={pending !== null}
            onClick={() => void resume(snapshot.resumableSession?.id ?? "")}
          >
            Resume session
          </Button>
        </section>
      )}

      {snapshot.recentSession && !snapshot.resumableSession && (
        <p className="study-recent-session" role="status">
          Recently completed {snapshot.recentSession.completed} card
          {snapshot.recentSession.completed === 1 ? "" : "s"} ·{" "}
          <time dateTime={snapshot.recentSession.completedAt}>
            {new Date(snapshot.recentSession.completedAt).toLocaleString()}
          </time>
        </p>
      )}

      <section className="study-today-card" aria-labelledby="today-heading">
        <div className="study-today-card__lead">
          <div>
            <p className="eyebrow">Today</p>
            <h2 id="today-heading">
              {available > 0 ? `${available} cards available` : "You’re caught up"}
            </h2>
          </div>
          <Button disabled={available === 0 || pending !== null} onClick={() => void start({})}>
            {pending === "today" ? "Starting…" : "Study all decks"}
          </Button>
        </div>
        <dl className="study-counts" aria-label="Today’s study counts">
          <div>
            <dt>Learning</dt>
            <dd>{snapshot.learning}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{snapshot.due}</dd>
          </div>
          <div>
            <dt>New</dt>
            <dd>{snapshot.new}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{snapshot.completedToday}</dd>
          </div>
        </dl>
        {available === 0 && (
          <p className="study-empty-hint">
            Add cards in Library, choose a review-ahead session, or adjust daily limits in
            Scheduling.
          </p>
        )}
      </section>

      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="form-message form-message--success" role="status">
          {status}
        </p>
      )}

      <section aria-labelledby="decks-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Decks</p>
            <h2 id="decks-heading">Choose a focus</h2>
          </div>
          <span>{snapshot.total} active cards</span>
        </div>
        <div className="study-deck-list">
          {snapshot.decks.map((deck) => {
            const deckAvailable = deck.learning + deck.due + deck.new;
            return (
              <article className="study-deck-row" key={deck.deckId}>
                <div>
                  <h3>
                    <a href={`/app/decks/${deck.deckId}`}>{deck.name}</a>
                  </h3>
                  <p>
                    {deck.total} cards
                    {deck.suspended + deck.buried > 0
                      ? ` · ${deck.suspended + deck.buried} set aside`
                      : ""}
                  </p>
                </div>
                <dl aria-label={`${deck.name} study counts`}>
                  <div>
                    <dt>Learning</dt>
                    <dd>{deck.learning}</dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd>{deck.due}</dd>
                  </div>
                  <div>
                    <dt>New</dt>
                    <dd>{deck.new}</dd>
                  </div>
                </dl>
                <Button
                  disabled={deckAvailable === 0 || pending !== null}
                  onClick={() => void start({ deckId: deck.deckId })}
                  size="sm"
                >
                  {pending === deck.deckId ? "Starting…" : "Study"}
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <details className="study-custom-panel">
        <summary>Custom study</summary>
        <p>Create a temporary queue. Preview-only sessions never change long-term scheduling.</p>
        {snapshot.savedFilters.length > 0 && (
          <section className="study-saved-filters" aria-labelledby="saved-filters-heading">
            <h3 id="saved-filters-heading">Saved filters</h3>
            <div className="study-custom-actions">
              {snapshot.savedFilters.map((filter) => (
                <div className="study-saved-filter" key={filter.id}>
                  <span>
                    <strong>{filter.name}</strong>
                    <small>{filter.definition.rescheduling ? "Reschedules" : "Preview only"}</small>
                  </span>
                  <Button
                    disabled={pending !== null}
                    onClick={() => void start({ filterId: filter.id })}
                    size="sm"
                    variant="secondary"
                  >
                    Start
                  </Button>
                  <Button
                    disabled={pending !== null}
                    onClick={() => void deleteStudyFilter(filter.id, filter.version)}
                    size="sm"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="study-custom-actions">
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "due_only" })}
            size="sm"
            variant="secondary"
          >
            Due only
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "new_only" })}
            size="sm"
            variant="secondary"
          >
            New only
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "starred", rescheduling: false })}
            size="sm"
            variant="secondary"
          >
            Preview starred
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "review_ahead" })}
            size="sm"
            variant="secondary"
          >
            Review ahead (reschedules)
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "cram", rescheduling: false })}
            size="sm"
            variant="secondary"
          >
            Preview all
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "forgotten_today", rescheduling: false })}
            size="sm"
            variant="secondary"
          >
            Preview forgotten today
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "leeches", rescheduling: false })}
            size="sm"
            variant="secondary"
          >
            Preview leeches
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "due_only", reviewOrder: "relative_overdueness" })}
            size="sm"
            variant="secondary"
          >
            Most overdue (reschedules)
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "due_only", reviewOrder: "random" })}
            size="sm"
            variant="secondary"
          >
            Random due (reschedules)
          </Button>
        </div>
        <div className="study-custom-builder">
          <h3>Build a filtered session</h3>
          <label>
            <input
              checked={customRescheduling}
              onChange={(event) => setCustomRescheduling(event.target.checked)}
              type="checkbox"
            />{" "}
            Apply ratings to canonical scheduling
          </label>
          {!customRescheduling && (
            <p className="field-hint">Preview mode advances without showing rating controls.</p>
          )}
          {snapshot.folders.length > 0 && (
            <div className="study-filter-row">
              <label>
                Folder
                <select
                  onChange={(event) => setCustomFolderId(event.target.value)}
                  value={customFolderId}
                >
                  {snapshot.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name} · {folder.deckIds.length} deck
                      {folder.deckIds.length === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={pending !== null || !customFolderId}
                onClick={() => {
                  const folder = snapshot.folders.find(
                    (candidate) => candidate.id === customFolderId,
                  );
                  if (folder)
                    void start({
                      deckIds: folder.deckIds,
                      mode: "folder",
                      rescheduling: customRescheduling,
                    });
                }}
                size="sm"
                variant="secondary"
              >
                Start folder session
              </Button>
            </div>
          )}
          <fieldset>
            <legend>Multiple decks</legend>
            <div className="preset-deck-choices">
              {snapshot.decks.map((deck) => (
                <label key={deck.deckId}>
                  <input
                    checked={customDeckIds.includes(deck.deckId)}
                    onChange={(event) =>
                      setCustomDeckIds((current) =>
                        event.target.checked
                          ? [...current, deck.deckId]
                          : current.filter((id) => id !== deck.deckId),
                      )
                    }
                    type="checkbox"
                  />{" "}
                  {deck.name}
                </label>
              ))}
            </div>
            <Button
              disabled={pending !== null || customDeckIds.length === 0}
              onClick={() =>
                void start({
                  deckIds: customDeckIds,
                  mode: "folder",
                  rescheduling: customRescheduling,
                })
              }
              size="sm"
              variant="secondary"
            >
              Start multi-deck session
            </Button>
          </fieldset>
          {snapshot.tags.length > 0 && (
            <div className="study-filter-row">
              <label>
                Tag
                <select onChange={(event) => setCustomTag(event.target.value)} value={customTag}>
                  {snapshot.tags.map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <Button
                disabled={pending !== null || !customTag}
                onClick={() =>
                  void start({
                    mode: "tag_query",
                    rescheduling: customRescheduling,
                    tagQuery: [customTag],
                  })
                }
                size="sm"
                variant="secondary"
              >
                Study tag
              </Button>
            </div>
          )}
          <div className="study-filter-row">
            <label>
              Minimum interval (days)
              <input
                min="0"
                onChange={(event) => setIntervalMin(event.target.valueAsNumber)}
                type="number"
                value={intervalMin}
              />
            </label>
            <label>
              Maximum interval (days)
              <input
                min="0"
                onChange={(event) => setIntervalMax(event.target.valueAsNumber)}
                type="number"
                value={intervalMax}
              />
            </label>
            <Button
              disabled={pending !== null || intervalMin < 0 || intervalMax < intervalMin}
              onClick={() =>
                void start({
                  intervalRangeDays: { max: intervalMax, min: intervalMin },
                  mode: "interval_range",
                  rescheduling: customRescheduling,
                })
              }
              size="sm"
              variant="secondary"
            >
              Study interval range
            </Button>
          </div>
          <div className="study-filter-row">
            <label>
              Card state
              <select
                onChange={(event) => setCustomState(event.target.value as typeof customState)}
                value={customState}
              >
                <option value="new">New</option>
                <option value="learning">Learning</option>
                <option value="review">Review</option>
                <option value="relearning">Relearning</option>
              </select>
            </label>
            <Button
              disabled={pending !== null}
              onClick={() =>
                void start({
                  mode: "card_state",
                  rescheduling: customRescheduling,
                  stateFilter: [customState],
                })
              }
              size="sm"
              variant="secondary"
            >
              Study card state
            </Button>
          </div>
          <fieldset className="study-save-filter">
            <legend>Save this filter for later</legend>
            <p className="field-hint">
              The selected decks above are included when present. Folder, tag, interval, and card
              state filters use the matching choices above.
            </p>
            <label>
              Filter name
              <input
                maxLength={80}
                onChange={(event) => setSavedFilterName(event.target.value)}
                value={savedFilterName}
              />
            </label>
            <label>
              Filter type
              <select
                onChange={(event) =>
                  setSavedFilterMode(event.target.value as typeof savedFilterMode)
                }
                value={savedFilterMode}
              >
                <option value="due_only">Due only</option>
                <option value="new_only">New only</option>
                <option value="forgotten_today">Forgotten today</option>
                <option value="leeches">Leeches</option>
                <option value="starred">Starred</option>
                <option value="review_ahead">Review ahead</option>
                <option value="cram">All active cards</option>
                <option value="folder">Selected folder</option>
                <option value="tag_query">Selected tag</option>
                <option value="interval_range">Selected interval range</option>
                <option value="card_state">Selected card state</option>
              </select>
            </label>
            {savedFilterMode === "due_only" && (
              <label>
                Review order
                <select
                  onChange={(event) =>
                    setSavedReviewOrder(event.target.value as typeof savedReviewOrder)
                  }
                  value={savedReviewOrder}
                >
                  <option value="due">Due first</option>
                  <option value="relative_overdueness">Most overdue</option>
                  <option value="retrievability">Lowest retrievability</option>
                  <option value="random">Deterministic random</option>
                </select>
              </label>
            )}
            <Button
              disabled={
                pending !== null ||
                !savedFilterName.trim() ||
                intervalMin < 0 ||
                intervalMax < intervalMin
              }
              onClick={() => void saveStudyFilter()}
              size="sm"
              variant="secondary"
            >
              Save filter
            </Button>
          </fieldset>
        </div>
      </details>
    </div>
  );
}
