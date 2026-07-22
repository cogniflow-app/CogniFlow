import "server-only";

import type { GettingStartedSnapshot, GuideProgressView } from "@/lib/guides/models";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

import { readLibrarySnapshot } from "./content-repository";

function progressView(row: {
  readonly id: string;
  readonly guide_key: string;
  readonly guide_version: number;
  readonly status: "not_started" | "in_progress" | "completed" | "dismissed";
  readonly current_step: number;
}): GuideProgressView {
  return Object.freeze({
    currentStep: row.current_step,
    guideKey: row.guide_key,
    guideVersion: row.guide_version,
    id: row.id,
    status: row.status,
  });
}

export async function readGlobalGuideProgress(
  accountId: string,
): Promise<GuideProgressView | null> {
  const client = await createNextServerDatabaseClient();
  const { data, error } = await client
    .from("product_guide_progress")
    .select("id,guide_key,guide_version,status,current_step")
    .eq("account_id", accountId)
    .is("learner_profile_id", null)
    .eq("guide_key", "global-tour")
    .eq("guide_version", 1)
    .maybeSingle();
  if (error) throw new Error("GUIDE_PROGRESS_UNAVAILABLE");
  return data ? progressView(data) : null;
}

export async function readGettingStartedSnapshot(
  accountId: string,
  learnerProfileId: string,
  canCreate: boolean,
): Promise<GettingStartedSnapshot> {
  const client = await createNextServerDatabaseClient();
  const [library, practiceResult, reviewResult, progressResult] = await Promise.all([
    canCreate
      ? readLibrarySnapshot(accountId)
      : Promise.resolve({
          counts: { activeDecks: 0, cards: 0 },
          decks: [],
        }),
    client
      .from("practice_sessions")
      .select("mode,status")
      .eq("learner_profile_id", learnerProfileId)
      .eq("status", "completed"),
    client
      .from("review_logs")
      .select("id", { count: "exact", head: true })
      .eq("learner_profile_id", learnerProfileId),
    client
      .from("product_guide_progress")
      .select("id,guide_key,guide_version,status,current_step")
      .eq("account_id", accountId)
      .or(`learner_profile_id.is.null,learner_profile_id.eq.${learnerProfileId}`),
  ]);
  if (practiceResult.error || reviewResult.error || progressResult.error)
    throw new Error("GETTING_STARTED_UNAVAILABLE");
  const sessions = practiceResult.data ?? [];
  const guideProgress = (progressResult.data ?? []).map(progressView);
  const statsTourCompleted = guideProgress.some(
    (progress) => progress.guideKey === "study-statistics" && progress.status === "completed",
  );
  const checklist = Object.freeze([
    {
      completed: library.counts.activeDecks > 0,
      description: "Create a private home for related study material.",
      href: "/app/decks/new",
      label: "Create your first deck",
    },
    {
      completed: library.counts.cards > 0,
      description: "Save real prompt-and-answer content in a deck.",
      href: "/app",
      label: "Add your first card",
    },
    {
      completed: sessions.some((session) => session.mode === "flashcards"),
      description: "Flip and sort cards without changing due dates.",
      href: "/app/study/mode/flashcards",
      label: "Try Flashcards",
    },
    {
      completed: sessions.some((session) => session.mode === "learn"),
      description: "Complete a real adaptive session that builds mastery.",
      href: "/app/study/mode/learn",
      label: "Complete a short Learn session",
    },
    {
      completed: (reviewResult.count ?? 0) > 0,
      description: "Use Review when you want to update the long-term schedule.",
      href: "/app/study",
      label: "Complete an SRS Review",
    },
    {
      completed: statsTourCompleted,
      description: "Use the mini-guide to understand real review trends.",
      href: "/app/stats",
      label: "Understand your progress",
    },
    {
      completed: library.decks.some((deck) => deck.publicId !== null),
      description: "Optional: publish a safe frozen copy when you choose.",
      href: "/app/published",
      label: "Publish or share a deck",
    },
  ]);
  const completedCount = checklist.filter((item) => item.completed).length;
  const next = checklist.find((item) => !item.completed) ?? checklist[5];
  return Object.freeze({
    checklist,
    completedCount,
    progress: Object.freeze(guideProgress),
    recommendation: {
      body: next?.description ?? "Choose a focused practice mode from Study.",
      href: next?.href ?? "/app/study",
      label: next?.label ?? "Keep learning",
    },
    totalCount: checklist.length,
  });
}
