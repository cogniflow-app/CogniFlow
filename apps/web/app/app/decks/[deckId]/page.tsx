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
    <div className="grid gap-5">
      <div className="deck-study-action">
        <div>
          <p className="eyebrow">Long-term memory</p>
          <h2>{(study?.due ?? 0) + (study?.learning ?? 0) + (study?.new ?? 0)} cards available</h2>
          <p>
            Real counts for the active learner profile. Public preview never changes this schedule.
          </p>
        </div>
        <a className="button" href={`/app/study?deck=${deck.id}`}>
          Study this deck
        </a>
      </div>
      <dl className="deck-stat-grid" aria-label="Deck totals">
        <div className="deck-stat">
          <dt>New</dt>
          <dd>{study?.new ?? deck.cardCount}</dd>
        </div>
        <div className="deck-stat">
          <dt>Learning</dt>
          <dd>{study?.learning ?? 0}</dd>
        </div>
        <div className="deck-stat">
          <dt>Due</dt>
          <dd>{study?.due ?? 0}</dd>
        </div>
        <div className="deck-stat">
          <dt>Active cards</dt>
          <dd>{study?.total ?? deck.cardCount}</dd>
        </div>
      </dl>
      {canEdit && <BulkQuickEditor deckId={deck.id} />}
    </div>
  );
}
