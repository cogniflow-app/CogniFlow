import type { Metadata } from "next";

import { ExamPlanner } from "@/components/practice/exam-planner.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readStudyDashboard } from "@/lib/server/study-repository";

export const metadata: Metadata = { title: "Exam planning" };

export default async function ExamPlanningPage() {
  const account = await requireAccountContext({ returnTo: "/app/study/plan" });
  const settings = account.activeLearner.settings;
  const timezone =
    account.activeLearner.kind === "self"
      ? account.profile.timezone
      : typeof settings.timezone === "string"
        ? settings.timezone
        : "UTC";
  const studyDayStart =
    account.activeLearner.kind === "self"
      ? account.profile.studyDayStart
      : typeof settings.studyDayStart === "number"
        ? settings.studyDayStart
        : 240;
  const study = await readStudyDashboard(
    account.profile.id,
    account.activeLearner.id,
    timezone,
    studyDayStart,
  );
  return (
    <ExamPlanner
      currentDue={study.due + study.learning}
      decks={study.decks.map((deck) => ({ id: deck.deckId, name: deck.name, total: deck.total }))}
    />
  );
}
