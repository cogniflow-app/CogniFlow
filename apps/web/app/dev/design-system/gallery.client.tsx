"use client";

import {
  Accordion,
  Avatar,
  Badge,
  Button,
  Card,
  CardFlip,
  Checkbox,
  CompactStatus,
  ContextMenu,
  DataTable,
  DataTableBody,
  DataTableCaption,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableSortButton,
  Dialog,
  DialogClose,
  Dropdown,
  EmptyState,
  ErrorState,
  FormField,
  FormSection,
  IconButton,
  Input,
  LinkButton,
  LiveRegion,
  OfflineBanner,
  PermissionState,
  Popover,
  ProductToolbar,
  Progress,
  Radio,
  Score,
  SegmentedControl,
  Select,
  SectionHeader,
  Sheet,
  ShortcutHint,
  Skeleton,
  Streak,
  StickyActionBar,
  Surface,
  Switch,
  SyncIndicator,
  Tabs,
  Textarea,
  TimerProgress,
  ToastProvider,
  Tooltip,
  VisuallyHidden,
  useToast,
  PlusIcon,
} from "@lumen/ui";
import { useMemo, useState, type FormEvent } from "react";

const reportRows = [
  { accuracy: 86, learner: "Avery", recall: "Strong", sessions: 4 },
  { accuracy: 72, learner: "Jordan", recall: "Growing", sessions: 3 },
  { accuracy: 93, learner: "Morgan", recall: "Strong", sessions: 5 },
] as const;

function Specimen({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section
      aria-labelledby={`specimen-${title.toLowerCase().replaceAll(" ", "-")}`}
      className="space-y-5"
    >
      <h2
        className="font-[family-name:var(--font-reading)] text-3xl font-semibold tracking-[-0.035em]"
        id={`specimen-${title.toLowerCase().replaceAll(" ", "-")}`}
      >
        {title}
      </h2>
      <Surface padding="lg" tone="raised">
        {children}
      </Surface>
    </section>
  );
}

