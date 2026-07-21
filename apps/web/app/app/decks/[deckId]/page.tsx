import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BulkQuickEditor } from "@/components/content/deck-workspace.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";
import { readStudyDashboard } from "@/lib/server/study-repository";

export const metadata: Metadata = { title: "Deck overview" };

export default async function DeckOverviewPage({
  params,
}: {
  readonly params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}` });
  const learnerSettings = account.activeLearner.settings;
  const timezone =
    account.activeLearner.kind === "self"
      ? account.profile.timezone
      : typeof learnerSettings.timezone === "string"
        ? learnerSettings.timezone
        : "UTC";
  const studyDayStart =
    account.activeLearner.kind === "self"
      ? account.profile.studyDayStart
      : typeof learnerSettings.studyDayStart === "number"
        ? learnerSettings.studyDayStart
        : 240;
  const [deck, dashboard] = await Promise.all([
    readDeckDetail(deckId, account.profile.id),
    readStudyDashboard(account.profile.id, account.activeLearner.id, timezone, studyDayStart),
  ]);
  if (!deck) notFound();
  const study = dashboard.decks.find((item) => item.deckId === deck.id);
  const canEdit = deck.status === "active" && ["owner", "manager", "editor"].includes(deck.role);
  return (
    <div className="deck-overview">
      <section className="deck-overview__summary" aria-labelledby="deck-summary-heading">
        <div>
          <p className="eyebrow">At a glance</p>
          <h2 id="deck-summary-heading">{deck.title}</h2>
          <p>
            {(study?.due ?? 0) + (study?.learning ?? 0) + (study?.new ?? 0)} cards ready to study.
          </p>
        </div>
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
            <dt>Due</dt>
            <dd>{study?.due ?? 0}</dd>
          </div>
          <div className="deck-stat">
            <dt>New</dt>
            <dd>{study?.new ?? deck.cardCount}</dd>
          </div>
          <div className="deck-stat">
            <dt>Learning</dt>
            <dd>{study?.learning ?? 0}</dd>
          </div>
        </dl>
        <div className="deck-type-chips" aria-label="Card types in this deck">
          {deck.supportedCardTypes.map((type) => (
            <span key={type}>{type.replaceAll("_", " ")}</span>
          ))}
        </div>
      </section>
      {canEdit && (
        <details className="deck-quick-add">
          <summary>Quick add basic cards</summary>
          <BulkQuickEditor deckId={deck.id} />
        </details>
      )}
    </div>
  );
}
