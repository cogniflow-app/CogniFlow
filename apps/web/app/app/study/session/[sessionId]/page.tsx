import type { Metadata } from "next";

import { ReviewSession, StudySessionCompletion } from "@/components/study/review-session.client";
import { requireAccountContext } from "@/lib/server/account-context";
import {
  readReviewCard,
  readStudyDashboard,
  readStudySessionSummary,
} from "@/lib/server/study-repository";

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
    const [summary, dashboard] = await Promise.all([
      readStudySessionSummary(sessionId, account.activeLearner.id),
      readStudyDashboard(account.profile.id, account.activeLearner.id, timezone, studyDayStart),
    ]);
    return (
      <StudySessionCompletion
        summary={summary}
        todayRemaining={dashboard.due + dashboard.learning + dashboard.new}
      />
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
