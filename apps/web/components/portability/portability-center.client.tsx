"use client";

import { diagnosticsToCsv } from "@lumen/import-export";
import {
  Badge,
  Button,
  Checkbox,
  FileIcon,
  FormField,
  Input,
  LinkButton,
  LockIcon,
  Progress,
  Select,
  ShieldIcon,
  Tabs,
  Textarea,
  UploadIcon,
  WarningIcon,
} from "@lumen/ui";
import { useCallback, useEffect, useState } from "react";

interface DeckChoice {
  readonly cardCount: number;
  readonly id: string;
  readonly noteCount: number;
  readonly title: string;
}

interface Diagnostic {
  readonly code: string;
  readonly item?: string;
  readonly message: string;
  readonly severity: "error" | "info" | "warning";
}

interface ImportResult {
  readonly cardCount: number;
  readonly deckIds: readonly string[];
  readonly noteCount: number;
  readonly warnings: readonly Diagnostic[];
}

interface ImportResponse {
  readonly jobId?: string;
  readonly message?: string;
  readonly processedCount?: number;
  readonly processingRequired?: boolean;
  readonly result?: ImportResult;
  readonly status?: string;
  readonly totalCount?: number | null;
}

interface Inspection {
  readonly adapterCode: string;
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly detectionConfidence?: number;
  readonly detectedFormat: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly estimatedItems: number;
  readonly loss: readonly {
    readonly count: number;
    readonly feature: string;
    readonly message: string;
    readonly policy: string;
  }[];
  readonly mapping?: {
    readonly backColumn: number;
    readonly delimiter: "," | "\t" | ";" | "|";
    readonly frontColumn: number;
    readonly hasHeader: boolean;
    readonly tagsColumn?: number;
  };
  readonly sample: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly textMapping?: {
    readonly backLanguage?: string;
    readonly cardDelimiter: string;
    readonly fieldDelimiter: string;
    readonly frontBackSwapped: boolean;
    readonly frontLanguage?: string;
    readonly hasHeader: boolean;
    readonly tags: readonly string[];
  };
}

interface ArtifactResult {
  readonly byteSize: number;
  readonly expiresAt: string;
  readonly fileName: string;
  readonly id: string;
  readonly loss: readonly {
    readonly count: number;
    readonly feature: string;
    readonly message: string;
    readonly policy: string;
  }[];
  readonly sha256: string;
}

interface JobView {
  readonly artifact: {
    readonly available: boolean;
    readonly byte_size: number;
    readonly display_name: string;
    readonly expires_at: string;
    readonly id: string;
  } | null;
  readonly completed_at: string | null;
  readonly current_phase: string;
  readonly direction: "export" | "import" | "restore";
  readonly error_count: number;
  readonly format: string;
  readonly id: string;
  readonly label: string;
  readonly processed_count: number;
  readonly requested_at: string;
  readonly safe_error_summary: string | null;
  readonly status: string;
  readonly total_count: number | null;
  readonly warning_count: number;
}

type ImportStep = "choose" | "inspect" | "map" | "review" | "running" | "results";

const sourceChoices = [
  {
    adapter: "quizlet_text",
    accept: "",
    description: "Paste terms and definitions you are authorized to use.",
    label: "Quizlet-style text",
    mode: "paste",
  },
  {
    adapter: "delimited",
    accept: ".csv,.tsv,text/csv,text/tab-separated-values",
    description: "Map columns, tags, and stable source IDs.",
    label: "CSV or TSV",
    mode: "file",
  },
  {
    adapter: "lumen_json",
    accept: ".json,application/json",
    description: "Use the versioned Lumen graph representation.",
    label: "JSON",
    mode: "file",
  },
  {
    adapter: "markdown_bundle",
    accept: ".md,.markdown,.zip,text/markdown,application/zip",
    description: "Readable Markdown or an authorized media bundle.",
    label: "Markdown",
    mode: "file",
  },
  {
    adapter: "anki_package",
    accept: ".apkg,.colpkg,application/zip",
    description: "Inspect synthetic or user-owned Anki packages safely.",
    label: "Anki package",
    mode: "file",
  },
  {
    adapter: "lumen_archive",
    accept: ".lumen,application/zip",
    description: "Preview a full-fidelity Lumen backup before restoring.",
    label: "Lumen backup",
    mode: "file",
  },
] as const;

const exportFormats = [
  ["delimited", "csv", "CSV", "Portable rows for spreadsheets and other tools."],
  ["delimited", "tsv", "TSV", "Tab-separated rows with reliable Unicode."],
  ["lumen_json", "lumen_json", "JSON", "Machine-readable versioned deck data."],
  ["markdown_bundle", "markdown_bundle", "Markdown", "Readable files plus a restorable bundle."],
  ["anki_package", "anki_apkg", "Anki package", "A real SQLite-backed .apkg for supported cards."],
  ["lumen_archive", "lumen_archive", "Lumen archive", "Full-fidelity backup with checksums."],
] as const;
type ExportChoice = (typeof exportFormats)[number];

