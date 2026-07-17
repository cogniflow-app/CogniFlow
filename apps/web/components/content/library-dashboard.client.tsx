"use client";

import { Badge, Button, Dialog, FormField, Input, LinkButton, Select } from "@lumen/ui";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import type {
  ContentMutationResult,
  DeckSummary,
  FolderSummary,
  LibrarySnapshot,
} from "@/lib/content/view-models";
import {
  conflictRecoveryMessage,
  ContentApiRequestError,
  PendingContentMutations,
  performContentMutation,
} from "@/lib/content/client-mutations";

type LibraryView = "grid" | "list";
type StatusFilter = "active" | "all" | "archived";

function DeckTile({ deck, view }: { readonly deck: DeckSummary; readonly view: LibraryView }) {
  return (
    <a className="deck-tile" href={`/app/decks/${deck.id}`}>
      <div>
        <span aria-hidden="true" className="deck-tile__mark">
          {deck.title.trim().slice(0, 1).toUpperCase() || "D"}
        </span>
        <h3>{deck.title}</h3>
        <p>{deck.descriptionPlain || "No description yet."}</p>
      </div>
      <div className="deck-tile__meta">
        <span>
          {deck.noteCount} {deck.noteCount === 1 ? "note" : "notes"}
        </span>
        <span>
          {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
        </span>
        <Badge tone={deck.visibility === "public" ? "success" : "neutral"}>{deck.visibility}</Badge>
        {view === "list" && <span>Edited {new Date(deck.updatedAt).toLocaleDateString()}</span>}
      </div>
    </a>
  );
}

function EmptyLibrary({
  onCreateDeck,
  onCreateFolder,
}: {
  readonly onCreateDeck: () => void;
  readonly onCreateFolder: () => void;
}) {
  return (
    <section className="library-empty" aria-labelledby="empty-library-heading">
      <div className="library-empty__content">
        <span aria-hidden="true" className="library-empty__icon">
          ◫
        </span>
        <h2 id="empty-library-heading">Create your first deck</h2>
        <p>
          A deck is an organized collection of notes. Each note can generate one or more sibling
          cards, so you can recall the same idea in the directions and formats that make sense.
        </p>
        <ol className="library-empty__steps">
          <li>
            <strong>1</strong>
            <span>Name a deck for one subject, course, or goal.</span>
          </li>
          <li>
            <strong>2</strong>
            <span>
              Pick a card type—from a simple front and back to cloze, diagram, audio, or drawing.
            </span>
          </li>
          <li>
            <strong>3</strong>
            <span>Write the note once and preview every generated sibling before saving.</span>
          </li>
        </ol>
        <div className="library-actions justify-center">
          <Button onClick={onCreateDeck}>Create deck</Button>
          <Button onClick={onCreateFolder} variant="secondary">
            Create folder
          </Button>
        </div>
      </div>
    </section>
  );
}

function LibraryMutationError({
  error,
  onReload,
}: {
  readonly error: Error | null;
  readonly onReload: () => void;
}) {
  if (!error) return null;
  const conflict = error instanceof ContentApiRequestError && error.code === "CONFLICT";
  return (
    <div className="grid gap-2" role="alert">
      <p className="m-0 text-sm text-[var(--color-danger)]">{error.message}</p>
      {conflict && (
        <Button onClick={onReload} size="sm" variant="secondary">
          Reload current library
        </Button>
      )}
    </div>
  );
}

export function LibraryDashboard({
  canCreate,
  learnerName,
  snapshot,
}: {
  readonly canCreate: boolean;
  readonly learnerName: string;
  readonly snapshot: LibrarySnapshot;
}) {
  const router = useRouter();
  const [decks, setDecks] = useState(snapshot.decks);
  const [folders, setFolders] = useState(snapshot.folders);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [view, setView] = useState<LibraryView>("grid");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [deckDialogOpen, setDeckDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [managedFolder, setManagedFolder] = useState<FolderSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pendingMutations = useRef(new PendingContentMutations());

  function mutationError(caught: unknown, fallback: string, resource: string): void {
    setError(
      caught instanceof ContentApiRequestError && caught.code === "CONFLICT"
        ? new ContentApiRequestError(
            { ...caught, message: conflictRecoveryMessage(caught, resource) },
            fallback,
          )
        : caught instanceof Error
          ? caught
          : new Error(fallback),
    );
  }

  const visibleDecks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return decks.filter((deck) => {
      const matchesQuery =
        !normalized ||
        deck.title.toLocaleLowerCase().includes(normalized) ||
        deck.descriptionPlain.toLocaleLowerCase().includes(normalized);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && deck.status === "active") ||
        (statusFilter === "archived" && deck.status === "archived");
      const matchesFolder = selectedFolder === null || deck.folderId === selectedFolder;
      return matchesQuery && matchesStatus && matchesFolder;
    });
  }, [decks, query, selectedFolder, statusFilter]);

  async function createDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const command = {
      description: String(form.get("description") ?? ""),
      folderId:
        form.get("folderId") === "none" || !form.get("folderId") ? null : form.get("folderId"),
      title: String(form.get("title") ?? ""),
      visibility: "private",
    } as const;
    try {
      const result = await performContentMutation<ContentMutationResult<DeckSummary>>({
        body: command,
        fallbackMessage: "The deck could not be created.",
        method: "POST",
        operation: "library:create-deck",
        pending: pendingMutations.current,
        url: "/api/content/decks",
      });
      setDecks((current) => [result.data, ...current]);
      setDeckDialogOpen(false);
      router.push(`/app/decks/${result.data.id}/edit` as Route);
    } catch (caught) {
      mutationError(caught, "The deck could not be created.", "This library");
    } finally {
      setSubmitting(false);
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const command = {
      name: String(form.get("name") ?? ""),
      parentId:
        form.get("parentId") === "none" || !form.get("parentId") ? null : form.get("parentId"),
    } as const;
    try {
      const result = await performContentMutation<ContentMutationResult<FolderSummary>>({
        body: command,
        fallbackMessage: "The folder could not be created.",
        method: "POST",
        operation: "library:create-folder",
        pending: pendingMutations.current,
        url: "/api/content/folders",
      });
      setFolders((current) => [...current, result.data]);
      setFolderDialogOpen(false);
      setSelectedFolder(result.data.id);
      router.refresh();
    } catch (caught) {
      mutationError(caught, "The folder could not be created.", "This folder");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managedFolder) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const command = {
      expectedVersion: managedFolder.version,
      name: String(form.get("name") ?? ""),
      parentId: form.get("parentId") === "none" ? null : form.get("parentId"),
    } as const;
    try {
      const result = await performContentMutation<ContentMutationResult<FolderSummary>>({
        body: command,
        fallbackMessage: "The folder could not be updated.",
        operation: `library:update-folder:${managedFolder.id}`,
        pending: pendingMutations.current,
        url: `/api/content/folders/${managedFolder.id}`,
      });
      setFolders((current) =>
        current.map((folder) =>
          folder.id === result.data.id ? { ...result.data, deckCount: folder.deckCount } : folder,
        ),
      );
      setManagedFolder(null);
      router.refresh();
    } catch (caught) {
      mutationError(caught, "The folder could not be updated.", "This folder");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteFolder() {
    if (!managedFolder) return;
    setSubmitting(true);
    setError(null);
    try {
      await performContentMutation<{ readonly data: { readonly id: string } }>({
        body: { expectedVersion: managedFolder.version },
        fallbackMessage: "The folder could not be deleted.",
        method: "DELETE",
        operation: `library:delete-folder:${managedFolder.id}`,
        pending: pendingMutations.current,
        url: `/api/content/folders/${managedFolder.id}`,
      });
      setFolders((current) => current.filter((folder) => folder.id !== managedFolder.id));
      if (selectedFolder === managedFolder.id) setSelectedFolder(null);
      setManagedFolder(null);
      router.refresh();
    } catch (caught) {
      mutationError(caught, "The folder could not be deleted.", "This folder");
    } finally {
      setSubmitting(false);
    }
  }

  const hasAnyDecks = decks.length > 0;
  const totalDecks = snapshot.counts.activeDecks + snapshot.counts.archivedDecks;
  const deckListTruncated = decks.length < totalDecks;
  const folderListTruncated = folders.length < snapshot.counts.folders;
  return (
    <div className="library-shell">
      <section className="library-hero" aria-labelledby="library-heading">
        <div className="library-hero__copy">
          <span className="text-sm font-extrabold tracking-[0.12em] text-[var(--color-brand)] uppercase">
            Your library
          </span>
          <h1 id="library-heading">
            {hasAnyDecks
              ? `Welcome back, ${learnerName}.`
              : `A clear place to build, ${learnerName}.`}
          </h1>
          <p>
            Create notes once, generate the cards each idea needs, and keep every draft, sibling,
            and revision organized. Everything shown here comes from your saved decks, folders,
            notes, generated siblings, and recent edits.
          </p>
        </div>
        {canCreate && (
          <div className="library-actions">
            <Button onClick={() => setDeckDialogOpen(true)}>Create deck</Button>
            <Button onClick={() => setFolderDialogOpen(true)} variant="secondary">
              New folder
            </Button>
          </div>
        )}
      </section>

      <section className="library-metrics" aria-label="Library totals">
        {[
          ["Decks", snapshot.counts.activeDecks],
          ["Notes", snapshot.counts.notes],
          ["Generated cards", snapshot.counts.cards],
          ["Folders", snapshot.counts.folders],
          ["Archived", snapshot.counts.archivedDecks],
        ].map(([label, value]) => (
          <div className="library-metric" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      {snapshot.truncated && (
        <p className="library-query-notice" role="status">
          {deckListTruncated &&
            `Showing most recently edited ${String(decks.length)} of ${String(totalDecks)} decks.`}
          {deckListTruncated && folderListTruncated ? " " : ""}
          {folderListTruncated &&
            `Showing the first ${String(folders.length)} of ${String(snapshot.counts.folders)} folders.`}
        </p>
      )}

      {!hasAnyDecks && canCreate ? (
        <EmptyLibrary
          onCreateDeck={() => setDeckDialogOpen(true)}
          onCreateFolder={() => setFolderDialogOpen(true)}
        />
      ) : !hasAnyDecks ? (
        <section className="library-empty" aria-labelledby="managed-library-heading">
          <div className="library-empty__content">
            <h2 id="managed-library-heading">No decks are available in this learner profile</h2>
            <p>
              A guardian or educator can make authorized content available without exposing their
              account settings in this managed session.
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className="library-toolbar" role="search" aria-label="Filter your library">
            <label className="library-search">
              <span aria-hidden="true">⌕</span>
              <span className="visually-hidden">Search decks</span>
              <Input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles and descriptions"
                type="search"
                value={query}
              />
            </label>
            <Select
              aria-label="Content status"
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              options={[
                { label: "Active decks", value: "active" },
                { label: "All content", value: "all" },
                { label: "Archived decks", value: "archived" },
              ]}
              value={statusFilter}
            />
            <Select
              aria-label="Folder filter"
              onValueChange={(value) => setSelectedFolder(value === "all" ? null : value)}
              options={[
                { label: "Every folder", value: "all" },
                ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
              ]}
              value={selectedFolder ?? "all"}
            />
            <div className="view-toggle" role="group" aria-label="Deck presentation">
              <button
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                type="button"
              >
                ▦
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                type="button"
              >
                ☷
              </button>
            </div>
          </div>

          <div className="library-layout">
            <aside className="folder-panel" aria-labelledby="folders-heading">
              <div className="folder-panel__header">
                <h2 id="folders-heading">Folders</h2>
                {canCreate && (
                  <Button onClick={() => setFolderDialogOpen(true)} size="sm" variant="ghost">
                    Add
                  </Button>
                )}
              </div>
              <ul className="folder-tree">
                <li>
                  <button
                    aria-current={selectedFolder === null ? "page" : undefined}
                    onClick={() => setSelectedFolder(null)}
                    type="button"
                  >
                    <span>All decks</span>
                    <small>{decks.length}</small>
                  </button>
                </li>
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      aria-current={selectedFolder === folder.id ? "page" : undefined}
                      onClick={() => setSelectedFolder(folder.id)}
                      style={{ paddingInlineStart: folder.parentId ? "1.4rem" : undefined }}
                      type="button"
                    >
                      <span>{folder.parentId ? `↳ ${folder.name}` : folder.name}</span>
                      <small>{folder.deckCount}</small>
                    </button>
                    {canCreate && (
                      <button
                        aria-label={`Manage ${folder.name}`}
                        className="folder-manage-button"
                        onClick={() => {
                          setError(null);
                          setManagedFolder(folder);
                        }}
                        type="button"
                      >
                        •••
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </aside>

            <section className="library-content" aria-labelledby="decks-heading">
              <div className="section-heading">
                <div>
                  <h2 id="decks-heading">
                    {selectedFolder
                      ? (folders.find((folder) => folder.id === selectedFolder)?.name ?? "Folder")
                      : "All decks"}
                  </h2>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {visibleDecks.length} {visibleDecks.length === 1 ? "result" : "results"}
                  </span>
                </div>
                {canCreate && (
                  <LinkButton href="/app/decks/new" size="sm" variant="secondary">
                    Choose a card type
                  </LinkButton>
                )}
              </div>
              {visibleDecks.length > 0 ? (
                <div className="deck-grid" data-view={view}>
                  {visibleDecks.map((deck) => (
                    <DeckTile deck={deck} key={deck.id} view={view} />
                  ))}
                </div>
              ) : (
                <div className="deck-panel mt-4 text-center">
                  <h3 className="m-0">No decks match this view</h3>
                  <p className="text-[var(--color-text-muted)]">
                    Clear a filter, search another phrase, or create a deck here.
                  </p>
                  {canCreate && (
                    <Button onClick={() => setDeckDialogOpen(true)}>Create deck</Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {canCreate && (
        <Dialog
          description="Start private. You can publish deliberately from deck settings after adding content."
          onOpenChange={(open) => {
            setDeckDialogOpen(open);
            if (open) setError(null);
          }}
          open={deckDialogOpen}
          title="Create a deck"
        >
          <form className="form-stack" onSubmit={createDeck}>
            <FormField label="Deck title" required>
              <Input autoFocus maxLength={120} name="title" required />
            </FormField>
            <FormField
              label="Description"
              description="A short scope statement helps keep notes focused."
            >
              <Input maxLength={500} name="description" />
            </FormField>
            <FormField label="Folder">
              <Select
                name="folderId"
                options={[
                  { label: "No folder", value: "none" },
                  ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
                ]}
                defaultValue={selectedFolder ?? "none"}
              />
            </FormField>
            <LibraryMutationError error={error} onReload={() => window.location.reload()} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setDeckDialogOpen(false)} variant="ghost">
                Cancel
              </Button>
              <Button loading={submitting} loadingLabel="Creating deck" type="submit">
                Create and add notes
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {canCreate && managedFolder && (
        <Dialog
          description="Rename this folder or move it inside another folder. Cycles are rejected at the database boundary."
          onOpenChange={(open) => {
            if (!open) setManagedFolder(null);
          }}
          open
          title={`Manage ${managedFolder.name}`}
        >
          <form className="form-stack" onSubmit={updateFolder}>
            <FormField label="Folder name" required>
              <Input defaultValue={managedFolder.name} maxLength={120} name="name" required />
            </FormField>
            <FormField label="Place inside">
              <Select
                defaultValue={managedFolder.parentId ?? "none"}
                name="parentId"
                options={[
                  { label: "Top level", value: "none" },
                  ...folders
                    .filter((folder) => folder.id !== managedFolder.id)
                    .map((folder) => ({ label: folder.name, value: folder.id })),
                ]}
              />
            </FormField>
            <LibraryMutationError error={error} onReload={() => window.location.reload()} />
            <div className="flex flex-wrap justify-between gap-2">
              <Button loading={submitting} onClick={() => void deleteFolder()} variant="danger">
                Delete folder
              </Button>
              <div className="flex gap-2">
                <Button onClick={() => setManagedFolder(null)} variant="ghost">
                  Cancel
                </Button>
                <Button loading={submitting} type="submit">
                  Save folder
                </Button>
              </div>
            </div>
          </form>
        </Dialog>
      )}

      {canCreate && (
        <Dialog
          description="Folders organize content without changing the notes or cards inside a deck."
          onOpenChange={(open) => {
            setFolderDialogOpen(open);
            if (open) setError(null);
          }}
          open={folderDialogOpen}
          title="Create a folder"
        >
          <form className="form-stack" onSubmit={createFolder}>
            <FormField label="Folder name" required>
              <Input autoFocus maxLength={80} name="name" required />
            </FormField>
            <FormField label="Place inside">
              <Select
                name="parentId"
                options={[
                  { label: "Top level", value: "none" },
                  ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
                ]}
                defaultValue="none"
              />
            </FormField>
            <LibraryMutationError error={error} onReload={() => window.location.reload()} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setFolderDialogOpen(false)} variant="ghost">
                Cancel
              </Button>
              <Button loading={submitting} loadingLabel="Creating folder" type="submit">
                Create folder
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
