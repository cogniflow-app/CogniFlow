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
import { Button, Input } from "@lumen/ui";
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
  const selected = presets.find((preset) => preset.id === selectedId) ?? systemPreset;
  const { control, register, handleSubmit, reset } = useForm<FormValues>({
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

  return (
    <div className="scheduling-settings">
      <header className="study-page-header">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h1>Memory settings</h1>
          <p>
            Presets belong to this learner profile. Deck authors cannot change another learner’s
            schedule.
          </p>
        </div>
        <a className="button button--secondary" href="/app/study">
          Back to Study
        </a>
      </header>
      <div className="scheduling-layout">
        <aside className="preset-list" aria-label="Scheduling presets">
          <h2>Presets</h2>
          {presets.map((preset) => (
            <button
              aria-current={preset.id === selectedId ? "true" : undefined}
              key={preset.id}
              onClick={() => choosePreset(preset.id)}
              type="button"
            >
              <strong>{preset.name}</strong>
              <small>
                {preset.preset.algorithm === "fsrs" ? "FSRS" : "SM-2 compatibility"}
                {preset.isDefault ? " · default" : ""}
              </small>
            </button>
          ))}
          <Button
            onClick={() => {
              setSelectedId("system");
              reset(formValues("My preset", DEFAULT_FSRS_PRESET));
            }}
            size="sm"
            variant="secondary"
          >
            Create preset
          </Button>
        </aside>
        <form
          className="preset-form"
          onSubmit={(event) => void handleSubmit((values) => save(values))(event)}
        >
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Selected preset</p>
              <h2>Review behavior</h2>
            </div>
            <span>Changes use version checks</span>
          </div>
          <div className="form-grid form-grid--two">
            <label>
              Preset name
              <Input {...register("name", { required: true })} maxLength={80} />
            </label>
            <label>
              Algorithm
              <select {...register("algorithm")}>
                <option value="fsrs">FSRS (recommended)</option>
                <option value="sm2">SM-2 compatibility</option>
              </select>
            </label>
            <label>
              Requested retention
              <Input
                {...register("requestedRetention", { valueAsNumber: true })}
                max="0.99"
                min="0.70"
                step="0.01"
                type="number"
              />
            </label>
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
          </div>
          <details className="preset-advanced">
            <summary>Advanced scheduling options</summary>
            <p>
              The defaults fit most learners. Adjust interval limits, step behavior, ordering, and
              leech handling only when you need finer control.
            </p>
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
                Learning steps
                <Input {...register("learningSteps")} placeholder="1m 10m" />
              </label>
              <label>
                Relearning steps
                <Input {...register("relearningSteps")} placeholder="10m" />
              </label>
              <label>
                New-card order
                <select {...register("newCardOrder")}>
                  <option value="created">Created order</option>
                  <option value="due">Due order</option>
                  <option value="random">Random</option>
                </select>
              </label>
              <label>
                Review order
                <select {...register("reviewOrder")}>
                  <option value="due">Due first</option>
                  <option value="relative_overdueness">Most overdue</option>
                  <option value="retrievability">Lowest retrievability</option>
                  <option value="random">Random</option>
                </select>
              </label>
              <label>
                New/review mix
                <select {...register("newReviewMix")}>
                  <option value="interleave">Interleave</option>
                  <option value="before">New first</option>
                  <option value="after">New after reviews</option>
                </select>
              </label>
              <label>
                Leech threshold
                <Input
                  {...register("leechThreshold", { valueAsNumber: true })}
                  max="100"
                  min="1"
                  type="number"
                />
              </label>
              <label>
                Leech action
                <select {...register("leechAction")}>
                  <option value="tag">Tag for attention</option>
                  <option value="suspend">Suspend</option>
                </select>
              </label>
            </div>
            <div className="preset-toggles">
              <label>
                <input type="checkbox" {...register("shortTermEnabled")} /> Use learning steps
              </label>
              <label>
                <input type="checkbox" {...register("fuzzEnabled")} /> Gently vary mature intervals
              </label>
              <label>
                <input type="checkbox" {...register("burySiblings")} /> Bury sibling cards
              </label>
            </div>
          </details>
          {workload && (
            <p className="workload-estimate">
              <strong>Workload estimate:</strong> about {workload.estimatedDailyReviews} reviews/day
              at this retention, compared with {workload.currentDailyReviews} recently.{" "}
              {workload.explanation}
            </p>
          )}
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
          <div className="form-actions">
            <Button disabled={pending} type="submit">
              {pending ? "Saving…" : "Save preset"}
            </Button>
            <Button
              disabled={pending}
              onClick={() => void handleSubmit((values) => save(values, true))()}
              type="button"
              variant="secondary"
            >
              Duplicate
            </Button>
            <Button
              onClick={() =>
                reset(
                  formValues(
                    selected.id === "system" ? "My preset" : selected.name,
                    DEFAULT_FSRS_PRESET,
                  ),
                )
              }
              type="button"
              variant="secondary"
            >
              Restore system defaults
            </Button>
            {selected.id !== "system" && !selected.isDefault && (
              <Button
                disabled={pending}
                onClick={() => void remove()}
                type="button"
                variant="danger"
              >
                Delete
              </Button>
            )}
          </div>
        </form>
      </div>
      <section className="preset-decks" aria-labelledby="apply-heading">
        <div>
          <h2 id="apply-heading">Apply to decks</h2>
          <p>Choose one or several decks. Existing history remains intact.</p>
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
              />{" "}
              {deck.name}
              {deck.presetId === selected.id ? " · using this preset" : ""}
            </label>
          ))}
        </div>
        <Button
          disabled={selected.id === "system" || selectedDecks.length === 0 || pending}
          onClick={() => void applyToDecks()}
        >
          Apply preset
        </Button>
        {algorithmMigration && (
          <div className="review-confirmation" role="alert">
            <span>
              Changing scheduler algorithms replays each card’s non-undone canonical history. It
              preserves immutable logs, advances schedule versions, and records one private audit
              event. You can migrate back by applying the previous preset later.
            </span>
            <Button
              disabled={pending}
              onClick={() => void confirmAlgorithmMigration()}
              variant="danger"
            >
              Confirm {algorithmMigration.targetAlgorithm.toUpperCase()} migration for{" "}
              {algorithmMigration.count}
            </Button>
            <Button disabled={pending} onClick={() => setAlgorithmMigration(null)} variant="ghost">
              Cancel
            </Button>
          </div>
        )}
        {selected.id === "system" && (
          <p className="field-hint">
            Save the system defaults as a personal preset before applying them.
          </p>
        )}
      </section>
      <section className="preset-decks" aria-labelledby="bulk-heading">
        <div>
          <h2 id="bulk-heading">Bulk schedule controls</h2>
          <p>
            Uses the deck selection above. Previewing is required; confirmation fails if the count
            changes before the locked transaction.
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
            <option value="bury">Bury until next study day</option>
            <option value="mark_leech">Mark as leech</option>
          </select>
        </label>
        <div className="form-actions">
          <Button
            disabled={selectedDecks.length === 0 || pending}
            onClick={() => void previewBulkOperation()}
            variant="secondary"
          >
            Preview affected count
          </Button>
          {bulkPreview && bulkPreview.count > 0 && (
            <Button disabled={pending} onClick={() => void confirmBulkOperation()} variant="danger">
              Confirm {bulkPreview.operation.replace("_", " ")} for {bulkPreview.count}
            </Button>
          )}
        </div>
      </section>
      <section className="optimizer-note">
        <h2>Personal parameter optimization</h2>
        <p>
          Available only after at least 400 high-quality canonical reviews. The adapter and export
          schema are present, but execution is disabled by default; no non-working Optimize control
          is shown.
        </p>
      </section>
    </div>
  );
}
