"use client";

import { CARD_SCHEMA_VERSION, emptyRichDocument, type RichDocument } from "@lumen/domain";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  FormField,
  Input,
  LinkButton,
  Select,
  Textarea,
} from "@lumen/ui";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";

import type {
  ContentApiError,
  DeckDetail,
  DeckSummary,
  DeckVisibility,
} from "@/lib/content/view-models";
import { MediaUploader } from "./media-uploader.client";

const DECK_VERSION_SYNC_EVENT = "lumen:deck-version-sync";

function publishDeckVersion(deckId: string, version: number): void {
  window.dispatchEvent(new CustomEvent(DECK_VERSION_SYNC_EVENT, { detail: { deckId, version } }));
}

async function mutate<T>(url: string, body: Readonly<Record<string, unknown>>, method = "PATCH") {
  const response = await fetch(url, {
    body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    headers: { "Content-Type": "application/json" },
    method,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data as Partial<ContentApiError> | null;
    throw new Error(error?.message ?? "That change could not be saved.");
  }
  return data as T;
}

export function DeckCommandBar({ deck }: { readonly deck: DeckSummary }) {
  const router = useRouter();
  const [title, setTitle] = useState(deck.title);
  const [version, setVersion] = useState(deck.version);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isOwner = deck.role === "owner";
  const canEdit =
    deck.status === "active" &&
    (deck.role === "owner" || deck.role === "manager" || deck.role === "editor");
  const canDuplicate = deck.status !== "deleted";
  const canArchive = isOwner && deck.status === "active";
  const canRestore = isOwner && deck.status === "archived";
  const canDelete = isOwner && deck.status !== "deleted";

  useEffect(() => {
    const synchronizeVersion = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== "object") return;
      const candidate = detail as { readonly deckId?: unknown; readonly version?: unknown };
      if (
        candidate.deckId === deck.id &&
        typeof candidate.version === "number" &&
        Number.isSafeInteger(candidate.version)
      ) {
        setVersion(candidate.version);
      }
    };
    window.addEventListener(DECK_VERSION_SYNC_EVENT, synchronizeVersion);
    return () => window.removeEventListener(DECK_VERSION_SYNC_EVENT, synchronizeVersion);
  }, [deck.id]);

  async function command(action: string, extra: Readonly<Record<string, unknown>> = {}) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await mutate<{ data: DeckSummary }>(`/api/content/decks/${deck.id}`, {
        action,
        expectedVersion: version,
        ...extra,
      });
      setVersion(result.data.version);
      publishDeckVersion(deck.id, result.data.version);
      setMessage(`${action[0]?.toUpperCase() ?? ""}${action.slice(1)} complete.`);
      if (action === "delete") router.replace("/app");
      else if (action === "duplicate") router.push(`/app/decks/${result.data.id}/edit` as Route);
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The command failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="deck-command-bar" aria-label="Deck commands">
      {canEdit && (
        <form
          className="deck-title-form"
          onSubmit={(event) => {
            event.preventDefault();
            void command("update", { title });
          }}
        >
          <label htmlFor="deck-title">Deck title</label>
          <Input
            id="deck-title"
            maxLength={180}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <Button
            disabled={busy || title.trim() === deck.title}
            loading={busy}
            size="sm"
            type="submit"
          >
            Rename
          </Button>
        </form>
      )}
      <div className="deck-command-actions">
        {canDuplicate && (
          <Button
            disabled={busy}
            onClick={() => void command("duplicate", { title: `${title} copy` })}
            variant="secondary"
          >
            Duplicate
          </Button>
        )}
        {canRestore && (
          <Button disabled={busy} onClick={() => void command("restore")} variant="secondary">
            Restore
          </Button>
        )}
        {canArchive && (
          <Button disabled={busy} onClick={() => void command("archive")} variant="secondary">
            Archive
          </Button>
        )}
        {canDelete && (
          <Button disabled={busy} onClick={() => setDeleteOpen(true)} variant="danger">
            Delete
          </Button>
        )}
      </div>
      {message && (
        <p aria-live="polite" className="deck-command-message">
          {message}
        </p>
      )}
      {canDelete && (
        <Dialog
          description="Deleted decks leave the active library and are not restorable here. Archive instead if you may need the deck later; revision records remain auditable."
          footer={
            <>
              <Button onClick={() => setDeleteOpen(false)} variant="secondary">
                Cancel
              </Button>
              <Button
                loading={busy}
                onClick={() => {
                  setDeleteOpen(false);
                  void command("delete");
                }}
                variant="danger"
              >
                Delete deck
              </Button>
            </>
          }
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title="Delete this deck?"
        >
          <p>
            This removes the deck from your library. Archive it instead when you want a reversible
            action.
          </p>
        </Dialog>
      )}
    </section>
  );
}