function GalleryContent() {
  const { notify } = useToast();
  const [flipped, setFlipped] = useState(false);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
  const [syncState, setSyncState] = useState<"synced" | "syncing">("synced");
  const [compact, setCompact] = useState(false);
  const sortedRows = useMemo(
    () =>
      [...reportRows].sort((left, right) =>
        sortDirection === "ascending"
          ? left.accuracy - right.accuracy
          : right.accuracy - left.accuracy,
      ),
    [sortDirection],
  );

  function announce(title: string, description: string) {
    notify({ description, title, tone: "success" });
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    announce("Preferences saved", "The representative form completed without leaving the gallery.");
  }

  function checkConnection() {
    setSyncState("syncing");
    window.setTimeout(() => {
      setSyncState("synced");
      announce("Connection restored", "Queued changes are ready to synchronize.");
    }, 250);
  }

  return (
    <div className="space-y-16">
      <Specimen title="Actions and feedback">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              announce("Study plan created", "A real gallery notification confirmed the action.")
            }
          >
            Create study plan
          </Button>
          <Button
            onClick={() => announce("Draft saved", "The secondary action completed.")}
            variant="secondary"
          >
            Save draft
          </Button>
          <Button
            onClick={() => announce("Quiet action", "Ghost controls remain fully operable.")}
            variant="ghost"
          >
            Quiet action
          </Button>
          <Button
            onClick={() =>
              announce("Draft removed", "The destructive example completed without learner data.")
            }
            variant="danger"
          >
            Remove draft example
          </Button>
          <Button disabled>Unavailable action</Button>
          <Button loading loadingLabel="Saving example">
            Save example
          </Button>
          <Button leadingIcon={<PlusIcon />}>
            Add cards with an intentionally long translated action label
          </Button>
          <Tooltip content="Start a focused recall session">
            <IconButton
              label="Start focused recall"
              onClick={() => announce("Recall started", "The icon button has an accessible name.")}
            >
              <PlusIcon />
            </IconButton>
          </Tooltip>
          <LinkButton href="/" variant="secondary">
            Public overview
          </LinkButton>
          <ShortcutHint keys={["⌘", "Enter"]} label="Save answer" />
        </div>
        <LiveRegion visuallyHidden={false}>
          Representative feedback is announced politely.
        </LiveRegion>
      </Specimen>

      <Specimen title="Product composition">
        <div className="space-y-6">
          <SectionHeader
            actions={
              <Button leadingIcon={<PlusIcon />}>
                New deck with a deliberately long localized label
              </Button>
            }
            description="Shared headers wrap actions before labels or focus rings can be clipped."
            title="Library section"
          />
          <ProductToolbar label="Representative product toolbar">
            <Input aria-label="Search examples" placeholder="Search decks" type="search" />
            <SegmentedControl
              defaultValue="recent"
              label="Example filters"
              options={[
                { label: "All", value: "all" },
                { label: "Recent", value: "recent" },
                { label: "Published", value: "published" },
              ]}
            />
            <Button variant="ghost">Clear filters</Button>
          </ProductToolbar>
          <FormSection
            description="Compact answer rows keep the decision visible and reveal secondary settings only when requested."
            title="Repeated answer rows"
          >
            <div className="grid gap-2">
              {["A", "B", "C", "D"].map((label, index) => (
                <div className="design-answer-row" key={label}>
                  <Badge tone={index === 1 ? "brand" : "neutral"}>{label}</Badge>
                  <Input
                    aria-label={`Example answer ${label}`}
                    defaultValue={index === 1 ? "The selected correct answer" : "Answer option"}
                  />
                  <Button size="sm" variant="ghost">
                    Move
                  </Button>
                </div>
              ))}
            </div>
          </FormSection>
          <div className="flex flex-wrap gap-3">
            <CompactStatus tone="progress">Saving…</CompactStatus>
            <CompactStatus tone="success">Saved</CompactStatus>
            <CompactStatus tone="danger">Couldn’t save</CompactStatus>
          </div>
          <StickyActionBar aria-label="Representative mobile action bar">
            <Button variant="secondary">Preview</Button>
            <Button>Save and add another</Button>
          </StickyActionBar>
        </div>
      </Specimen>

      <Specimen title="Form controls">
        <form className="grid gap-6 md:grid-cols-2" onSubmit={submitForm}>
          <FormField
            description="Used for the front of a generated study card."
            label="Prompt"
            required
          >
            <Input defaultValue="What does retrieval practice strengthen?" />
          </FormField>
          <FormField description="Choose the language used for grading." label="Answer language">
            <Select
              defaultValue="en"
              options={[
                { label: "English", value: "en" },
                { label: "Spanish", value: "es" },
                { disabled: true, label: "Auto-detect unavailable", value: "auto" },
              ]}
            />
          </FormField>
          <FormField error="Add a source before publishing this example." label="Source">
            <Textarea placeholder="Author, title, or course reference" />
          </FormField>
          <FormField
            description="Changes how written recall is compared."
            group
            label="Grading mode"
          >
            <Radio
              defaultValue="moderate"
              options={[
                { description: "Exact phrasing matters.", label: "Strict", value: "strict" },
                {
                  description: "Minor punctuation and typo differences are accepted.",
                  label: "Moderate",
                  value: "moderate",
                },
                {
                  description: "Meaning matters more than phrasing.",
                  label: "Relaxed",
                  value: "relaxed",
                },
              ]}
            />
          </FormField>
          <div className="space-y-4 md:col-span-2">
            <Checkbox
              description="This affects practice selection, not canonical scheduling."
              label="Star this card for focused practice"
            />
            <Switch
              description="Suppress celebratory effects and sounds."
              label="Serious mode for this session"
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Save representative preferences</Button>
          </div>
        </form>
      </Specimen>

      <Specimen title="Overlays and menus">
        <div className="flex flex-wrap gap-3">
          <Dialog
            description="Focus stays inside until the dialog is closed with this control or Escape."
            footer={
              <DialogClose asChild>
                <Button variant="secondary">Done</Button>
              </DialogClose>
            }
            title="Review session settings"
            trigger={<Button variant="secondary">Open dialog</Button>}
          >
            <p className="m-0 text-[var(--color-text-muted)]">
              Choose a study-day boundary only after your time zone is known.
            </p>
          </Dialog>
          <Sheet
            description="The panel uses the same accessible dialog semantics."
            title="Session queue"
            trigger={<Button variant="secondary">Open sheet</Button>}
          >
            <Progress label="Queue preview" value={64} />
          </Sheet>
          <Popover
            title="Review meaning"
            trigger={<Button variant="secondary">Open popover</Button>}
          >
            <p className="m-0 text-sm leading-relaxed text-[var(--color-text-muted)]">
              A dedicated review changes scheduling only after the answer is revealed and rated.
            </p>
          </Popover>
          <Dropdown
            items={[
              {
                label: "Duplicate view",
                onSelect: () => announce("View duplicated", "The menu selection completed."),
              },
              {
                label: "Export summary",
                onSelect: () => announce("Summary prepared", "The export example completed."),
              },
              { type: "separator" },
              {
                destructive: true,
                label: "Archive view",
                onSelect: () => announce("View archived", "No learner data was deleted."),
              },
            ]}
            label="Open report menu"
          />
          <ContextMenu
            items={[
              {
                label: "Study this concept",
                onSelect: () =>
                  announce(
                    "Concept selected",
                    "Context-menu keyboard and pointer input are supported.",
                  ),
              },
              {
                label: "Copy concept label",
                onSelect: () => announce("Label copied", "Representative copy action completed."),
              },
            ]}
          >
            <button
              className="min-h-11 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4"
              type="button"
            >
              Right-click or use the context-menu key
            </button>
          </ContextMenu>
        </div>
      </Specimen>

      <Specimen title="Navigation patterns">
        <div className="space-y-6">
          <Tabs
            defaultValue="recall"
            items={[
              {
                content: <p>Free recall provides stronger evidence than simple exposure.</p>,
                label: "Recall",
                value: "recall",
              },
              {
                content: (
                  <p>Recognition introduces unfamiliar material without overstating mastery.</p>
                ),
                label: "Recognition",
                value: "recognition",
              },
              {
                content: <p>Game score remains independent of academic accuracy.</p>,
                label: "Play",
                value: "play",
              },
            ]}
            label="Evidence types"
          />
          <SegmentedControl
            defaultValue="term"
            label="Card orientation"
            options={[
              { label: "Term first", value: "term" },
              { label: "Definition first", value: "definition" },
              { label: "Mixed", value: "mixed" },
            ]}
          />
          <Accordion
            defaultValue="separation"
            items={[
              {
                content:
                  "Practice evidence, FSRS schedules, assessments, and game scores have separate owners.",
                title: "Why separate progress systems?",
                value: "separation",
              },
              {
                content:
                  "Every custom interaction has a keyboard path, visible focus, and reduced-motion behavior.",
                title: "What does accessible by default mean?",
                value: "accessibility",
              },
            ]}
          />
        </div>
      </Specimen>

      <Specimen title="Content and status">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card
            interactive
            onClick={() =>
              announce("Deck selected", "Interactive cards expose focus and selection behavior.")
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge dot tone="brand">
                  Learning
                </Badge>
                <h3 className="mt-5 mb-2 text-xl font-bold">Cellular respiration</h3>
                <p className="m-0 text-[var(--color-text-muted)]">
                  Representative content—not an invented learner statistic.
                </p>
              </div>
              <Avatar alt="Avery Rivera" fallback="AR" />
            </div>
            <div className="mt-6">
              <Progress label="Gallery progress example" value={68} />
            </div>
          </Card>
          <Surface padding="lg" tone="sunken">
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">New</Badge>
              <Badge tone="warning">Learning</Badge>
              <Badge tone="info">Familiar</Badge>
              <Badge tone="success">Mastered</Badge>
              <Badge tone="danger">Needs attention</Badge>
            </div>
            <div className="mt-8">
              <Skeleton label="Loading a content preview" lines={4} />
            </div>
          </Surface>
        </div>
        <div className="mt-5 space-y-3">
          <OfflineBanner onRetry={checkConnection} retrying={syncState === "syncing"} />
          <div className="flex flex-wrap gap-3">
            <SyncIndicator state={syncState} />
            <SyncIndicator state="offline" />
            <SyncIndicator state="error" />
          </div>
        </div>
      </Specimen>

      <Specimen title="Study and game primitives">
        <div className="grid gap-6 lg:grid-cols-2">
          <CardFlip
            back={
              <span>
                <strong>Retrieval routes.</strong> Recalling strengthens access to a memory more
                than rereading alone.
              </span>
            }
            flipped={flipped}
            front="What changes when a learner successfully retrieves an answer?"
            onFlippedChange={setFlipped}
          />
          <div className="space-y-6">
            <TimerProgress elapsedMs={38_000} label="Answer window" totalMs={60_000} />
            <div className="flex flex-wrap gap-3">
              <Score delta={240} value={4380} />
              <Streak count={6} personalBest />
            </div>
            <p className="m-0 text-sm leading-relaxed text-[var(--color-text-muted)]">
              Score and streak are presentation primitives only; neither changes accuracy, mastery,
              or scheduling state.
            </p>
          </div>
        </div>
      </Specimen>

      <Specimen title="Data table">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="m-0 text-sm text-[var(--color-text-muted)]">
            Representative report rows exercise semantic headers and sortable controls.
          </p>
          <Switch checked={compact} label="Compact rows" onCheckedChange={setCompact} />
        </div>
        <DataTable>
          <DataTableCaption>Representative learning evidence report</DataTableCaption>
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Learner</DataTableHead>
              <DataTableHead>
                <DataTableSortButton
                  direction={sortDirection}
                  label="Accuracy"
                  onClick={() =>
                    setSortDirection((current) =>
                      current === "ascending" ? "descending" : "ascending",
                    )
                  }
                >
                  Accuracy
                </DataTableSortButton>
              </DataTableHead>
              <DataTableHead>Recall signal</DataTableHead>
              <DataTableHead>Sessions</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {sortedRows.map((row) => (
              <DataTableRow className={compact ? "text-xs" : undefined} key={row.learner}>
                <DataTableCell className={compact ? "py-2" : undefined}>
                  {row.learner}
                </DataTableCell>
                <DataTableCell>{row.accuracy}%</DataTableCell>
                <DataTableCell>{row.recall}</DataTableCell>
                <DataTableCell>{row.sessions}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </Specimen>

      <Specimen title="System states">
        <div className="grid gap-5 xl:grid-cols-3">
          <EmptyState
            action={
              <Button
                onClick={() =>
                  announce("Deck action opened", "The empty state has a functional action.")
                }
              >
                Create a private deck
              </Button>
            }
            description="New accounts will begin without synthetic sample decks or fake progress."
            title="No decks yet"
          />
          <ErrorState
            description="The representative request did not complete, and no success is implied."
            onRetry={() => announce("Retry completed", "The gallery state recovered.")}
            title="Couldn’t load this view"
          />
          <PermissionState
            description="Ask a deck owner for study access. Private content remains private."
            title="Study access needed"
          />
        </div>
        <VisuallyHidden>End of the component gallery.</VisuallyHidden>
      </Specimen>
    </div>
  );
}

export function DesignSystemGallery() {
  return (
    <ToastProvider>
      <GalleryContent />
    </ToastProvider>
  );
}
