import type { Metadata } from "next";

import {
  PracticeSession,
  PracticeSessionComplete,
} from "@/components/practice/practice-session.client";
import { PracticeMatchBoard } from "@/components/practice/practice-match-board.client";
import { PracticeTestPaper } from "@/components/practice/practice-test-paper.client";
import { requireAccountContext } from "@/lib/server/account-context";
import {
  readPracticeCard,
  readPracticeCards,
  readPracticeSessionSummary,
} from "@/lib/server/practice-repository";

export const metadata: Metadata = { title: "Practice session" };

export default async function PracticeSessionPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
  readonly searchParams: Promise<{ readonly question?: string }>;
}) {
  const { sessionId } = await params;
  const requestedQuestion = Number.parseInt((await searchParams).question ?? "", 10);
  const requestedPosition =
    Number.isInteger(requestedQuestion) && requestedQuestion > 0
      ? requestedQuestion - 1
      : undefined;
  const account = await requireAccountContext({ returnTo: `/app/practice/session/${sessionId}` });
  const card = await readPracticeCard(
    sessionId,
    account.profile.id,
    account.activeLearner.id,
    requestedPosition,
  );
  if (!card) {
    const summary = await readPracticeSessionSummary(
      sessionId,
      account.profile.id,
      account.activeLearner.id,
    );
    return <PracticeSessionComplete summary={summary} />;
  }
  if (card.session.mode === "match" || card.session.mode === "test") {
    const cards = await readPracticeCards(sessionId, account.profile.id, account.activeLearner.id);
    if (card.session.mode === "match")
      return (
        <PracticeMatchBoard
          cards={cards}
          reducedMotion={account.profile.reducedMotion}
          seriousMode={account.profile.seriousMode}
        />
      );
    return <PracticeTestPaper cards={cards} reducedMotion={account.profile.reducedMotion} />;
  }
  return (
    <PracticeSession
      card={card}
      key={`${card.cardId}:${String(card.item.position)}`}
      reducedMotion={account.profile.reducedMotion}
      seriousMode={account.profile.seriousMode}
    />
  );
}
