import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NoteCardBrowser } from "@/components/content/deck-workspace.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail, readLibrarySnapshot } from "@/lib/server/content-repository";

export const metadata: Metadata = { title: "Notes and cards" };

export default async function CardsPage({
  params,
}: {
  readonly params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}/cards` });
  const [deck, library] = await Promise.all([
    readDeckDetail(deckId, account.profile.id),
    readLibrarySnapshot(account.profile.id),
  ]);
  if (!deck) notFound();
  const editableTargetDecks = library.decks
    .filter(
      (target) =>
        target.id !== deck.id &&
        target.status === "active" &&
        (target.role === "owner" || target.role === "manager" || target.role === "editor"),
    )
    .map(({ id, title }) => ({ id, title }));
  return <NoteCardBrowser deck={deck} editableTargetDecks={editableTargetDecks} />;
}
