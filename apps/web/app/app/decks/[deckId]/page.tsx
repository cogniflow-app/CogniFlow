import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@lumen/ui";

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
      <section className="deck-stat-grid" aria-label="Deck totals">
        <div>
          <strong>{deck.noteCount}</strong>
          <span>Notes</span>
        </div>
        <div>
          <strong>{deck.cardCount}</strong>
          <span>Generated cards</span>
        </div>
        <div>
          <strong>{deck.supportedCardTypes.length}</strong>
          <span>Card types</span>
        </div>
        <div>
          <strong>{deck.versions.length}</strong>
          <span>Content versions</span>
        </div>
      </section>
      <section className="deck-panel">
        <div className="section-heading">
          <div>
            <h2>Card-type mix</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {deck.supportedCardTypes.length ? (
            deck.supportedCardTypes.map((type) => (
              <Badge key={type} tone="info">
                {type.replaceAll("_", " ")}
              </Badge>
            ))
          ) : (
            <p>No notes yet.</p>
          )}
        </div>
      </section>
      {canEdit && <BulkQuickEditor deckId={deck.id} />}
    </div>
  );
}
