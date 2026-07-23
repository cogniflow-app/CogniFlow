import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PracticeSetup } from "@/components/practice/practice-setup.client";
import { practiceModes, type PracticeMode } from "@/lib/practice/models";
import { requireAccountContext } from "@/lib/server/account-context";
import { readPracticeModePreference } from "@/lib/server/practice-repository";
import { readStudyDashboard } from "@/lib/server/study-repository";

export const metadata: Metadata = { title: "Practice setup" };

export default async function PracticeSetupPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly mode: string }>;
  readonly searchParams: Promise<{ readonly deck?: string; readonly goal?: string }>;
}) {
  const [{ mode: rawMode }, { deck: initialDeckId, goal: initialGoal }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!practiceModes.includes(rawMode as PracticeMode)) notFound();
  const mode = rawMode as PracticeMode;
  const account = await requireAccountContext({ returnTo: `/app/study/mode/${mode}` });
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
  const [study, preference] = await Promise.all([
    readStudyDashboard(account.profile.id, account.activeLearner.id, timezone, studyDayStart),
    readPracticeModePreference(account.activeLearner.id, mode),
  ]);
  return (
    <PracticeSetup
      decks={study.decks.map((deck) => ({ id: deck.deckId, name: deck.name, total: deck.total }))}
      initialDeckId={initialDeckId}
      initialGoal={initialGoal}
      mode={mode}
      preference={preference}
      tags={study.tags}
    />
  );
}
