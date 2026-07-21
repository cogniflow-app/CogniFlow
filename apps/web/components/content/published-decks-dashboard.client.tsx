"use client";

import {
  Badge,
  Button,
  CopyIcon,
  Dialog,
  ExternalLinkIcon,
  Input,
  LinkButton,
  SearchIcon,
  SegmentedControl,
} from "@lumen/ui";
import { useMemo, useRef, useState } from "react";

import { PendingContentMutations, performContentMutation } from "@/lib/content/client-mutations";
import type { ContentMutationResult, DeckSummary } from "@/lib/content/view-models";

type PublicationFilter = "all" | "public" | "unlisted";

export function PublishedDecksDashboard({
  initialDecks,
}: {
  readonly initialDecks: readonly DeckSummary[];
}) {
  const [decks, setDecks] = useState(initialDecks);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PublicationFilter>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDeck, setPendingDeck] = useState<DeckSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pendingMutations = useRef(new PendingContentMutations());

  const visibleDecks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return decks.filter((deck) => {
      const matchesFilter = filter === "all" || deck.visibility === filter;
      const matchesSearch =
        !normalized ||
        deck.title.toLocaleLowerCase().includes(normalized) ||
        deck.descriptionPlain.toLocaleLowerCase().includes(normalized);
      return matchesFilter && matchesSearch;
    });
  }, [decks, filter, query]);

  async function copyLink(deck: DeckSummary) {
    if (!deck.publicSlug) return;
    const url = new URL(`/deck/${deck.publicSlug}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(deck.id);
      setMessage(`Link copied for ${deck.title}.`);
      window.setTimeout(() => setCopiedId((id) => (id === deck.id ? null : id)), 1_800);
    } catch {
      setMessage("The link could not be copied. Open the player and copy it from your browser.");
    }
  }

  async function unpublish() {
    if (!pendingDeck) return;
    setBusy(true);
    setMessage(null);
    try {
      await performContentMutation<ContentMutationResult<DeckSummary>>({
        body: { action: "unpublish", expectedVersion: pendingDeck.version },
        fallbackMessage: "The deck could not be unpublished.",
        operation: `published:unpublish:${pendingDeck.id}`,
        pending: pendingMutations.current,
        url: `/api/content/decks/${pendingDeck.id}`,
      });
      setDecks((current) => current.filter((deck) => deck.id !== pendingDeck.id));
      setMessage(`${pendingDeck.title} is now private.`);
      setPendingDeck(null);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The deck could not be unpublished.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="library-shell published-library">
      <header className="library-hero">
        <div className="library-hero__copy">
          <h1>Published</h1>
          <p>Open players, copy links, and manage shared decks.</p>
        </div>
        <LinkButton href="/app" variant="secondary">
          Back to library
        </LinkButton>
      </header>

      {decks.length === 0 ? (
        <section className="library-empty" aria-labelledby="published-empty-heading">
          <div className="library-empty__content">
            <h2 id="published-empty-heading">No published decks</h2>
            <p>Publish a deck when you’re ready to share it.</p>
            <LinkButton href="/app">Open library</LinkButton>
          </div>
        </section>
      ) : (
        <>
          <div className="published-toolbar" role="search" aria-label="Filter published decks">
            <label className="library-search">
              <span aria-hidden="true">
                <SearchIcon />
              </span>
              <span className="visually-hidden">Search published decks</span>
              <Input
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search published decks"
                type="search"
                value={query}
              />
            </label>
            <SegmentedControl
              label="Publication visibility"
              onValueChange={(value) => setFilter(value as PublicationFilter)}
              options={[
                { label: "All", value: "all" },
                { label: "Public", value: "public" },
                { label: "Unlisted", value: "unlisted" },
              ]}
              value={filter}
            />
          </div>

          <div className="published-results-heading">
            <h2>Shared decks</h2>
            <span>
              {visibleDecks.length} {visibleDecks.length === 1 ? "deck" : "decks"}
            </span>
          </div>

          {visibleDecks.length > 0 ? (
            <div className="deck-grid published-deck-grid" data-view="grid">
              {visibleDecks.map((deck) => (
                <article
                  className="deck-tile published-deck-card"
                  data-visibility={deck.visibility}
                  key={deck.id}
                >
                  <div className="published-deck-card__cover" aria-hidden="true">
                    <span>{deck.title.trim().slice(0, 1).toUpperCase() || "D"}</span>
                  </div>
                  <div className="published-deck-card__body">
                    <div className="published-deck-card__heading">
                      <h3>{deck.title}</h3>
                      <Badge tone={deck.visibility === "public" ? "success" : "warning"}>
                        {deck.visibility}
                      </Badge>
                    </div>
                    <p>{deck.descriptionPlain || "Published deck"}</p>
                    <div className="deck-tile__meta">
                      <span>
                        {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                      </span>
                      <span>Updated {new Date(deck.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="published-deck-card__actions">
                      {deck.publicSlug && deck.publicId && (
                        <LinkButton
                          href={`/deck/${deck.publicSlug}`}
                          leadingIcon={<ExternalLinkIcon />}
                          size="sm"
                        >
                          Open player
                        </LinkButton>
                      )}
                      <Button
                        disabled={!deck.publicSlug}
                        leadingIcon={<CopyIcon />}
                        onClick={() => void copyLink(deck)}
                        size="sm"
                        variant="secondary"
                      >
                        {copiedId === deck.id ? "Copied" : "Copy link"}
                      </Button>
                      <LinkButton href={`/app/decks/${deck.id}/settings`} size="sm" variant="ghost">
                        Manage
                      </LinkButton>
                      <Button onClick={() => setPendingDeck(deck)} size="sm" variant="ghost">
                        Unpublish
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="published-filter-empty">
              <p>No decks match these filters.</p>
            </div>
          )}
        </>
      )}

      {message && (
        <p className="published-toast" aria-live="polite">
          {message}
        </p>
      )}

      <Dialog
        description="The public link will stop working. Your deck and notes stay in your library."
        footer={
          <>
            <Button disabled={busy} onClick={() => setPendingDeck(null)} variant="secondary">
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void unpublish()} variant="danger">
              Unpublish
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !busy) setPendingDeck(null);
        }}
        open={Boolean(pendingDeck)}
        title={`Unpublish ${pendingDeck?.title ?? "deck"}?`}
      >
        <p>You can publish it again later from deck settings.</p>
      </Dialog>
    </div>
  );
}
