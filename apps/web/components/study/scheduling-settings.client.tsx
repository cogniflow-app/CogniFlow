"use client";

import {
  DEFAULT_FSRS_PRESET,
  estimateRetentionWorkload,
  formatSteps,
  nextStudyDayBoundary,
  parseSteps,
  validatePreset,
  type SchedulerPreset,
} from "@lumen/srs";
import { Button, Dialog, Dropdown, Input, Tabs } from "@lumen/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

export interface SchedulingPresetView {
  readonly id: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly preset: SchedulerPreset;
  readonly version: number;
}

interface FormValues {
  algorithm: "fsrs" | "sm2";
  burySiblings: boolean;
  fuzzEnabled: boolean;
  learningSteps: string;
  leechAction: "suspend" | "tag";
  leechThreshold: number;
  maximumIntervalDays: number;
  name: string;
  newCardOrder: "created" | "due" | "random";
  newCardsPerDay: number;
  newReviewMix: "after" | "before" | "interleave";
  relearningSteps: string;
  requestedRetention: number;
  reviewOrder: "due" | "random" | "relative_overdueness" | "retrievability";
  reviewsPerDay: number;
  shortTermEnabled: boolean;
}

type BulkOperation = "bury" | "mark_leech" | "suspend" | "unsuspend";

interface BulkPreview {
  readonly count: number;
  readonly deckIds: readonly string[];
  readonly operation: BulkOperation;
  readonly value: Readonly<Record<string, unknown>>;
}

interface AlgorithmMigrationPreview {
  readonly count: number;
  readonly deckIds: readonly string[];
  readonly targetAlgorithm: "fsrs" | "sm2";
  readonly targetPresetId: string;
}

function formValues(name: string, preset: SchedulerPreset): FormValues {
  return {
    algorithm: preset.algorithm,
    burySiblings: preset.burySiblings,
    fuzzEnabled: preset.fuzzEnabled,
    learningSteps: formatSteps(preset.learningStepsMinutes),
    leechAction: preset.leechAction,
    leechThreshold: preset.leechThreshold,
    maximumIntervalDays: preset.maximumIntervalDays,
    name,
    newCardOrder: preset.newCardOrder,
    newCardsPerDay: preset.newCardsPerDay,
    newReviewMix: preset.newReviewMix,
    relearningSteps: formatSteps(preset.relearningStepsMinutes),
    requestedRetention: preset.requestedRetention,
    reviewOrder: preset.reviewOrder,
    reviewsPerDay: preset.reviewsPerDay,
    shortTermEnabled: preset.shortTermEnabled,
  };
}

function presetFromForm(values: FormValues): SchedulerPreset {
  return validatePreset({
    algorithm: values.algorithm,
    burySiblings: values.burySiblings,
    fuzzEnabled: values.fuzzEnabled,
    learningStepsMinutes: parseSteps(values.learningSteps),
    leechAction: values.leechAction,
    leechThreshold: Number(values.leechThreshold),
    maximumIntervalDays: Number(values.maximumIntervalDays),
    newCardOrder: values.newCardOrder,
    newCardsPerDay: Number(values.newCardsPerDay),
    newReviewMix: values.newReviewMix,
    relearningStepsMinutes: parseSteps(values.relearningSteps),
    requestedRetention: Number(values.requestedRetention),
    reviewOrder: values.reviewOrder,
    reviewsPerDay: Number(values.reviewsPerDay),
    shortTermEnabled: values.shortTermEnabled,
  });
}

