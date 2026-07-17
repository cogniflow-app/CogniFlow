import type { Metadata } from "next";
import Link from "next/link";
import { Badge, LinkButton } from "@lumen/ui";

import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  description: "Published decks owned by the current account.",
  title: "Published decks",
};

export default async function PublishedDecksPage() {
  const account = await requireAccountContext({ returnTo: "/app/published" });
  const snapshot =
    account.activeLearner.kind === "self"
      ? await readLibrarySnapshot(account.profile.id)
      : {
          counts: { activeDecks: 0, archivedDecks: 0, cards: 0, folders: 0, notes: 0 },
          decks: [],
          folders: [],
          recentlyEdited: [],
          truncated: false,
        };
  const publishedDecks = snapshot.decks.filter(
    (deck) => deck.visibility === "public" || deck.visibility === "unlisted",
  );

  return (
    <div className="library-shell">
      <section className="library-hero" aria-labelledby="published-heading">
        <div className="library-hero__copy">
          <span className="text-sm font-extrabold tracking-[0.12em] text-[var(--color-brand)] uppercase">
            Published
          </span>
          <h1 id="published-heading">Published decks</h1>
          <p>Manage the decks you have made public or unlisted from one calm workspace.</p>
        </div>
        <div className="library-actions">
          <LinkButton href="/app" variant="secondary">
            Back to library
          </LinkButton>
        </div>
      </section>

      {publishedDecks.length === 0 ? (
        <section className="library-empty" aria-labelledby="published-empty-heading">
          <div className="library-empty__content">
            <h2 id="published-empty-heading">No published decks yet</h2>
            <p>Publish a deck from the workspace settings page when you are ready to share it.</p>
            <div className="library-actions justify-center">
              <LinkButton href="/app">Open the library</LinkButton>
            </div>
          </div>
        </section>
      ) : (
        <div className="deck-grid" data-view="grid">
          {publishedDecks.map((deck) => (
            <article className="deck-tile" key={deck.id}>
              <div className="deck-tile__top">
                <div className="deck-tile__cover">
                  <span aria-hidden="true" className="deck-tile__mark">
                    {deck.title.trim().slice(0, 1).toUpperCase() || "D"}
                  </span>
                  <Badge tone={deck.visibility === "public" ? "success" : "warning"}>
                    {deck.visibility}
                  </Badge>
                </div>
                <div className="deck-tile__heading">
                  <h3>{deck.title}</h3>
                  <p>{deck.descriptionPlain || "Published deck"}</p>
                </div>
              </div>
              <div className="deck-tile__meta">
                <span>
                  {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                </span>
                <span>{new Date(deck.updatedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {deck.publicSlug && deck.publicId ? (
                  <LinkButton href={`/deck/${deck.publicSlug}`} size="sm">
                    Open player
                  </LinkButton>
                ) : null}
                <LinkButton href={`/app/decks/${deck.id}/settings`} size="sm" variant="secondary">
                  Manage deck
                </LinkButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
