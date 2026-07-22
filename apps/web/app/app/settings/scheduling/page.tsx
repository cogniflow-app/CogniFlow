import type { Metadata } from "next";

import {
  SchedulingSettings,
  type SchedulingPresetView,
} from "@/components/study/scheduling-settings.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";
import { presetFromDatabase } from "@/lib/study/srs-mapping";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scheduling settings" };

export default async function SchedulingSettingsPage() {
  const account = await requireAccountContext({ returnTo: "/app/settings/scheduling" });
  const client = await createNextServerDatabaseClient();
  const [library, presetResult, settingResult, counterResult] = await Promise.all([
    readLibrarySnapshot(account.profile.id),
    client
      .from("srs_presets")
      .select("*")
      .eq("learner_profile_id", account.activeLearner.id)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("name"),
    client
      .from("deck_srs_settings")
      .select("deck_id,preset_id")
      .eq("learner_profile_id", account.activeLearner.id),
    client
      .from("daily_study_counters")
      .select("new_reviewed,learning_reviewed,review_reviewed")
      .eq("learner_profile_id", account.activeLearner.id)
      .order("study_day", { ascending: false })
      .limit(30),
  ]);
  if (presetResult.error || settingResult.error || counterResult.error)
    throw new Error("SCHEDULING_SETTINGS_UNAVAILABLE");
  const settings = new Map(
    (settingResult.data ?? []).map((setting) => [setting.deck_id, setting.preset_id]),
  );
  const presets: SchedulingPresetView[] = (presetResult.data ?? []).map((row) => ({
    id: row.id,
    isDefault: row.is_default,
    name: row.name,
    preset: presetFromDatabase(row),
    version: row.version,
  }));
  const counters = counterResult.data ?? [];
  const currentDailyReviews = counters.length
    ? Math.round(
        counters.reduce(
          (sum, day) => sum + day.new_reviewed + day.learning_reviewed + day.review_reviewed,
          0,
        ) / counters.length,
      )
    : 0;
  return (
    <SchedulingSettings
      currentDailyReviews={currentDailyReviews}
      decks={library.decks
        .filter((deck) => deck.status === "active")
        .map((deck) => ({
          id: deck.id,
          name: deck.title,
          presetId: settings.get(deck.id) ?? null,
        }))}
      initialPresets={presets}
      studyDayStart={account.profile.studyDayStart}
      timezone={account.profile.timezone}
    />
  );
}
