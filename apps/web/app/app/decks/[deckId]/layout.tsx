import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { DeckCommandBar } from "@/components/content/deck-workspace.client";
import { DeckNavigation } from "@/components/content/deck-navigation.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";

export default async function DeckLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ deckId: string }> }>) {
  const { deckId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}` });
  const deck = await readDeckDetail(deckId, account.profile.id);
  if (!deck) notFound();
  return (
    <div className="deck-shell">
      <header className="deck-titlebar">
        <div>
          <ol aria-label="Breadcrumb" className="breadcrumb-list">
            <li>
              <a href="/app">Library</a>
            </li>
            <li aria-current="page">{deck.title}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{deck.title}</h1>
            <span className="deck-visibility">{deck.visibility}</span>
          </div>
          <p>{deck.descriptionPlain || "Add a description from deck settings."}</p>
        </div>
      </header>
      <DeckCommandBar key={`${deck.id}:${String(deck.version)}`} deck={deck} />
      <DeckNavigation deck={deck} />
      {children}
    </div>
  );
}
