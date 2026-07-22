import type { Metadata } from "next";

import { ReviewSession } from "@/components/study/review-session.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readReviewCard } from "@/lib/server/study-repository";

export const metadata: Metadata = { title: "Review session" };

export default async function ReviewSessionPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/study/session/${sessionId}` });
  const card = await readReviewCard(sessionId, account.profile.id, account.activeLearner.id);
  if (!card) {
    return (
      <section aria-labelledby="complete-heading" className="study-complete">
        <p className="eyebrow">Session complete</p>
        <h1 id="complete-heading">Nice work.</h1>
        <p>
          There are no more cards in this queue. Your canonical reviews and time are reflected in
          Statistics.
        </p>
        <div>
          <a className="button" href="/app/study">
            Back to Study
          </a>
          <a className="button button--secondary" href="/app/stats">
            View statistics
          </a>
        </div>
      </section>
    );
  }
  return (
    <ReviewSession
      card={card}
      key={card.cardId}
      reducedMotion={account.profile.reducedMotion}
      seriousMode={account.profile.seriousMode}
    />
  );
}
