"use client";

import { Button, Dialog, Dropdown } from "@lumen/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StudyDashboardSnapshot } from "@/lib/study/models";

type StudyMode =
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
type ReviewOrder = "due" | "random" | "relative_overdueness" | "retrievability";
type CardState = "learning" | "new" | "relearning" | "review";

interface ApiErrorBody {
  readonly error?: { readonly message?: string };
}

interface StartInput {
  readonly deckId?: string;
  readonly deckIds?: readonly string[];
  readonly filterId?: string;
  readonly intervalRangeDays?: { readonly max: number; readonly min: number };
  readonly mode?: StudyMode;
  readonly rescheduling?: boolean;
  readonly reviewOrder?: ReviewOrder;
  readonly stateFilter?: readonly CardState[];
  readonly tagQuery?: readonly string[];
}

const modeLabels: Record<StudyMode, string> = {
  card_state: "One card state",
  cram: "All active cards",
  due_only: "Due cards",
  folder: "Folder queue",
  forgotten_today: "Forgotten today",
  interval_range: "Interval range",
  leeches: "Difficult cards",
  new_only: "New cards",
  review_ahead: "Review ahead",
  starred: "Starred cards",
  tag_query: "Tagged cards",
};

const wizardModes: readonly StudyMode[] = [
  "due_only",
  "new_only",
  "forgotten_today",
  "leeches",
  "starred",
  "review_ahead",
  "cram",
  "interval_range",
  "card_state",
];

