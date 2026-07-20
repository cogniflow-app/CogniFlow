"use client";

import {
  Badge,
  Button,
  Dialog,
  Dropdown,
  FolderIcon,
  FormField,
  GridIcon,
  IconButton,
  Input,
  LinkButton,
  ListIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SegmentedControl,
  Select,
  Tooltip,
} from "@lumen/ui";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
type LibraryFilterMode = "all" | "recent" | "published" | "archived";

function DeckTile({ deck, view }: { readonly deck: DeckSummary; readonly view: LibraryView }) {
  const accent =
    deck.visibility === "public"
      ? "success"
      : deck.visibility === "unlisted"
        ? "warning"
        : "neutral";
  return (
    <article className="deck-tile">
      <div className="deck-tile__top">
        <div className="deck-tile__cover">
          <span aria-hidden="true" className="deck-tile__mark">
            {deck.title.trim().slice(0, 1).toUpperCase() || "D"}
          </span>
          <Badge tone={accent}>{deck.visibility}</Badge>
        </div>
        <div className="deck-tile__heading">
          <h3>
            <a href={`/app/decks/${deck.id}`}>{deck.title}</a>
          </h3>
          <p>{deck.descriptionPlain || "Open to add the first note."}</p>
        </div>
        <Dropdown
          label={`Actions for ${deck.title}`}
          items={[
            {
              label: "Open deck",
              onSelect: () => window.location.assign(`/app/decks/${deck.id}`),
            },
            ...(deck.publicSlug
              ? [
                  {
                    label: "Open public player",
                    onSelect: () => window.location.assign(`/deck/${deck.publicSlug}`),
                  },
                ]
              : []),
          ]}
          trigger={
            <IconButton label={`Actions for ${deck.title}`} size="sm" variant="ghost">
              <MoreIcon />
            </IconButton>
          }
        />
      </div>
      <div className="deck-tile__meta">
        <span>
          {deck.noteCount} {deck.noteCount === 1 ? "note" : "notes"}
        </span>
        <span>
          {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
        </span>
        {view === "list" && <span>Edited {new Date(deck.updatedAt).toLocaleDateString()}</span>}
      </div>
    </article>
  );
}

function EmptyLibrary({ onCreateFolder }: { readonly onCreateFolder: () => void }) {
  return (
    <section className="library-empty" aria-labelledby="empty-library-heading">
      <div className="library-empty__content">
        <span aria-hidden="true" className="library-empty__icon">
          <FolderIcon />
        </span>
        <h2 id="empty-library-heading">Create your first deck</h2>
        <p>Start with a subject you want to remember.</p>
        <div className="library-actions justify-center">
          <LinkButton
            className="product-primary-action"
            href="/app/decks/new"
            leadingIcon={<PlusIcon />}
          >
            New deck
          </LinkButton>
          <Button onClick={onCreateFolder} variant="ghost">
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
  const decks = snapshot.decks;
  const [folders, setFolders] = useState(snapshot.folders);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<LibraryView>("grid");
  const [filterMode, setFilterMode] = useState<LibraryFilterMode>("recent");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
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
    const filtered = decks.filter((deck) => {
      const matchesQuery =
        !normalized ||
        deck.title.toLocaleLowerCase().includes(normalized) ||
        deck.descriptionPlain.toLocaleLowerCase().includes(normalized);
      const matchesFolder = selectedFolder === null || deck.folderId === selectedFolder;
      const matchesFilter =
        filterMode === "archived"
          ? deck.status === "archived"
          : filterMode === "published"
            ? deck.visibility === "public" || deck.visibility === "unlisted"
            : filterMode === "recent"
              ? deck.status === "active"
              : true;
      return matchesQuery && matchesFolder && matchesFilter;
    });
    return filterMode === "recent"
      ? filtered.filter((deck) => deck.status === "active").slice(0, 200)
      : filtered;
  }, [decks, filterMode, query, selectedFolder]);

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
  const publishedDeckCount = decks.filter(
    (deck) => deck.visibility === "public" || deck.visibility === "unlisted",
  ).length;
  const totalDecks = snapshot.counts.activeDecks + snapshot.counts.archivedDecks;
  const deckListTruncated = decks.length < totalDecks;
  const folderListTruncated = folders.length < snapshot.counts.folders;
  const filterHeading =
    filterMode === "recent"
      ? "Recent decks"
      : filterMode === "published"
        ? "Published decks"
        : filterMode === "archived"
          ? "Archived decks"
          : "All decks";
  return (
    <div className="library-shell">
      <section className="library-hero" aria-labelledby="library-heading">
        <div className="library-hero__copy">
          <h1 id="library-heading">Library</h1>
          <p>Welcome back, {learnerName}.</p>
        </div>
        {canCreate && hasAnyDecks && (
          <div className="library-actions">
            <LinkButton
              className="product-primary-action"
              href="/app/decks/new"
              leadingIcon={<PlusIcon />}
            >
              New deck
            </LinkButton>
            <Button onClick={() => setFolderDialogOpen(true)} variant="secondary">
              New folder
            </Button>
          </div>
        )}
      </section>

      {hasAnyDecks && (
        <p className="library-summary" aria-label="Library totals">
          <span>
            {snapshot.counts.activeDecks} {snapshot.counts.activeDecks === 1 ? "deck" : "decks"}
          </span>
          <span>
            {snapshot.counts.notes} {snapshot.counts.notes === 1 ? "note" : "notes"}
          </span>
          <span>
            {snapshot.counts.cards} {snapshot.counts.cards === 1 ? "card" : "cards"}
          </span>
          {publishedDeckCount > 0 && <a href="/app/published">{publishedDeckCount} published</a>}
        </p>
      )}

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
        <EmptyLibrary onCreateFolder={() => setFolderDialogOpen(true)} />
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
              <span aria-hidden="true">
                <SearchIcon />
              </span>
              <span className="visually-hidden">Search decks</span>
              <Input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search decks"
                type="search"
                value={query}
              />
            </label>
            <SegmentedControl
              className="library-filter-tabs"
              label="Library filters"
              onValueChange={(value) => setFilterMode(value as LibraryFilterMode)}
              options={[
                { label: "All", value: "all" },
                { label: "Recent", value: "recent" },
                { label: "Published", value: "published" },
                { label: "Archived", value: "archived" },
              ]}
              value={filterMode}
            />
            <div className="library-toolbar__actions">
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
                <Tooltip content="Grid view">
                  <IconButton
                    label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                    size="sm"
                    variant="ghost"
                  >
                    <GridIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip content="List view">
                  <IconButton
                    label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                    size="sm"
                    variant="ghost"
                  >
                    <ListIcon />
                  </IconButton>
                </Tooltip>
              </div>
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
                      <span className={folder.parentId ? "folder-tree__child" : undefined}>
                        {folder.name}
                      </span>
                      <small>{folder.deckCount}</small>
                    </button>
                    {canCreate && (
                      <IconButton
                        label={`Manage ${folder.name}`}
                        className="folder-manage-button"
                        onClick={() => {
                          setError(null);
                          setManagedFolder(folder);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <MoreIcon />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            </aside>

            <section className="library-content" aria-labelledby="decks-heading">
              <div className="library-results-heading">
                <div>
                  <h2 id="decks-heading">
                    {selectedFolder
                      ? (folders.find((folder) => folder.id === selectedFolder)?.name ?? "Folder")
                      : filterHeading}
                  </h2>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {visibleDecks.length} {visibleDecks.length === 1 ? "result" : "results"}
                  </span>
                </div>
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
                  {canCreate && <LinkButton href="/app/decks/new">New deck</LinkButton>}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {canCreate && managedFolder && (
        <Dialog
          description="Rename or move the folder without changing its deck contents."
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
          description="Groups help keep the library tidy."
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
