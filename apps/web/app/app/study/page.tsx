import type { Metadata } from "next";

import { StudyDashboard } from "@/components/study/study-dashboard.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readStudyDashboard } from "@/lib/server/study-repository";

export const metadata: Metadata = { title: "Study" };

export default async function StudyPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly deck?: string }>;
}) {
  const { deck: initialDeckId } = await searchParams;
  const account = await requireAccountContext({ returnTo: "/app/study" });
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
  const snapshot = await readStudyDashboard(
    account.profile.id,
    account.activeLearner.id,
    timezone,
    studyDayStart,
  );
  return (
    <StudyDashboard
      initialDeckId={initialDeckId}
      learnerName={account.activeLearner.displayName ?? account.activeLearner.pseudonym}
      snapshot={snapshot}
    />
  );
}
