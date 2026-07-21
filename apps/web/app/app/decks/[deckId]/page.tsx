import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BulkQuickEditor } from "@/components/content/deck-workspace.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";

export const metadata: Metadata = { title: "Deck overview" };

export default async function DeckOverviewPage({
  params,
}: {
  readonly params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}` });
  const deck = await readDeckDetail(deckId, account.profile.id);
  if (!deck) notFound();
  const canEdit = deck.status === "active" && ["owner", "manager", "editor"].includes(deck.role);
  return (
    <div className="grid gap-5">
      <dl className="deck-stat-grid" aria-label="Deck totals">
        <div className="deck-stat">
          <dt>Card entries</dt>
          <dd>{deck.noteCount}</dd>
        </div>
        <div className="deck-stat">
          <dt>Study cards</dt>
          <dd>{deck.cardCount}</dd>
        </div>
        <div className="deck-stat">
          <dt>Card types</dt>
          <dd>{deck.supportedCardTypes.length}</dd>
        </div>
        <div className="deck-stat">
          <dt>Content versions</dt>
          <dd>{deck.versions.length}</dd>
        </div>
      </dl>
      {canEdit && <BulkQuickEditor deckId={deck.id} />}
    </div>
  );
}