export function SchedulingSettings({
  currentDailyReviews,
  decks,
  initialPresets,
  studyDayStart,
  timezone,
}: {
  readonly currentDailyReviews: number;
  readonly decks: readonly {
    readonly id: string;
    readonly name: string;
    readonly presetId: string | null;
  }[];
  readonly initialPresets: readonly SchedulingPresetView[];
  readonly studyDayStart: number;
  readonly timezone: string;
}) {
  const router = useRouter();
  const systemPreset = useMemo<SchedulingPresetView>(
    () => ({
      id: "system",
      isDefault: true,
      name: "System defaults",
      preset: { ...DEFAULT_FSRS_PRESET },
      version: 0,
    }),
    [],
  );
  const presets = initialPresets.length ? initialPresets : [systemPreset];
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? "system");
  const [selectedDecks, setSelectedDecks] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [bulkOperation, setBulkOperation] = useState<BulkOperation>("suspend");
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [algorithmMigration, setAlgorithmMigration] = useState<AlgorithmMigrationPreview | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selected = presets.find((preset) => preset.id === selectedId) ?? systemPreset;
  const { control, register, handleSubmit, reset, setValue } = useForm<FormValues>({
    defaultValues: formValues(selected.name, selected.preset),
  });
  const retention = Number(useWatch({ control, name: "requestedRetention" }));
  const workload = Number.isFinite(retention)
    ? estimateRetentionWorkload(
        selected.preset.requestedRetention,
        Math.min(0.99, Math.max(0.7, retention)),
        currentDailyReviews,
      )
    : null;

  function choosePreset(id: string) {
    const next = presets.find((preset) => preset.id === id) ?? systemPreset;
    setSelectedId(id);
    reset(formValues(next.name, next.preset));
    setStatus(null);
    setError(null);
    setAlgorithmMigration(null);
  }

  async function save(values: FormValues, duplicate = false) {
    setPending(true);
    setStatus(null);
    setError(null);
    try {
      const preset = presetFromForm(values);
      const isNew = duplicate || selected.id === "system";
      const response = await fetch("/api/study/presets", {
        body: JSON.stringify({
          expectedVersion: isNew ? 0 : selected.version,
          name: duplicate ? `${values.name} copy` : values.name,
          preset,
          presetId: isNew ? crypto.randomUUID() : selected.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        readonly error?: { readonly message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "The preset could not be saved.");
      setStatus(duplicate ? "Preset duplicated." : "Preset saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The preset could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (selected.id === "system" || selected.isDefault || pending) return;
    setPending(true);
    const response = await fetch("/api/study/presets", {
      body: JSON.stringify({ expectedVersion: selected.version, presetId: selected.id }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });
    if (!response.ok) setError("The preset could not be deleted.");
    else {
      setStatus("Preset deleted. Its decks now use your default preset.");
      router.refresh();
    }
    setPending(false);
  }

  async function applyToDecks() {
    if (selected.id === "system" || selectedDecks.length === 0 || pending) return;
    setPending(true);
    setError(null);
    setStatus(null);
    setAlgorithmMigration(null);
    const deckIds = [...selectedDecks].sort();
    const previewResponse = await fetch("/api/study/presets/migrate", {
      body: JSON.stringify({ deckIds, preview: true, targetPresetId: selected.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const previewPayload = (await previewResponse.json().catch(() => ({}))) as {
      readonly data?: {
        readonly affectedCount?: number;
        readonly targetAlgorithm?: "fsrs" | "sm2";
      };
    };
    if (!previewResponse.ok || typeof previewPayload.data?.affectedCount !== "number") {
      setError("The preset compatibility preview could not be calculated.");
      setPending(false);
      return;
    }
    if (previewPayload.data.affectedCount > 0) {
      setAlgorithmMigration({
        count: previewPayload.data.affectedCount,
        deckIds,
        targetAlgorithm: previewPayload.data.targetAlgorithm ?? selected.preset.algorithm,
        targetPresetId: selected.id,
      });
      setStatus(
        `${String(previewPayload.data.affectedCount)} schedule${previewPayload.data.affectedCount === 1 ? "" : "s"} require an explicit algorithm migration before this preset can be applied.`,
      );
      setPending(false);
      return;
    }
    const response = await fetch("/api/study/presets/apply", {
      body: JSON.stringify({ deckIds, presetId: selected.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) setError("The preset could not be applied to those decks.");
    else {
      setStatus(
        `Preset applied to ${String(deckIds.length)} deck${deckIds.length === 1 ? "" : "s"}.`,
      );
      router.refresh();
    }
    setPending(false);
  }

  async function confirmAlgorithmMigration() {
    if (!algorithmMigration || pending) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/study/presets/migrate", {
      body: JSON.stringify({
        deckIds: algorithmMigration.deckIds,
        expectedCount: algorithmMigration.count,
        idempotencyKey: crypto.randomUUID(),
        operationEventId: crypto.randomUUID(),
        preview: false,
        targetPresetId: algorithmMigration.targetPresetId,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setError(
        "The migration preview changed or the schedules could not be replayed. Preview again.",
      );
    } else {
      setStatus(
        `${String(algorithmMigration.count)} schedule${algorithmMigration.count === 1 ? "" : "s"} replayed into ${algorithmMigration.targetAlgorithm.toUpperCase()} and audited. Review history was preserved.`,
      );
      setAlgorithmMigration(null);
      router.refresh();
    }
    setPending(false);
  }

  async function previewBulkOperation() {
    if (selectedDecks.length === 0 || pending) return;
    setPending(true);
    setStatus(null);
    setError(null);
    const value =
      bulkOperation === "bury"
        ? {
            until: nextStudyDayBoundary(new Date(), {
              studyDayStartMinutes: studyDayStart,
              timezone,
            }).toISOString(),
          }
        : {};
    const deckIds = [...selectedDecks].sort();
    const response = await fetch("/api/study/schedules/bulk-control", {
      body: JSON.stringify({ deckIds, operation: bulkOperation, preview: true, value }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      readonly data?: { readonly affectedCount?: number };
      readonly message?: string;
    };
    if (!response.ok || typeof payload.data?.affectedCount !== "number") {
      setError(payload.message ?? "The bulk preview could not be calculated.");
    } else {
      setBulkPreview({
        count: payload.data.affectedCount,
        deckIds,
        operation: bulkOperation,
        value,
      });
      setStatus(
        `${String(payload.data.affectedCount)} existing schedule${payload.data.affectedCount === 1 ? "" : "s"} would change.`,
      );
    }
    setPending(false);
  }

  async function confirmBulkOperation() {
    if (!bulkPreview || bulkPreview.count < 1 || pending) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/study/schedules/bulk-control", {
      body: JSON.stringify({
        deckIds: bulkPreview.deckIds,
        expectedCount: bulkPreview.count,
        idempotencyKey: crypto.randomUUID(),
        operation: bulkPreview.operation,
        operationEventId: crypto.randomUUID(),
        preview: false,
        value: bulkPreview.value,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setError(
        "The preview became stale or the bulk operation could not be applied. Preview again.",
      );
    } else {
      setStatus(`${String(bulkPreview.count)} schedules changed in one audited transaction.`);
      setBulkPreview(null);
      router.refresh();
    }
    setPending(false);
  }

  const retentionPercent = Number.isFinite(retention) ? Math.round(retention * 100) : 90;

  return (
    <div className="scheduling-settings" data-guide-id="scheduling-settings">
      <header className="study-page-header">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h1>Memory settings</h1>
          <p>Choose how often cards return. These settings are private to this learner profile.</p>
        </div>
        <a className="button button--secondary" href="/app/study">
          Back to Study
        </a>
      </header>

      <form
        className="preset-form"
        onSubmit={(event) => void handleSubmit((values) => save(values))(event)}
      >
        <div className="scheduling-preset-bar">
          <label>
            Preset
            <select onChange={(event) => choosePreset(event.target.value)} value={selectedId}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                  {preset.isDefault ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="scheduling-algorithm-badge">
            {selected.preset.algorithm === "fsrs" ? "FSRS · recommended" : "SM-2 compatibility"}
          </span>
          <div className="scheduling-preset-actions">
            <Button disabled={pending} type="submit">
              {pending ? "Saving…" : "Save preset"}
            </Button>
            <Button
              onClick={() => {
                setSelectedId("system");
                reset(formValues("My preset", DEFAULT_FSRS_PRESET));
              }}
              type="button"
              variant="secondary"
            >
              New preset
            </Button>
            <Dropdown
              items={[
                {
                  label: "Duplicate preset",
                  disabled: pending,
                  onSelect: () => void handleSubmit((values) => save(values, true))(),
                },
                {
                  label: "Restore system defaults",
                  onSelect: () =>
                    reset(
                      formValues(
                        selected.id === "system" ? "My preset" : selected.name,
                        DEFAULT_FSRS_PRESET,
                      ),
                    ),
                },
                ...(selected.id !== "system" && !selected.isDefault
                  ? [
                      { type: "separator" as const },
                      {
                        label: "Delete preset…",
                        destructive: true,
                        disabled: pending,
                        onSelect: () => setDeleteOpen(true),
                      },
                    ]
                  : []),
              ]}
              label="More preset actions"
            />
          </div>
        </div>

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

        <Tabs
          className="scheduling-tabs"
          defaultValue="basics"
          items={[
            {
              value: "basics",
              label: "Basics",
              content: (
                <section className="scheduling-section">
                  <div className="stats-section-heading">
                    <h2>Basics</h2>
                    <p>FSRS is recommended because it adapts intervals to your review history.</p>
                  </div>
                  <div className="form-grid form-grid--two">
                    <label>
                      Preset name
                      <Input {...register("name", { required: true })} maxLength={80} />
                    </label>
                    <label>
                      Scheduling algorithm
                      <select {...register("algorithm")}>
                        <option value="fsrs">FSRS (recommended)</option>
                        <option value="sm2">SM-2 compatibility</option>
                      </select>
                    </label>
                  </div>
                  <fieldset className="retention-control">
                    <legend>Desired recall</legend>
                    <p>
                      How often you want to remember a card when it returns. Higher recall usually
                      means more reviews.
                    </p>
                    <div>
                      <input
                        aria-label="Desired recall percentage"
                        max="99"
                        min="70"
                        onChange={(event) =>
                          setValue("requestedRetention", event.target.valueAsNumber / 100, {
                            shouldDirty: true,
                          })
                        }
                        type="range"
                        value={retentionPercent}
                      />
                      <label>
                        Percent
                        <Input
                          max="99"
                          min="70"
                          onChange={(event) =>
                            setValue("requestedRetention", event.target.valueAsNumber / 100, {
                              shouldDirty: true,
                            })
                          }
                          type="number"
                          value={retentionPercent}
                        />
                      </label>
                    </div>
                  </fieldset>
                  {workload && (
                    <p className="workload-estimate">
                      <strong>Estimated workload:</strong> about {workload.estimatedDailyReviews}{" "}
                      reviews per day, compared with {workload.currentDailyReviews} recently.{" "}
                      {workload.explanation}
                    </p>
                  )}
                </section>
              ),
            },
            {
              value: "limits",
              label: "Daily limits",
              content: (
                <section className="scheduling-section">
                  <div className="stats-section-heading">
                    <h2>Daily limits</h2>
                    <p>Limits cap workload; they do not erase overdue cards.</p>
                  </div>
                  <div className="form-grid form-grid--two">
                    <label>
                      New cards per day
                      <Input
                        {...register("newCardsPerDay", { valueAsNumber: true })}
                        max="10000"
                        min="0"
                        type="number"
                      />
                    </label>
                    <label>
                      Reviews per day
                      <Input
                        {...register("reviewsPerDay", { valueAsNumber: true })}
                        max="100000"
                        min="0"
                        type="number"
                      />
                    </label>
                    <label>
                      Learning steps
                      <Input {...register("learningSteps")} placeholder="1m 10m" />
                    </label>
                    <label>
                      Relearning steps
                      <Input {...register("relearningSteps")} placeholder="10m" />
                    </label>
                  </div>
                  <label className="scheduling-checkbox">
                    <input type="checkbox" {...register("shortTermEnabled")} /> Use learning and
                    relearning steps
                  </label>
                </section>
              ),
            },
            {
              value: "order",
              label: "Order",
              content: (
                <section className="scheduling-section">
                  <div className="stats-section-heading">
                    <h2>Card order</h2>
                    <p>Order changes what appears first, not when a card becomes due.</p>
                  </div>
                  <div className="form-grid form-grid--two">
                    <label>
                      New-card order
                      <select {...register("newCardOrder")}>
                        <option value="created">Created order</option>
                        <option value="due">Assigned order</option>
                        <option value="random">Random</option>
                      </select>
                    </label>
                    <label>
                      Review order
                      <select {...register("reviewOrder")}>
                        <option value="due">Due first</option>
                        <option value="relative_overdueness">Most overdue</option>
                        <option value="retrievability">Hardest to remember</option>
                        <option value="random">Random</option>
                      </select>
                    </label>
                    <label>
                      New and review mix
                      <select {...register("newReviewMix")}>
                        <option value="interleave">Interleave</option>
                        <option value="before">New first</option>
                        <option value="after">New after reviews</option>
                      </select>
                    </label>
                  </div>
                </section>
              ),
            },
            {
              value: "advanced",
              label: "Advanced",
              content: (
                <section className="scheduling-section">
                  <div className="stats-section-heading">
                    <h2>Advanced behavior</h2>
                    <p>
                      The defaults fit most learners. Change these only for a specific scheduling
                      need.
                    </p>
                  </div>
                  <div className="form-grid form-grid--two">
                    <label>
                      Maximum interval (days)
                      <Input
                        {...register("maximumIntervalDays", { valueAsNumber: true })}
                        max="36500"
                        min="1"
                        type="number"
                      />
                    </label>
                    <label>
                      Forgotten-card threshold
                      <Input
                        {...register("leechThreshold", { valueAsNumber: true })}
                        max="100"
                        min="1"
                        type="number"
                      />
                    </label>
                    <label>
                      After the threshold
                      <select {...register("leechAction")}>
                        <option value="tag">Flag for attention</option>
                        <option value="suspend">Suspend</option>
                      </select>
                    </label>
                  </div>
                  <div className="preset-toggles">
                    <label>
                      <input type="checkbox" {...register("fuzzEnabled")} /> Gently vary mature
                      intervals
                    </label>
                    <label>
                      <input type="checkbox" {...register("burySiblings")} /> Hide related cards
                      until tomorrow
                    </label>
                  </div>
                </section>
              ),
            },
            {
              value: "decks",
              label: "Decks",
              content: (
                <section className="scheduling-section">
                  <div className="stats-section-heading">
                    <h2>Apply to decks</h2>
                    <p>Choose one or more decks. Existing review history remains intact.</p>
                  </div>
                  <div className="preset-deck-choices">
                    {decks.map((deck) => (
                      <label key={deck.id}>
                        <input
                          checked={selectedDecks.includes(deck.id)}
                          onChange={(event) => {
                            setSelectedDecks((current) =>
                              event.target.checked
                                ? [...current, deck.id]
                                : current.filter((id) => id !== deck.id),
                            );
                            setBulkPreview(null);
                            setAlgorithmMigration(null);
                          }}
                          type="checkbox"
                        />
                        <span>
                          {deck.name}
                          {deck.presetId === selected.id ? <small>Using this preset</small> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button
                    disabled={selected.id === "system" || selectedDecks.length === 0 || pending}
                    onClick={() => void applyToDecks()}
                    type="button"
                  >
                    Apply preset
                  </Button>
                  {selected.id === "system" && (
                    <p className="field-hint">
                      Save these defaults as a personal preset before applying them.
                    </p>
                  )}
                </section>
              ),
            },
            {
              value: "maintenance",
              label: "Maintenance",
              content: (
                <section className="scheduling-section scheduling-maintenance">
                  <div className="stats-section-heading">
                    <h2>Bulk schedule controls</h2>
                    <p>
                      Uses the deck selection in the Decks tab. Every operation is previewed and
                      audited.
                    </p>
                  </div>
                  <label>
                    Operation
                    <select
                      onChange={(event) => {
                        setBulkOperation(event.target.value as BulkOperation);
                        setBulkPreview(null);
                      }}
                      value={bulkOperation}
                    >
                      <option value="suspend">Suspend active schedules</option>
                      <option value="unsuspend">Unsuspend schedules</option>
                      <option value="bury">Hide until next study day</option>
                      <option value="mark_leech">Flag as difficult</option>
                    </select>
                  </label>
                  <Button
                    disabled={selectedDecks.length === 0 || pending}
                    onClick={() => void previewBulkOperation()}
                    type="button"
                    variant="secondary"
                  >
                    Preview affected cards
                  </Button>
                  <details className="optimizer-note">
                    <summary>Personal parameter optimization</summary>
                    <p>
                      Available after at least 400 high-quality canonical reviews. Execution remains
                      disabled by default, so no inactive Optimize button is shown.
                    </p>
                  </details>
                </section>
              ),
            },
          ]}
          label="Scheduling setting sections"
        />
      </form>

      <Dialog
        description="Decks using this preset will return to your default. Cards and review history are not deleted."
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setDeleteOpen(false);
                void remove();
              }}
              variant="danger"
            >
              Delete preset
            </Button>
          </>
        }
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete “${selected.name}”?`}
      >
        <p>This cannot be undone, but it does not remove study data.</p>
      </Dialog>

      <Dialog
        description="Changing algorithms replays each card’s non-undone canonical history. Immutable logs remain intact and one private audit event is recorded."
        footer={
          <>
            <Button onClick={() => setAlgorithmMigration(null)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => void confirmAlgorithmMigration()}
              variant="danger"
            >
              Migrate {algorithmMigration?.count ?? 0} schedules
            </Button>
          </>
        }
        onOpenChange={(open) => !open && setAlgorithmMigration(null)}
        open={algorithmMigration !== null}
        title={`Move selected decks to ${algorithmMigration?.targetAlgorithm.toUpperCase() ?? "another algorithm"}?`}
      >
        <p>You can migrate back later by applying the previous preset.</p>
      </Dialog>

      <Dialog
        description="The preview count must still match when the transaction begins. The change is recorded as one audited operation."
        footer={
          <>
            <Button onClick={() => setBulkPreview(null)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={pending || !bulkPreview?.count}
              onClick={() => void confirmBulkOperation()}
              variant="danger"
            >
              Apply to {bulkPreview?.count ?? 0} schedules
            </Button>
          </>
        }
        onOpenChange={(open) => !open && setBulkPreview(null)}
        open={Boolean(bulkPreview && bulkPreview.count > 0)}
        title={`Confirm ${bulkPreview?.operation.replace("_", " ") ?? "bulk change"}?`}
      >
        <p>No review log is rewritten or removed.</p>
      </Dialog>
    </div>
  );
}