export function StudyDashboard({
  initialDeckId,
  learnerName,
  snapshot,
}: {
  readonly initialDeckId?: string | undefined;
  readonly learnerName: string;
  readonly snapshot: StudyDashboardSnapshot;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [customStep, setCustomStep] = useState(1);
  const [customScope, setCustomScope] = useState<"all" | "decks" | "folder" | "tag">("all");
  const [customDeckIds, setCustomDeckIds] = useState<readonly string[]>([]);
  const [customFolderId, setCustomFolderId] = useState(snapshot.folders[0]?.id ?? "");
  const [customTag, setCustomTag] = useState(snapshot.tags[0] ?? "");
  const [customState, setCustomState] = useState<CardState>("review");
  const [intervalMin, setIntervalMin] = useState(1);
  const [intervalMax, setIntervalMax] = useState(30);
  const [customRescheduling, setCustomRescheduling] = useState(false);
  const [savedFilterName, setSavedFilterName] = useState("");
  const [savedFilterMode, setSavedFilterMode] = useState<StudyMode>("due_only");
  const [savedReviewOrder, setSavedReviewOrder] = useState<ReviewOrder>("due");
  const [filterToDelete, setFilterToDelete] = useState<{
    id: string;
    name: string;
    version: number;
  } | null>(null);

  async function start(input: StartInput) {
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

  function selectedFolderDecks(): readonly string[] {
    return snapshot.folders.find((folder) => folder.id === customFolderId)?.deckIds ?? [];
  }

  function customSelection(): StartInput {
    const deckIds =
      customScope === "decks"
        ? customDeckIds
        : customScope === "folder"
          ? selectedFolderDecks()
          : undefined;
    return {
      ...(deckIds?.length ? { deckIds } : {}),
      ...(savedFilterMode === "interval_range"
        ? { intervalRangeDays: { max: intervalMax, min: intervalMin } }
        : {}),
      mode: savedFilterMode,
      rescheduling: customRescheduling,
      reviewOrder: savedReviewOrder,
      ...(savedFilterMode === "card_state" ? { stateFilter: [customState] } : {}),
      ...(customScope === "tag" && customTag ? { tagQuery: [customTag] } : {}),
    };
  }

  function validateCustomSelection(): boolean {
    if (customScope === "decks" && customDeckIds.length === 0) {
      setError("Choose at least one deck.");
      setCustomStep(1);
      return false;
    }
    if (customScope === "folder" && selectedFolderDecks().length === 0) {
      setError("Choose a folder with at least one deck.");
      setCustomStep(1);
      return false;
    }
    if (customScope === "tag" && !customTag) {
      setError("Choose a tag.");
      setCustomStep(1);
      return false;
    }
    if (intervalMin < 0 || intervalMax < intervalMin) {
      setError("Choose a valid interval range.");
      setCustomStep(4);
      return false;
    }
    return true;
  }

  function startCustomSession() {
    if (!validateCustomSelection()) return;
    setWizardOpen(false);
    void start(customSelection());
  }

  async function saveStudyFilter() {
    const name = savedFilterName.trim();
    if (!name || pending || !validateCustomSelection()) return;
    const selection = customSelection();
    setPending("save-filter");
    setError(null);
    setStatus(null);
    const response = await fetch("/api/study/filters", {
      body: JSON.stringify({
        definition: selection,
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

  const selectedDeck = snapshot.decks.find((deck) => deck.deckId === initialDeckId);
  const available = selectedDeck
    ? selectedDeck.due + selectedDeck.learning + selectedDeck.new
    : snapshot.due + snapshot.learning + snapshot.new;
  const learning = selectedDeck?.learning ?? snapshot.learning;
  const due = selectedDeck?.due ?? snapshot.due;
  const newCards = selectedDeck?.new ?? snapshot.new;
  const scopeLabel =
    customScope === "all"
      ? "All decks"
      : customScope === "decks"
        ? `${customDeckIds.length} selected deck${customDeckIds.length === 1 ? "" : "s"}`
        : customScope === "folder"
          ? (snapshot.folders.find((folder) => folder.id === customFolderId)?.name ?? "Folder")
          : customTag || "Tag";

  return (
    <div className="study-dashboard">
      <header className="study-page-header">
        <div>
          <p className="eyebrow">Study</p>
          <h1>Ready when you are, {learnerName}</h1>
          <p>Review what needs attention, with new material added at your pace.</p>
        </div>
        <Dropdown
          items={[
            { label: "View statistics", onSelect: () => router.push("/app/stats" as Route) },
            {
              label: "Scheduling settings",
              onSelect: () => router.push("/app/settings/scheduling" as Route),
            },
          ]}
          label="More study options"
        />
      </header>

      {snapshot.resumableSession && (
        <section className="study-resume" aria-labelledby="resume-heading">
          <div>
            <h2 id="resume-heading">Continue your session</h2>
            <p>
              {snapshot.resumableSession.completed} of {snapshot.resumableSession.total} complete
            </p>
          </div>
          <Button
            disabled={pending !== null}
            onClick={() => void resume(snapshot.resumableSession?.id ?? "")}
          >
            Resume
          </Button>
        </section>
      )}

      {snapshot.recentSession && !snapshot.resumableSession && (
        <p className="study-recent-session" role="status">
          Last session: {snapshot.recentSession.completed} card
          {snapshot.recentSession.completed === 1 ? "" : "s"} completed ·{" "}
          <time dateTime={snapshot.recentSession.completedAt}>
            {new Date(snapshot.recentSession.completedAt).toLocaleString()}
          </time>
        </p>
      )}

      <section className="study-today-card" aria-labelledby="today-heading">
        <div className="study-today-card__lead">
          <div>
            <p className="eyebrow">{selectedDeck ? selectedDeck.name : "Today"}</p>
            <h2 id="today-heading">
              {available > 0 ? `${available} cards ready` : "You’re caught up"}
            </h2>
            <p>
              <strong>{learning}</strong> learning · <strong>{due}</strong> due ·{" "}
              <strong>{newCards}</strong> new
            </p>
          </div>
          <Button
            disabled={available === 0 || pending !== null}
            onClick={() => void start(selectedDeck ? { deckId: selectedDeck.deckId } : {})}
          >
            {pending === (selectedDeck?.deckId ?? "today")
              ? "Starting…"
              : selectedDeck
                ? "Start this deck"
                : "Start today’s study"}
          </Button>
        </div>
        <span className="study-today-card__completed">
          {snapshot.completedToday} completed today
        </span>
        {available === 0 && (
          <p className="study-empty-hint">
            Nothing is scheduled right now. Review ahead or practice without changing your schedule.
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
            <h2 id="decks-heading">Study a deck</h2>
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
        {snapshot.decks.length === 0 && (
          <div className="study-zero-state">
            <h3>No decks yet</h3>
            <p>Create a deck and add your first card to begin studying.</p>
            <a href="/app/decks/new">Create a deck</a>
          </div>
        )}
      </section>

      <section className="study-custom" aria-labelledby="custom-study-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Flexible practice</p>
            <h2 id="custom-study-heading">Custom study</h2>
            <p>Choose what to practice and whether ratings update your schedule.</p>
          </div>
          <Button
            onClick={() => {
              setCustomStep(1);
              setWizardOpen(true);
            }}
            variant="secondary"
          >
            Build a session
          </Button>
        </div>
        <div className="study-preset-list" aria-label="Quick custom study presets">
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
            Starred practice
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "review_ahead" })}
            size="sm"
            variant="secondary"
          >
            Review ahead
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void start({ mode: "cram", rescheduling: false })}
            size="sm"
            variant="secondary"
          >
            Practice all
          </Button>
        </div>
      </section>

      {snapshot.savedFilters.length > 0 && (
        <section className="study-saved-filters" aria-labelledby="saved-filters-heading">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Reusable</p>
              <h2 id="saved-filters-heading">Saved study filters</h2>
            </div>
          </div>
          <div className="study-saved-filter-list">
            {snapshot.savedFilters.map((filter) => (
              <article className="study-saved-filter" key={filter.id}>
                <span>
                  <strong>{filter.name}</strong>
                  <small>
                    {filter.definition.mode === "today"
                      ? "Today’s queue"
                      : modeLabels[filter.definition.mode]}{" "}
                    · {filter.definition.rescheduling ? "updates scheduling" : "practice only"}
                  </small>
                </span>
                <Button
                  disabled={pending !== null}
                  onClick={() => void start({ filterId: filter.id })}
                  size="sm"
                  variant="secondary"
                >
                  Start
                </Button>
                <Dropdown
                  items={[
                    {
                      destructive: true,
                      label: "Delete filter…",
                      onSelect: () =>
                        setFilterToDelete({
                          id: filter.id,
                          name: filter.name,
                          version: filter.version,
                        }),
                    },
                  ]}
                  label={`More options for ${filter.name}`}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      <Dialog
        className="study-wizard"
        description={`Step ${customStep} of 5`}
        onOpenChange={setWizardOpen}
        open={wizardOpen}
        title={
          customStep === 1
            ? "What do you want to study?"
            : customStep === 2
              ? "Which cards should be included?"
              : customStep === 3
                ? "Should ratings update scheduling?"
                : customStep === 4
                  ? "How should cards be ordered?"
                  : "Review your session"
        }
      >
        <div className="study-wizard__progress" aria-label={`Step ${customStep} of 5`}>
          {Array.from({ length: 5 }, (_, index) => (
            <span aria-hidden="true" data-active={index + 1 <= customStep} key={index} />
          ))}
        </div>

        {customStep === 1 && (
          <div className="study-wizard__choices">
            {(["all", "decks", "folder", "tag"] as const).map((scope) => (
              <button
                aria-pressed={customScope === scope}
                className="study-wizard__choice"
                key={scope}
                onClick={() => setCustomScope(scope)}
                type="button"
              >
                <strong>
                  {scope === "all"
                    ? "All decks"
                    : scope === "decks"
                      ? "Selected decks"
                      : scope === "folder"
                        ? "A folder"
                        : "A tag"}
                </strong>
                <span>
                  {scope === "all"
                    ? "Use cards from your whole library"
                    : scope === "decks"
                      ? "Combine one or more decks"
                      : scope === "folder"
                        ? "Use every deck in a folder"
                        : "Find cards across decks by tag"}
                </span>
              </button>
            ))}
            {customScope === "decks" && (
              <fieldset className="study-wizard__checklist">
                <legend>Decks</legend>
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
                    />
                    {deck.name}
                  </label>
                ))}
              </fieldset>
            )}
            {customScope === "folder" && (
              <label className="study-wizard__field">
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
            )}
            {customScope === "tag" && (
              <label className="study-wizard__field">
                Tag
                <select onChange={(event) => setCustomTag(event.target.value)} value={customTag}>
                  {snapshot.tags.map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {customStep === 2 && (
          <div className="study-wizard__choices study-wizard__choices--modes">
            {wizardModes.map((mode) => (
              <button
                aria-pressed={savedFilterMode === mode}
                className="study-wizard__choice"
                key={mode}
                onClick={() => setSavedFilterMode(mode)}
                type="button"
              >
                <strong>{modeLabels[mode]}</strong>
              </button>
            ))}
          </div>
        )}

        {customStep === 3 && (
          <div className="study-wizard__behavior">
            <button
              aria-pressed={customRescheduling}
              className="study-wizard__choice"
              onClick={() => setCustomRescheduling(true)}
              type="button"
            >
              <strong>Update my schedule</strong>
              <span>Show recall ratings and apply them to each card’s next review.</span>
            </button>
            <button
              aria-pressed={!customRescheduling}
              className="study-wizard__choice"
              onClick={() => setCustomRescheduling(false)}
              type="button"
            >
              <strong>Practice only</strong>
              <span>Move through cards without changing long-term scheduling.</span>
            </button>
          </div>
        )}

        {customStep === 4 && (
          <div className="study-wizard__form">
            <label className="study-wizard__field">
              Card order
              <select
                onChange={(event) => setSavedReviewOrder(event.target.value as ReviewOrder)}
                value={savedReviewOrder}
              >
                <option value="due">Due first</option>
                <option value="relative_overdueness">Most overdue first</option>
                <option value="retrievability">Hardest to remember first</option>
                <option value="random">Random order</option>
              </select>
            </label>
            {savedFilterMode === "interval_range" && (
              <div className="study-wizard__field-row">
                <label className="study-wizard__field">
                  Minimum interval (days)
                  <input
                    min="0"
                    onChange={(event) => setIntervalMin(event.target.valueAsNumber)}
                    type="number"
                    value={intervalMin}
                  />
                </label>
                <label className="study-wizard__field">
                  Maximum interval (days)
                  <input
                    min="0"
                    onChange={(event) => setIntervalMax(event.target.valueAsNumber)}
                    type="number"
                    value={intervalMax}
                  />
                </label>
              </div>
            )}
            {savedFilterMode === "card_state" && (
              <label className="study-wizard__field">
                Card state
                <select
                  onChange={(event) => setCustomState(event.target.value as CardState)}
                  value={customState}
                >
                  <option value="new">New</option>
                  <option value="learning">Learning</option>
                  <option value="review">Review</option>
                  <option value="relearning">Relearning</option>
                </select>
              </label>
            )}
          </div>
        )}

        {customStep === 5 && (
          <div className="study-wizard__summary">
            <dl>
              <div>
                <dt>Scope</dt>
                <dd>{scopeLabel}</dd>
              </div>
              <div>
                <dt>Cards</dt>
                <dd>{modeLabels[savedFilterMode]}</dd>
              </div>
              <div>
                <dt>Ratings</dt>
                <dd>{customRescheduling ? "Update scheduling" : "Practice only"}</dd>
              </div>
              <div>
                <dt>Order</dt>
                <dd>{savedReviewOrder.replaceAll("_", " ")}</dd>
              </div>
            </dl>
            <div className="study-wizard__save">
              <label className="study-wizard__field">
                Save this setup (optional)
                <input
                  maxLength={80}
                  onChange={(event) => setSavedFilterName(event.target.value)}
                  placeholder="e.g. Friday catch-up"
                  value={savedFilterName}
                />
              </label>
              <Button
                disabled={!savedFilterName.trim() || pending !== null}
                onClick={() => void saveStudyFilter()}
                size="sm"
                variant="secondary"
              >
                Save filter
              </Button>
            </div>
          </div>
        )}

        <div className="study-wizard__actions">
          {customStep > 1 ? (
            <Button onClick={() => setCustomStep((step) => step - 1)} variant="ghost">
              Back
            </Button>
          ) : (
            <span />
          )}
          {customStep < 5 ? (
            <Button onClick={() => setCustomStep((step) => step + 1)}>Continue</Button>
          ) : (
            <Button disabled={pending !== null} onClick={startCustomSession}>
              Start session
            </Button>
          )}
        </div>
      </Dialog>

      <Dialog
        description="This removes the shortcut only. It does not delete cards, review history, or scheduling data."
        footer={
          <>
            <Button onClick={() => setFilterToDelete(null)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={pending !== null}
              onClick={() => {
                if (!filterToDelete) return;
                void deleteStudyFilter(filterToDelete.id, filterToDelete.version);
                setFilterToDelete(null);
              }}
              variant="danger"
            >
              Delete filter
            </Button>
          </>
        }
        onOpenChange={(open) => !open && setFilterToDelete(null)}
        open={filterToDelete !== null}
        title={`Delete “${filterToDelete?.name ?? "filter"}”?`}
      >
        <p>You can rebuild this filter later from Custom study.</p>
      </Dialog>
    </div>
  );
}