function readableFormat(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (character) => character.toUpperCase());
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function WizardSteps({ current }: { readonly current: ImportStep }) {
  const steps: readonly ImportStep[] = ["choose", "inspect", "map", "review", "running", "results"];
  const labels = ["Source", "Inspect", "Map", "Review", "Import", "Results"];
  const currentIndex = steps.indexOf(current);
  return (
    <ol aria-label="Import progress" className="portability-stepper">
      {steps.map((step, index) => (
        <li
          aria-current={step === current ? "step" : undefined}
          data-complete={index < currentIndex}
          key={step}
        >
          <span aria-hidden="true">{index < currentIndex ? "✓" : index + 1}</span>
          {labels[index]}
        </li>
      ))}
    </ol>
  );
}

function SourcePreview({ inspection }: { readonly inspection: Inspection }) {
  const columns = [...new Set(inspection.sample.flatMap((row) => Object.keys(row)))].slice(0, 6);
  return (
    <div className="portability-preview">
      <div className="portability-preview__summary">
        <div>
          <span>Detected format</span>
          <strong>{readableFormat(inspection.detectedFormat)}</strong>
          {inspection.detectionConfidence !== undefined && (
            <small>{Math.round(inspection.detectionConfidence * 100)}% delimiter confidence</small>
          )}
        </div>
        <div>
          <span>Card entries</span>
          <strong>{inspection.estimatedItems.toLocaleString()}</strong>
        </div>
        <div>
          <span>Warnings</span>
          <strong>
            {inspection.diagnostics.filter((item) => item.severity !== "info").length}
          </strong>
        </div>
        <div>
          <span>Review data</span>
          <strong>{inspection.capabilities.reviewHistory ? "Available" : "Not included"}</strong>
        </div>
      </div>
      {inspection.sample.length > 0 && (
        <div className="portability-table-scroll" tabIndex={0}>
          <table>
            <caption>First {inspection.sample.length} detected rows</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {readableFormat(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inspection.sample.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inspection.diagnostics.length > 0 && (
        <details className="portability-warning-list">
          <summary>
            <WarningIcon aria-hidden="true" /> Review {inspection.diagnostics.length} import note
            {inspection.diagnostics.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {inspection.diagnostics.slice(0, 20).map((item, index) => (
              <li key={`${item.code}-${String(index)}`}>
                <strong>{item.item ?? readableFormat(item.code)}</strong>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PortabilityCenter({
  decks,
  enabled,
  initialTab = "import",
}: {
  readonly decks: readonly DeckChoice[];
  readonly enabled: boolean;
  readonly initialTab?: "backups" | "export" | "import" | "jobs" | "print";
}) {
  const [tab, setTab] = useState(initialTab);
  const [importStep, setImportStep] = useState<ImportStep>("choose");
  const [sourceAdapter, setSourceAdapter] = useState("quizlet_text");
  const [sourceMode, setSourceMode] = useState<"file" | "paste">("paste");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [destinationTitle, setDestinationTitle] = useState("");
  const [destinationDeckId, setDestinationDeckId] = useState("new");
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [progressPolicy, setProgressPolicy] = useState("omit");
  const [mediaPolicy, setMediaPolicy] = useState("copy_verified");
  const [textFieldDelimiter, setTextFieldDelimiter] = useState("\\t");
  const [textCardDelimiter, setTextCardDelimiter] = useState("\\n");
  const [textFrontBackSwapped, setTextFrontBackSwapped] = useState(false);
  const [textHasHeader, setTextHasHeader] = useState(false);
  const [textTags, setTextTags] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreConflictPolicy, setRestoreConflictPolicy] = useState("create_independent");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState<{
    readonly max: number | null;
    readonly value: number;
  }>({ max: null, value: 0 });
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>(decks[0] ? [decks[0].id] : []);
  const [exportChoice, setExportChoice] = useState<ExportChoice>(exportFormats[0]);
  const [includeProgress, setIncludeProgress] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [unsupportedCardPolicy, setUnsupportedCardPolicy] = useState("cancel");
  const [archivePassphrase, setArchivePassphrase] = useState("");
  const [artifact, setArtifact] = useState<ArtifactResult | null>(null);
  const [jobs, setJobs] = useState<readonly JobView[]>([]);
  const [jobsLoading, setJobsLoading] = useState(initialTab === "jobs");
  const activeChoice = sourceChoices.find((choice) => choice.adapter === sourceAdapter);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/portability/jobs", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await responseJson<{ jobs?: readonly JobView[] }>(response);
      if (response.ok) setJobs(result.jobs ?? []);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTab !== "jobs") return;
    let active = true;
    void fetch("/api/portability/jobs", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const result = await responseJson<{ jobs?: readonly JobView[] }>(response);
        if (active && response.ok) setJobs(result.jobs ?? []);
      })
      .finally(() => {
        if (active) setJobsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialTab]);

  const sourceReady = sourceMode === "paste" ? pastedText.trim().length > 0 : file !== null;

  function sourceForm() {
    const form = new FormData();
    form.set("adapterCode", sourceAdapter);
    if (sourceAdapter === "lumen_archive" && restorePassphrase) {
      form.set("archivePassphrase", restorePassphrase);
    }
    if (sourceMode === "paste") form.set("text", pastedText);
    else if (file) form.set("file", file);
    return form;
  }

  async function inspect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/portability/inspect", {
        body: sourceForm(),
        credentials: "same-origin",
        headers: { "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = await responseJson<{ inspection?: Inspection; message?: string }>(response);
      if (!response.ok || !result.inspection) {
        throw new Error(result.message ?? "The source could not be inspected.");
      }
      setInspection(result.inspection);
      if (result.inspection.textMapping) {
        setTextFieldDelimiter(
          result.inspection.textMapping.fieldDelimiter === "\t"
            ? "\\t"
            : result.inspection.textMapping.fieldDelimiter,
        );
        setTextCardDelimiter(
          result.inspection.textMapping.cardDelimiter === "\n"
            ? "\\n"
            : result.inspection.textMapping.cardDelimiter,
        );
        setTextFrontBackSwapped(result.inspection.textMapping.frontBackSwapped);
        setTextHasHeader(result.inspection.textMapping.hasHeader);
        setTextTags(result.inspection.textMapping.tags.join(", "));
      }
      setDestinationTitle(file?.name.replace(/\.[^.]+$/u, "") ?? "Imported cards");
      setImportStep("inspect");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The source could not be inspected.");
    } finally {
      setPending(false);
    }
  }

  async function processImportJob(jobId: string, archivePassphrase?: string) {
    for (;;) {
      const response = await fetch(`/api/portability/jobs/${jobId}/process`, {
        body: JSON.stringify({
          ...(archivePassphrase ? { archivePassphrase } : {}),
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = await responseJson<ImportResponse>(response);
      if (!response.ok) {
        throw new Error(result.message ?? "The import could not be continued.");
      }
      if (result.result) return result.result;
      if (response.status !== 202 || !result.jobId) {
        throw new Error("The import stopped without a final result.");
      }
      setImportProgress({
        max: result.totalCount ?? null,
        value: result.processedCount ?? 0,
      });
    }
  }

  async function runImport() {
    if (!inspection) return;
    setImportStep("running");
    setPending(true);
    setError(null);
    setImportProgress({ max: null, value: 0 });
    try {
      const form = sourceForm();
      form.set(
        "options",
        JSON.stringify({
          adapterCode: inspection.adapterCode,
          ...(inspection.adapterCode === "lumen_archive" && restorePassphrase
            ? { archivePassphrase: restorePassphrase }
            : {}),
          conflictPolicy: restoreConflictPolicy,
          destinationDeckTitle: destinationTitle,
          ...(destinationDeckId !== "new" ? { destinationDeckId } : {}),
          duplicatePolicy,
          ...(inspection.mapping ? { mapping: inspection.mapping } : {}),
          mediaPolicy,
          progressPolicy,
          ...(inspection.textMapping
            ? {
                textMapping: {
                  cardDelimiter: textCardDelimiter === "\\n" ? "\n" : textCardDelimiter,
                  fieldDelimiter: textFieldDelimiter === "\\t" ? "\t" : textFieldDelimiter,
                  frontBackSwapped: textFrontBackSwapped,
                  hasHeader: textHasHeader,
                  tags: textTags
                    .split(/[;,]/u)
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                },
              }
            : {}),
        }),
      );
      const response = await fetch("/api/portability/import", {
        body: form,
        credentials: "same-origin",
        headers: { "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = await responseJson<ImportResponse>(response);
      if (!response.ok) {
        throw new Error(result.message ?? "The import could not be completed.");
      }
      const completed =
        result.result ??
        (result.processingRequired && result.jobId
          ? await processImportJob(result.jobId, restorePassphrase || undefined)
          : null);
      if (!completed) throw new Error("The import stopped without a final result.");
      setImportResult(completed);
      setRestorePassphrase("");
      setImportStep("results");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import could not be completed.");
      setImportStep("review");
    } finally {
      setPending(false);
      void loadJobs();
    }
  }

  function downloadImportDiagnostics() {
    if (!importResult || importResult.warnings.length === 0) return;
    const blob = new Blob([diagnosticsToCsv(importResult.warnings)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "lumen-import-diagnostics.csv";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runExport(input?: {
    readonly encrypted?: boolean;
    readonly scope?: "complete_account" | "decks";
  }) {
    const scope = input?.scope ?? "decks";
    const encrypted = input?.encrypted ?? false;
    const choice = encrypted
      ? (["lumen_archive", "encrypted_lumen_archive", "Encrypted Lumen archive", ""] as const)
      : scope === "complete_account"
        ? (exportFormats[5] ?? exportFormats[0])
        : exportChoice;
    setPending(true);
    setError(null);
    setArtifact(null);
    try {
      const response = await fetch("/api/portability/export", {
        body: JSON.stringify({
          adapterCode: choice[0],
          ...(encrypted ? { archivePassphrase } : {}),
          deckIds: scope === "complete_account" ? [] : selectedDeckIds,
          fileName: scope === "complete_account" ? "lumen-account-backup" : "lumen-decks",
          format: choice[1],
          includeHistory: scope === "complete_account" || includeHistory,
          includeMedia: scope === "complete_account",
          includeProgress: scope === "complete_account" || includeProgress,
          scope,
          unsupportedCardPolicy,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = await responseJson<{ artifact?: ArtifactResult; message?: string }>(response);
      if (!response.ok || !result.artifact) {
        throw new Error(result.message ?? "The export could not be generated.");
      }
      setArtifact(result.artifact);
      setArchivePassphrase("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The export could not be generated.");
    } finally {
      setPending(false);
      void loadJobs();
    }
  }

  const importPanel = (
    <section
      aria-labelledby="import-heading"
      className="portability-workflow"
      data-guide-id="portability-import"
    >
      <WizardSteps current={importStep} />
      {importStep === "choose" && (
        <>
          <div className="portability-section-heading">
            <div>
              <p className="eyebrow">Step 1 · Choose source</p>
              <h2 id="import-heading">Bring in study material</h2>
              <p>Every source is inspected and previewed before anything is written.</p>
            </div>
            <span className="portability-trust">
              <ShieldIcon aria-hidden="true" /> Private by default
            </span>
          </div>
          <div className="portability-format-grid">
            {sourceChoices.map((choice) => (
              <button
                aria-pressed={sourceAdapter === choice.adapter}
                className="portability-format-card"
                data-selected={sourceAdapter === choice.adapter}
                key={choice.label}
                onClick={() => {
                  setSourceAdapter(choice.adapter);
                  setSourceMode(choice.mode);
                  setFile(null);
                  setInspection(null);
                }}
                type="button"
              >
                <FileIcon aria-hidden="true" />
                <strong>{choice.label}</strong>
                <span>{choice.description}</span>
              </button>
            ))}
          </div>
          <div className="portability-source-box">
            {sourceMode === "paste" ? (
              <FormField
                description="Use a tab, comma, semicolon, or consistent separator. No third-party site is contacted."
                label="Paste term and definition pairs"
              >
                <Textarea
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={"Mitochondria\tProduces cellular energy\nRibosome\tBuilds proteins"}
                  rows={10}
                  value={pastedText}
                />
              </FormField>
            ) : (
              <div className="portability-file-picker">
                <UploadIcon aria-hidden="true" />
                <div>
                  <strong>
                    {file ? file.name : `Choose ${activeChoice?.label ?? "a source"} file`}
                  </strong>
                  <span>
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : "Maximum 64 MB · file picker works with keyboard and touch"}
                  </span>
                </div>
                <label className="portability-file-button">
                  Browse
                  <input
                    accept={activeChoice?.accept}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
              </div>
            )}
            {sourceAdapter === "lumen_archive" && (
              <FormField
                description="Leave blank for an unencrypted archive. The passphrase stays only in memory and is cleared after restore."
                label="Backup passphrase, if encrypted"
              >
                <Input
                  autoComplete="off"
                  onChange={(event) => setRestorePassphrase(event.target.value)}
                  type="password"
                  value={restorePassphrase}
                />
              </FormField>
            )}
          </div>
          <div className="portability-action-bar">
            <span>{sourceReady ? "Ready to inspect" : "Add a source to continue"}</span>
            <Button
              disabled={!sourceReady || !enabled}
              loading={pending}
              onClick={() => void inspect()}
            >
              Inspect source
            </Button>
          </div>
        </>
      )}
      {importStep === "inspect" && inspection && (
        <>
          <div className="portability-section-heading">
            <div>
              <p className="eyebrow">Step 2 · Inspect</p>
              <h2 id="import-heading">This is what Lumen found</h2>
              <p>Only the preview below is rendered. Large sources remain bounded.</p>
            </div>
          </div>
          <SourcePreview inspection={inspection} />
          <div className="portability-action-bar">
            <Button onClick={() => setImportStep("choose")} variant="ghost">
              Back
            </Button>
            <Button onClick={() => setImportStep("map")}>Continue to mapping</Button>
          </div>
        </>
      )}
      {importStep === "map" && inspection && (
        <>
          <div className="portability-section-heading">
            <div>
              <p className="eyebrow">Step 3 · Map</p>
              <h2 id="import-heading">Choose how this import behaves</h2>
              <p>Defaults protect existing content and start imported cards as New.</p>
            </div>
          </div>
          <div className="portability-options-grid">
            <FormField
              description="Restores with multiple decks always create independent destination decks."
              label="Destination"
            >
              <Select
                onValueChange={setDestinationDeckId}
                options={[
                  { label: "Create a new deck", value: "new" },
                  ...decks.map((deck) => ({
                    label: `Add to ${deck.title}`,
                    value: deck.id,
                  })),
                ]}
                value={destinationDeckId}
              />
            </FormField>
            <FormField label="New deck title">
              <Input
                maxLength={180}
                onChange={(event) => setDestinationTitle(event.target.value)}
                value={destinationTitle}
                disabled={destinationDeckId !== "new"}
              />
            </FormField>
            <FormField
              description="Exact duplicates are never changed by weak text similarity."
              label="Duplicate behavior"
            >
              <Select
                onValueChange={setDuplicatePolicy}
                options={[
                  { label: "Skip exact duplicates", value: "skip" },
                  { label: "Create independent copies", value: "create" },
                  { label: "Update trusted external IDs", value: "update_external_id" },
                ]}
                value={duplicatePolicy}
              />
            </FormField>
            {inspection.capabilities.schedules && (
              <FormField
                description="History always remains private to the selected learner."
                label="Schedule and review history"
              >
                <Select
                  onValueChange={setProgressPolicy}
                  options={[
                    { label: "Content only · start New", value: "omit" },
                    { label: "Preserve if learner is empty", value: "import_if_empty" },
                    { label: "Explicit compatible merge", value: "merge_explicit" },
                  ]}
                  value={progressPolicy}
                />
              </FormField>
            )}
            {inspection.capabilities.media && (
              <FormField
                description="Only checksum- and magic-byte-verified image/audio files are copied."
                label="Media"
              >
                <Select
                  onValueChange={setMediaPolicy}
                  options={[
                    { label: "Copy verified media", value: "copy_verified" },
                    { label: "Reuse matching verified hashes", value: "link_existing_hash" },
                    { label: "Omit media", value: "omit" },
                  ]}
                  value={mediaPolicy}
                />
              </FormField>
            )}
            {inspection.adapterCode === "lumen_archive" && (
              <FormField
                description="Existing content is never silently overwritten."
                label="Restore conflict behavior"
              >
                <Select
                  onValueChange={setRestoreConflictPolicy}
                  options={[
                    { label: "Create independent copies", value: "create_independent" },
                    { label: "Restore into a new namespace", value: "new_namespace" },
                    { label: "Skip exact duplicates", value: "skip_exact" },
                    { label: "Update trusted archive lineage", value: "update_trusted_lineage" },
                    { label: "Abort if content exists", value: "abort" },
                  ]}
                  value={restoreConflictPolicy}
                />
              </FormField>
            )}
            {inspection.mapping && (
              <div className="portability-detected-setting">
                <span>Detected delimiter</span>
                <strong>
                  {inspection.mapping.delimiter === "\t" ? "Tab" : inspection.mapping.delimiter}
                </strong>
                <small>
                  Front column {inspection.mapping.frontColumn + 1} · Back column{" "}
                  {inspection.mapping.backColumn + 1}
                </small>
              </div>
            )}
            {inspection.textMapping && (
              <>
                <FormField
                  description={"Use \\\\t for a tab, or enter custom characters such as ::."}
                  label="Term / definition delimiter"
                >
                  <Input
                    maxLength={16}
                    onChange={(event) => setTextFieldDelimiter(event.target.value)}
                    value={textFieldDelimiter}
                  />
                </FormField>
                <FormField
                  description={"Use \\\\n for one card per line, or enter a custom card separator."}
                  label="Card delimiter"
                >
                  <Input
                    maxLength={32}
                    onChange={(event) => setTextCardDelimiter(event.target.value)}
                    value={textCardDelimiter}
                  />
                </FormField>
                <FormField
                  description="Comma- or semicolon-separated tags are added to every imported entry."
                  label="Tags"
                >
                  <Input
                    maxLength={2_000}
                    onChange={(event) => setTextTags(event.target.value)}
                    value={textTags}
                  />
                </FormField>
                <div className="portability-option-stack">
                  <Checkbox
                    checked={textFrontBackSwapped}
                    label="Swap front and back"
                    onCheckedChange={(checked) => setTextFrontBackSwapped(Boolean(checked))}
                  />
                  <Checkbox
                    checked={textHasHeader}
                    label="First card is a header"
                    onCheckedChange={(checked) => setTextHasHeader(Boolean(checked))}
                  />
                </div>
              </>
            )}
          </div>
          <div className="portability-action-bar">
            <Button onClick={() => setImportStep("inspect")} variant="ghost">
              Back
            </Button>
            <Button
              disabled={destinationDeckId === "new" && !destinationTitle.trim()}
              onClick={() => setImportStep("review")}
            >
              Review import
            </Button>
          </div>
        </>
      )}
      {importStep === "review" && inspection && (
        <>
          <div className="portability-section-heading">
            <div>
              <p className="eyebrow">Step 4 · Review</p>
              <h2 id="import-heading">Ready when you are</h2>
              <p>
                Import {inspection.estimatedItems.toLocaleString()} card entries into a new{" "}
                <strong>
                  {destinationDeckId === "new"
                    ? destinationTitle
                    : (decks.find((deck) => deck.id === destinationDeckId)?.title ?? "selected")}
                </strong>{" "}
                deck.{" "}
                {progressPolicy === "omit"
                  ? "Start every imported card as New."
                  : "Preserve explicitly selected compatible progress."}
              </p>
            </div>
          </div>
          <div className="portability-review-grid">
            <article>
              <span>Additions</span>
              <strong>{inspection.estimatedItems.toLocaleString()}</strong>
              <p>Imported card entries</p>
            </article>
            <article>
              <span>Duplicates</span>
              <strong>{readableFormat(duplicatePolicy)}</strong>
              <p>No fuzzy matching</p>
            </article>
            <article>
              <span>Warnings</span>
              <strong>{inspection.diagnostics.length + inspection.loss.length}</strong>
              <p>Visible after import</p>
            </article>
            <article>
              <span>Background safety</span>
              <strong>Resumable job</strong>
              <p>Safe to navigate away</p>
            </article>
          </div>
          <div className="portability-action-bar">
            <Button onClick={() => setImportStep("map")} variant="ghost">
              Back
            </Button>
            <Button loading={pending} onClick={() => void runImport()}>
              Import now
            </Button>
          </div>
        </>
      )}
      {importStep === "running" && (
        <div aria-live="polite" className="portability-running">
          <span className="portability-running__icon">
            <UploadIcon aria-hidden="true" />
          </span>
          <p className="eyebrow">Step 5 · Import</p>
          <h2 id="import-heading">Validating and writing trusted chunks</h2>
          <p>
            You can leave this page. The server keeps the job state and checks cancellation between
            chunks.
          </p>
          <Progress
            label="Import progress"
            max={importProgress.max ?? 100}
            showValue={importProgress.max !== null}
            value={importProgress.max === null ? 15 : importProgress.value}
            {...(importProgress.max === null
              ? {}
              : {
                  valueLabel: `${importProgress.value.toLocaleString()} / ${importProgress.max.toLocaleString()}`,
                })}
          />
        </div>
      )}
      {importStep === "results" && importResult && (
        <div className="portability-results">
          <span aria-hidden="true" className="portability-results__check">
            ✓
          </span>
          <p className="eyebrow">Step 6 · Results</p>
          <h2 id="import-heading">Your material is ready</h2>
          <p>
            {importResult.noteCount.toLocaleString()} entries created{" "}
            {importResult.cardCount.toLocaleString()} study cards.
          </p>
          {importResult.warnings.length > 0 && (
            <details className="portability-warning-list">
              <summary>
                <WarningIcon aria-hidden="true" /> Review {importResult.warnings.length} warning
                {importResult.warnings.length === 1 ? "" : "s"}
              </summary>
              <ul>
                {importResult.warnings.slice(0, 20).map((warning, index) => (
                  <li key={`${warning.code}-${String(index)}`}>
                    <strong>{warning.item ?? readableFormat(warning.code)}</strong>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="portability-result-actions">
            {importResult.deckIds[0] && (
              <LinkButton href={`/app/decks/${importResult.deckIds[0]}`}>
                Open imported deck
              </LinkButton>
            )}
            {importResult.warnings.length > 0 && (
              <Button onClick={downloadImportDiagnostics} variant="secondary">
                Download warning report
              </Button>
            )}
            <Button
              onClick={() => {
                setImportStep("choose");
                setInspection(null);
                setFile(null);
                setPastedText("");
                setRestorePassphrase("");
                setDestinationDeckId("new");
              }}
              variant="secondary"
            >
              Import another source
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="portability-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );

  const exportPanel = (
    <section
      aria-labelledby="export-heading"
      className="portability-workflow"
      data-guide-id="portability-export"
    >
      <div className="portability-section-heading">
        <div>
          <p className="eyebrow">Export decks</p>
          <h2 id="export-heading">Choose useful, open output</h2>
          <p>Compatibility losses are shown before the expiring artifact is downloaded.</p>
        </div>
      </div>
      <div className="portability-export-layout">
        <div>
          <h3>1 · What to export</h3>
          <div className="portability-deck-list">
            {decks.map((deck) => (
              <Checkbox
                checked={selectedDeckIds.includes(deck.id)}
                description={`${deck.noteCount} entries · ${deck.cardCount} study cards`}
                key={deck.id}
                label={deck.title}
                onCheckedChange={(checked) =>
                  setSelectedDeckIds((current) =>
                    checked
                      ? [...new Set([...current, deck.id])]
                      : current.filter((id) => id !== deck.id),
                  )
                }
              />
            ))}
            {decks.length === 0 && (
              <p className="portability-empty">Create a deck before exporting deck content.</p>
            )}
          </div>
        </div>
        <div>
          <h3>2 · Format</h3>
          <div className="portability-export-formats">
            {exportFormats.map((choice) => (
              <button
                aria-pressed={exportChoice[1] === choice[1]}
                data-selected={exportChoice[1] === choice[1]}
                key={choice[1]}
                onClick={() => setExportChoice(choice)}
                type="button"
              >
                <strong>{choice[2]}</strong>
                <span>{choice[3]}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>3 · Options</h3>
          <div className="portability-option-stack">
            <Checkbox
              checked={includeProgress}
              description="Learner-private schedule state, where the format supports it."
              label="Include scheduling"
              onCheckedChange={(checked) => setIncludeProgress(Boolean(checked))}
            />
            <Checkbox
              checked={includeHistory}
              description="Immutable review evidence stays private in the artifact."
              label="Include review history"
              onCheckedChange={(checked) => setIncludeHistory(Boolean(checked))}
            />
            {exportChoice[1] === "anki_apkg" && (
              <FormField
                description="Interactive-only cards are never silently misrepresented."
                label="Unsupported card types"
              >
                <Select
                  onValueChange={setUnsupportedCardPolicy}
                  options={[
                    { label: "Cancel if any are unsupported", value: "cancel" },
                    { label: "Flatten to static Basic cards", value: "flatten" },
                    { label: "Map to the closest supported type", value: "map_closest" },
                    { label: "Omit and report unsupported cards", value: "omit" },
                  ]}
                  value={unsupportedCardPolicy}
                />
              </FormField>
            )}
          </div>
        </div>
      </div>
      <div className="portability-action-bar">
        <span>Artifacts expire after 24 hours and are never publicly linked.</span>
        <Button
          disabled={selectedDeckIds.length === 0}
          loading={pending}
          onClick={() => void runExport()}
        >
          Generate {exportChoice[2]}
        </Button>
      </div>
      {artifact && (
        <div className="portability-artifact" aria-live="polite">
          <FileIcon aria-hidden="true" />
          <div>
            <strong>{artifact.fileName}</strong>
            <span>
              {(artifact.byteSize / 1024).toFixed(1)} KB · expires{" "}
              {new Date(artifact.expiresAt).toLocaleString()}
            </span>
            <code>SHA-256 {artifact.sha256}</code>
          </div>
          <LinkButton href={`/api/portability/artifacts/${artifact.id}`}>Download</LinkButton>
        </div>
      )}
      {error && (
        <p className="portability-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );

  const backupsPanel = (
    <section
      aria-labelledby="backups-heading"
      className="portability-workflow"
      data-guide-id="portability-backups"
    >
      <div className="portability-section-heading">
        <div>
          <p className="eyebrow">Disaster recovery</p>
          <h2 id="backups-heading">Back up your complete account</h2>
          <p>
            Content, supported progress, settings, privacy records, and guide state travel together
            with checksums.
          </p>
        </div>
      </div>
      <div className="portability-backup-grid">
        <article>
          <span className="portability-backup-icon">
            <ShieldIcon aria-hidden="true" />
          </span>
          <h3>Full-fidelity Lumen archive</h3>
          <p>Best for restoring into a clean or different account with new canonical IDs.</p>
          <ul>
            <li>Versioned manifest and deterministic checksums</li>
            <li>Owned decks, schedules, reviews, practice, mastery, versions, and settings</li>
            <li>No passwords, tokens, signed URLs, or server secrets</li>
          </ul>
          <Button
            loading={pending}
            onClick={() => {
              void runExport({ scope: "complete_account" });
            }}
          >
            Create full backup
          </Button>
        </article>
        <article>
          <span className="portability-backup-icon">
            <LockIcon aria-hidden="true" />
          </span>
          <h3>Passphrase-encrypted backup</h3>
          <p>
            AES-256-GCM with a per-archive salt and PBKDF2-HMAC-SHA-256. Lumen cannot recover a
            forgotten passphrase.
          </p>
          <FormField label="Archive passphrase">
            <Input
              autoComplete="new-password"
              onChange={(event) => setArchivePassphrase(event.target.value)}
              type="password"
              value={archivePassphrase}
            />
          </FormField>
          <Button
            disabled={archivePassphrase.length < 12}
            loading={pending}
            onClick={() => void runExport({ encrypted: true, scope: "complete_account" })}
            variant="secondary"
          >
            Create encrypted backup
          </Button>
        </article>
      </div>
      {artifact && (
        <div className="portability-artifact" aria-live="polite">
          <FileIcon aria-hidden="true" />
          <div>
            <strong>{artifact.fileName}</strong>
            <span>Private download · expires {new Date(artifact.expiresAt).toLocaleString()}</span>
          </div>
          <LinkButton href={`/api/portability/artifacts/${artifact.id}`}>Download</LinkButton>
        </div>
      )}
      {error && (
        <p className="portability-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );

  const jobsPanel = (
    <section
      aria-labelledby="jobs-heading"
      className="portability-workflow"
      data-guide-id="portability-jobs"
    >
      <div className="portability-section-heading">
        <div>
          <p className="eyebrow">Recent activity</p>
          <h2 id="jobs-heading">Jobs survive a reload</h2>
          <p>
            Inspect progress, warnings, expiration, retry, cancellation, and downloads without
            exposing storage paths.
          </p>
        </div>
        <Button loading={jobsLoading} onClick={() => void loadJobs()} size="sm" variant="secondary">
          Refresh
        </Button>
      </div>
      <div className="portability-jobs">
        {jobs.map((job) => {
          const total = job.total_count ?? 0;
          const canCancel = [
            "uploaded",
            "inspecting",
            "awaiting_mapping",
            "ready",
            "queued",
            "running",
            "paused",
          ].includes(job.status);
          return (
            <article key={`${job.direction}-${job.id}`}>
              <div className="portability-job__heading">
                <div>
                  <span>
                    {readableFormat(job.direction)} · {readableFormat(job.format)}
                  </span>
                  <h3>{job.label}</h3>
                </div>
                <Badge
                  tone={
                    job.status.includes("failed")
                      ? "danger"
                      : job.status.includes("warning")
                        ? "warning"
                        : job.status === "completed"
                          ? "success"
                          : "neutral"
                  }
                >
                  {readableFormat(job.status)}
                </Badge>
              </div>
              {total > 0 && (
                <Progress
                  label={readableFormat(job.current_phase)}
                  max={total}
                  value={job.processed_count}
                  valueLabel={`${job.processed_count.toLocaleString()} / ${total.toLocaleString()}`}
                />
              )}
              <div className="portability-job__meta">
                <span>{new Date(job.requested_at).toLocaleString()}</span>
                <span>{job.warning_count} warnings</span>
                <span>{job.error_count} errors</span>
              </div>
              {job.safe_error_summary && (
                <p className="portability-job__error">{job.safe_error_summary}</p>
              )}
              <div className="portability-job__actions">
                {job.artifact?.available && (
                  <a href={`/api/portability/artifacts/${job.artifact.id}`}>Download</a>
                )}
                {job.artifact?.available && (
                  <button
                    onClick={async () => {
                      const response = await fetch(
                        `/api/portability/artifacts/${job.artifact?.id ?? ""}`,
                        {
                          credentials: "same-origin",
                          headers: { "X-Lumen-CSRF": "1" },
                          method: "DELETE",
                        },
                      );
                      if (!response.ok) {
                        const result = await responseJson<{ message?: string }>(response);
                        setError(result.message ?? "The artifact could not be deleted.");
                      }
                      await loadJobs();
                    }}
                    type="button"
                  >
                    Delete file
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={async () => {
                      await fetch(`/api/portability/jobs/${job.id}`, {
                        body: JSON.stringify({ action: "cancel", kind: job.direction }),
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
                        method: "POST",
                      });
                      await loadJobs();
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                )}
                {job.status === "retryable" && (
                  <button
                    onClick={async () => {
                      setError(null);
                      const retry = await fetch(`/api/portability/jobs/${job.id}`, {
                        body: JSON.stringify({ action: "retry", kind: job.direction }),
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
                        method: "POST",
                      });
                      const retryResult = await responseJson<{ message?: string }>(retry);
                      if (!retry.ok) {
                        setError(retryResult.message ?? "The job could not be retried.");
                      } else if (job.direction === "import" || job.direction === "restore") {
                        setTab("import");
                        setImportStep("running");
                        setPending(true);
                        setImportProgress({ max: total || null, value: job.processed_count });
                        try {
                          const completed = await processImportJob(
                            job.id,
                            restorePassphrase || undefined,
                          );
                          setImportResult(completed);
                          setRestorePassphrase("");
                          setImportStep("results");
                        } catch (caught) {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : "The import could not be retried.",
                          );
                          setTab("jobs");
                        } finally {
                          setPending(false);
                        }
                      }
                      await loadJobs();
                    }}
                    type="button"
                  >
                    Retry
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!jobsLoading && jobs.length === 0 && (
          <div className="portability-empty-state">
            <FileIcon aria-hidden="true" />
            <h3>No import or export jobs yet</h3>
            <p>Inspect a source or generate an export to see durable job history here.</p>
          </div>
        )}
      </div>
    </section>
  );

  const printPanel = (
    <section
      aria-labelledby="print-heading"
      className="portability-workflow"
      data-guide-id="portability-print"
    >
      <div className="portability-section-heading">
        <div>
          <p className="eyebrow">Browser print</p>
          <h2 id="print-heading">Paper-ready study material</h2>
          <p>Use the browser print dialog for paper or PDF. Output varies slightly by browser.</p>
        </div>
      </div>
      <div className="portability-print-grid">
        {[
          ["guide", "Study guide", "Prompts and answers in a readable list."],
          [
            "cards",
            "Cut-out flashcards",
            "Cards avoid page splits and use duplex-friendly spacing.",
          ],
          ["test", "Practice test", "Questions with writing space and a separate answer key."],
          [
            "report",
            "Progress report",
            "Private schedule and practice summary for the selected deck.",
          ],
        ].map(([layout, label, description]) => (
          <article key={layout}>
            <FileIcon aria-hidden="true" />
            <h3>{label}</h3>
            <p>{description}</p>
            {decks[0] ? (
              <a href={`/app/portability/print?deckId=${decks[0].id}&layout=${layout}`}>
                Open print preview →
              </a>
            ) : (
              <span>Create a deck first</span>
            )}
          </article>
        ))}
      </div>
    </section>
  );

  const tabItems = [
    { content: importPanel, label: "Import", value: "import" },
    { content: exportPanel, label: "Export", value: "export" },
    { content: backupsPanel, label: "Backups", value: "backups" },
    { content: jobsPanel, label: "Jobs", value: "jobs" },
    { content: printPanel, label: "Print", value: "print" },
  ];

  return (
    <main className="portability-center" data-guide-id="portability-center">
      <header className="portability-hero">
        <div>
          <p className="eyebrow">Your work stays yours</p>
          <h1>Import & export</h1>
          <p>
            Move study material in, carry it out, recover from a backup, or prepare a clean
            printout—with every compatibility tradeoff made visible.
          </p>
        </div>
        <div className="portability-hero__trust">
          <ShieldIcon aria-hidden="true" />
          <div>
            <strong>No scraping. No shared credentials.</strong>
            <span>Only files and text you choose are processed.</span>
          </div>
        </div>
      </header>
      {!enabled && (
        <p className="portability-error" role="alert">
          Switch to your personal profile to import, export, restore, or print private material.
        </p>
      )}
      <Tabs
        items={tabItems}
        label="Import and export sections"
        onValueChange={(value) => {
          setTab(value as "backups" | "export" | "import" | "jobs" | "print");
          if (value === "jobs") void loadJobs();
        }}
        value={tab}
      />
    </main>
  );
}