interface QuickRow {
  readonly id: string;
  readonly back: string;
  readonly front: string;
  readonly tags: string;
}

function textDocument(value: string): RichDocument {
  return value.trim()
    ? {
        schemaVersion: 2,
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: value.trim() }] }],
        attrs: { language: "en" },
      }
    : emptyRichDocument("en");
}

function newRow(): QuickRow {
  return { id: crypto.randomUUID(), back: "", front: "", tags: "" };
}

export function BulkQuickEditor({ deckId }: { readonly deckId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<readonly QuickRow[]>(() => [newRow(), newRow(), newRow()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function patchRow(id: string, patch: Partial<QuickRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (!next[index] || !next[target]) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }
  async function save() {
    const complete = rows.filter((row) => row.front.trim() && row.back.trim());
    if (complete.length === 0) {
      setMessage("Enter a front and back for at least one row.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await mutate(
        `/api/content/decks/${deckId}/notes/bulk`,
        {
          notes: complete.map((row) => ({
            authoringData: {
              kind: "basic",
              schemaVersion: CARD_SCHEMA_VERSION,
              front: textDocument(row.front),
              back: textDocument(row.back),
            },
            clientId: row.id,
            tags: row.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          })),
        },
        "POST",
      );
      setRows([newRow(), newRow(), newRow()]);
      setMessage(`${String(complete.length)} ${complete.length === 1 ? "note" : "notes"} saved.`);
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The notes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="quick-editor" aria-labelledby="quick-editor-heading">
      <div className="quick-editor__heading">
        <div>
          <h2 id="quick-editor-heading">Quick add</h2>
          <p>
            Add basic notes in a keyboard-friendly grid. Use the rich editor for media and advanced
            card types.
          </p>
        </div>
        <LinkButton href={`/app/decks/${deckId}/edit`} variant="secondary">
          Rich editor
        </LinkButton>
      </div>
      <div className="quick-grid" role="table" aria-label="Quick note rows">
        <div className="quick-grid__header" role="row">
          <span role="columnheader">Front</span>
          <span role="columnheader">Back</span>
          <span role="columnheader">Tags</span>
          <span role="columnheader">Order</span>
        </div>
        {rows.map((row, index) => (
          <div className="quick-grid__row" key={row.id} role="row">
            <Textarea
              aria-label={`Row ${String(index + 1)} front`}
              onChange={(event) => patchRow(row.id, { front: event.target.value })}
              placeholder="Prompt"
              rows={2}
              value={row.front}
            />
            <Textarea
              aria-label={`Row ${String(index + 1)} back`}
              onChange={(event) => patchRow(row.id, { back: event.target.value })}
              placeholder="Answer"
              rows={2}
              value={row.back}
            />
            <Input
              aria-label={`Row ${String(index + 1)} tags`}
              onChange={(event) => patchRow(row.id, { tags: event.target.value })}
              placeholder="tag, tag"
              value={row.tags}
            />
            <div className="quick-grid__controls">
              <Button
                aria-label={`Move row ${String(index + 1)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                size="sm"
                variant="ghost"
              >
                ↑
              </Button>
              <Button
                aria-label={`Move row ${String(index + 1)} down`}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                size="sm"
                variant="ghost"
              >
                ↓
              </Button>
              <Button
                aria-label={`Remove row ${String(index + 1)}`}
                onClick={() =>
                  setRows((current) => current.filter((candidate) => candidate.id !== row.id))
                }
                size="sm"
                variant="ghost"
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setRows((current) => [...current, newRow()])} variant="secondary">
          Add row
        </Button>
        <Button loading={busy} onClick={() => void save()}>
          Save complete rows
        </Button>
      </div>
      {message && (
        <p aria-live="polite" className="editor-message">
          {message}
        </p>
      )}
    </section>
  );
}

function bulkTags(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function NoteCardBrowser({
  deck,
  editableTargetDecks = [],
}: {
  readonly deck: DeckDetail;
  readonly editableTargetDecks?: readonly Pick<DeckSummary, "id" | "title">[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [addTags, setAddTags] = useState("");
  const [removeTags, setRemoveTags] = useState("");
  const [targetDeckId, setTargetDeckId] = useState("none");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canEdit =
    deck.status === "active" &&
    (deck.role === "owner" || deck.role === "manager" || deck.role === "editor");
  const notes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return deck.notes.filter(
      (note) =>
        (kind === "all" || note.cardType === kind) &&
        (!normalized ||
          note.preview.toLocaleLowerCase().includes(normalized) ||
          note.tags.some((tag) => tag.toLocaleLowerCase().includes(normalized))),
    );
  }, [deck.notes, kind, query]);
  const selectedNotes = useMemo(
    () => deck.notes.filter((note) => selected.includes(note.id)),
    [deck.notes, selected],
  );
  const moveTargets = editableTargetDecks.filter((target) => target.id !== deck.id);

  async function applyTags() {
    const additions = bulkTags(addTags);
    const removals = bulkTags(removeTags);
    if (additions.length === 0 && removals.length === 0) {
      setMessage("Enter at least one tag to add or remove.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await mutate(
        `/api/content/decks/${deck.id}/notes/bulk-actions`,
        {
          action: "tag",
          addTags: additions,
          notes: selectedNotes.map((note) => ({
            expectedVersion: note.version,
            id: note.id,
          })),
          removeTags: removals,
        },
        "POST",
      );
      setSelected([]);
      setAddTags("");
      setRemoveTags("");
      setMessage(
        `Tags updated on ${String(selectedNotes.length)} ${selectedNotes.length === 1 ? "note" : "notes"}.`,
      );
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The tags could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function moveNotes() {
    const target = moveTargets.find((candidate) => candidate.id === targetDeckId);
    if (!target) {
      setMessage("Choose an editable target deck.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await mutate(
        `/api/content/decks/${deck.id}/notes/bulk-actions`,
        {
          action: "move",
          notes: selectedNotes.map((note) => ({
            expectedVersion: note.version,
            id: note.id,
          })),
          targetDeckId: target.id,
        },
        "POST",
      );
      setSelected([]);
      setTargetDeckId("none");
      setMessage(
        `${String(selectedNotes.length)} ${selectedNotes.length === 1 ? "note" : "notes"} moved to ${target.title}.`,
      );
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The notes could not be moved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="deck-browser" aria-labelledby="note-browser-heading">
      <div className="deck-browser__toolbar">
        <div>
          <h2 id="note-browser-heading">Notes and generated siblings</h2>
          <p>
            {deck.noteCount} notes generate {deck.cardCount} active cards. There is no scheduling
            state in this browser.
          </p>
        </div>
        {canEdit && <LinkButton href={`/app/decks/${deck.id}/edit`}>Add note</LinkButton>}
      </div>
      <div className="library-toolbar" role="search">
        <Input
          aria-label="Search within deck"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search note text or tags"
          type="search"
          value={query}
        />
        <Select
          aria-label="Filter card type"
          onValueChange={setKind}
          value={kind}
          options={[
            { label: "All card types", value: "all" },
            ...deck.supportedCardTypes.map((type) => ({
              label: type.replaceAll("_", " "),
              value: type,
            })),
          ]}
        />
      </div>
      <div className="note-browser-list">
        {notes.length === 0 ? (
          <p className="library-empty">No notes match these filters.</p>
        ) : (
          notes.map((note) => {
            const siblings = deck.cards.filter((card) => card.noteId === note.id && card.active);
            const checked = selected.includes(note.id);
            return (
              <article className="note-browser-row" key={note.id}>
                {canEdit ? (
                  <Checkbox
                    checked={checked}
                    label={`Select ${note.preview || "untitled note"}`}
                    onCheckedChange={(value) =>
                      setSelected((current) =>
                        value === true
                          ? [...current, note.id]
                          : current.filter((id) => id !== note.id),
                      )
                    }
                  />
                ) : (
                  <span aria-hidden="true" />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{note.cardType.replaceAll("_", " ")}</Badge>
                    <span className="text-xs text-[var(--color-text-muted)]">v{note.version}</span>
                  </div>
                  <h3>{note.preview || "Untitled note"}</h3>
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div
                  className="sibling-chips"
                  aria-label={`${String(siblings.length)} generated siblings`}
                >
                  {siblings.map((card) => (
                    <span key={card.id}>{card.previewFront || card.generationKey}</span>
                  ))}
                </div>
                {canEdit && (
                  <LinkButton
                    href={`/app/decks/${deck.id}/edit?note=${note.id}`}
                    variant="secondary"
                  >
                    Edit
                  </LinkButton>
                )}
              </article>
            );
          })
        )}
      </div>
      {canEdit && selected.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk note actions">
          <div className="bulk-bar__summary">
            <strong>{selected.length} selected</strong>
            <p>Tag or move these notes without changing their identities.</p>
            <Button disabled={busy} onClick={() => setSelected([])} size="sm" variant="ghost">
              Clear selection
            </Button>
          </div>
          <div className="bulk-bar__controls">
            <Input
              aria-label="Tags to add"
              disabled={busy}
              onChange={(event) => setAddTags(event.target.value)}
              placeholder="Add tags, comma separated"
              value={addTags}
            />
            <Input
              aria-label="Tags to remove"
              disabled={busy}
              onChange={(event) => setRemoveTags(event.target.value)}
              placeholder="Remove tags, comma separated"
              value={removeTags}
            />
            <Button loading={busy} onClick={() => void applyTags()} size="sm">
              Apply tags
            </Button>
            <Select
              aria-label="Move to deck"
              disabled={busy || moveTargets.length === 0}
              onValueChange={setTargetDeckId}
              options={[
                {
                  label: moveTargets.length === 0 ? "No other editable decks" : "Choose a deck",
                  value: "none",
                },
                ...moveTargets.map((target) => ({ label: target.title, value: target.id })),
              ]}
              value={targetDeckId}
            />
            <Button
              disabled={targetDeckId === "none"}
              loading={busy}
              onClick={() => void moveNotes()}
              size="sm"
              variant="secondary"
            >
              Move notes
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p aria-live="polite" className="editor-message">
          {message}
        </p>
      )}
    </section>
  );
}

export function DeckSettingsEditor({ deck }: { readonly deck: DeckDetail }) {
  const router = useRouter();
  const [description, setDescription] = useState(deck.descriptionPlain);
  const [visibility, setVisibility] = useState<DeckVisibility>(deck.visibility);
  const [license, setLicense] = useState(deck.license);
  const [theme, setTheme] = useState(deck.theme);
  const [frontLanguage, setFrontLanguage] = useState(deck.languageFront);
  const [backLanguage, setBackLanguage] = useState(deck.languageBack);
  const [coverAssetId, setCoverAssetId] = useState<string | null>(deck.coverAssetId);
  const [version, setVersion] = useState(deck.version);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(action: "publish" | "unpublish" | "update") {
    setBusy(true);
    setMessage(null);
    try {
      const settings = {
        action,
        coverAssetId,
        description,
        expectedVersion: version,
        languageBack: backLanguage,
        languageFront: frontLanguage,
        license,
        theme,
      };
      const result = await mutate<{ data: DeckSummary }>(
        `/api/content/decks/${deck.id}`,
        action === "publish" ? { ...settings, visibility } : settings,
      );
      setVersion(result.data.version);
      publishDeckVersion(deck.id, result.data.version);
      setMessage(
        action === "publish"
          ? "Published projection refreshed."
          : action === "unpublish"
            ? "Deck unpublished."
            : "Deck details saved. Publication visibility changes when you publish or unpublish.",
      );
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="deck-settings-form" aria-labelledby="deck-settings-heading">
      <div>
        <h2 id="deck-settings-heading">Deck details and publication</h2>
        <p>
          Only a frozen published projection is public. Draft notes, revisions, members, internal
          IDs, and private media paths stay private.
        </p>
      </div>
      <FormField label="Description">
        <Textarea
          maxLength={20_000}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          value={description}
        />
      </FormField>
      <MediaUploader
        kind="image"
        label="Deck cover"
        onUploaded={(asset) => setCoverAssetId(asset.id)}
      />
      {coverAssetId && <Badge tone="success">Cover image attached</Badge>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Front language">
          <Input onChange={(event) => setFrontLanguage(event.target.value)} value={frontLanguage} />
        </FormField>
        <FormField label="Back language">
          <Input onChange={(event) => setBackLanguage(event.target.value)} value={backLanguage} />
        </FormField>
        <FormField label="Deck theme">
          <Select
            onValueChange={setTheme}
            value={theme}
            options={[
              { label: "Lumen neutral", value: "neutral" },
              { label: "Ocean", value: "ocean" },
              { label: "Forest", value: "forest" },
              { label: "High contrast", value: "contrast" },
            ]}
          />
        </FormField>
        <FormField label="License">
          <Select
            onValueChange={(value) => setLicense(value as DeckDetail["license"])}
            value={license}
            options={[
              { label: "All rights reserved", value: "all_rights_reserved" },
              { label: "CC0", value: "cc0" },
              { label: "CC BY", value: "cc_by" },
              { label: "CC BY-SA", value: "cc_by_sa" },
            ]}
          />
        </FormField>
        <FormField
          label="Publication visibility"
          description="Applied when you publish. Choose Private and unpublish to remove the public projection."
        >
          <Select
            onValueChange={(value) => setVisibility(value as DeckVisibility)}
            value={visibility}
            options={[
              { label: "Private", value: "private" },
              { label: "Unlisted", value: "unlisted" },
              { label: "Public", value: "public" },
            ]}
          />
        </FormField>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} onClick={() => void save("update")}>
          Save settings
        </Button>
        {deck.publicId && visibility !== "private" && (
          <Button loading={busy} onClick={() => void save("publish")} variant="secondary">
            Update published version
          </Button>
        )}
        {deck.publicId ? (
          <Button loading={busy} onClick={() => void save("unpublish")} variant="secondary">
            Unpublish
          </Button>
        ) : visibility !== "private" ? (
          <Button loading={busy} onClick={() => void save("publish")} variant="secondary">
            Publish current version
          </Button>
        ) : null}
        {deck.publicSlug && deck.publicId && (
          <LinkButton href={`/deck/${deck.publicSlug}`}>Open public preview</LinkButton>
        )}
      </div>
      {message && (
        <p aria-live="polite" className="editor-message">
          {message}
        </p>
      )}
    </section>
  );
}

export function VersionHistory({ deck }: { readonly deck: DeckDetail }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedVersion = deck.versions.find((version) => version.deckVersion === selected);
  const canRestore = deck.status === "active" && (deck.role === "owner" || deck.role === "manager");
  async function restore(versionNumber: number) {
    try {
      await mutate(`/api/content/decks/${deck.id}`, {
        action: "restore_version",
        expectedVersion: deck.version,
        versionNumber,
      });
      setMessage(`Version ${String(versionNumber)} restored as a new current version.`);
      setSelected(null);
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The version could not be restored.");
    }
  }
  return (
    <section className="version-history" aria-labelledby="version-history-heading">
      <div>
        <h2 id="version-history-heading">Content version history</h2>
        <p>
          Snapshots are read-only. Restore creates a new version and retains every prior revision.
        </p>
      </div>
      <ol>
        {deck.versions.map((version) => (
          <li key={version.id}>
            <div>
              <strong>Version {String(version.deckVersion)}</strong>
              <Badge>{version.changeKind}</Badge>
              <p>{version.summary || "Content snapshot"}</p>
              <small>
                {version.createdByLabel} · {new Date(version.createdAt).toLocaleString()}
              </small>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setSelected(version.deckVersion)} variant="secondary">
                View diff
              </Button>
              {canRestore && (
                <Button
                  disabled={version.deckVersion === deck.version}
                  onClick={() => void restore(version.deckVersion)}
                  variant="ghost"
                >
                  Restore
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {deck.versions.length === 0 && (
        <p>No snapshots yet. The first content mutation creates one.</p>
      )}
      {message && (
        <p aria-live="polite" className="editor-message">
          {message}
        </p>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={`Version ${String(selected ?? "")}`}
        description="A privacy-safe summary of the stored content snapshot."
      >
        <dl className="version-diff">
          <div>
            <dt>Notes added since this version</dt>
            <dd>{String(selectedVersion?.diffFromCurrent.added ?? 0)}</dd>
          </div>
          <div>
            <dt>Notes removed since this version</dt>
            <dd>{String(selectedVersion?.diffFromCurrent.removed ?? 0)}</dd>
          </div>
          <div>
            <dt>Notes changed since this version</dt>
            <dd>{String(selectedVersion?.diffFromCurrent.changed ?? 0)}</dd>
          </div>
          <div>
            <dt>Scheduling impact</dt>
            <dd>
              Not evaluated in Phase 02. Any prompt, answer, or structural change is recorded for a
              later preserve/relearn/reset decision.
            </dd>
          </div>
        </dl>
      </Dialog>
    </section>
  );
}
