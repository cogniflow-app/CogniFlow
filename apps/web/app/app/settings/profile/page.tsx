import { PageHeader } from "@lumen/ui";
import type { Metadata } from "next";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form.client";
import { requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const account = await requireAccountContext({ returnTo: "/app/settings/profile" });
  const readingStyle =
    account.activeLearner.settings.reading_style === "increased_spacing"
      ? "increased_spacing"
      : "standard";
  return (
    <>
      <PageHeader
        eyebrow="Account settings"
        title="Profile"
        description="Update the minimum details that make study days and account presentation work."
      />
      <ProfileSettingsForm
        initial={{
          displayName: account.profile.displayName ?? "",
          handle: account.profile.handle ?? "",
          learningGoals: [...account.profile.learningGoals],
          locale: account.profile.locale,
          preferences: {
            readingStyle,
            reduceMotion: account.profile.reducedMotion,
            seriousMode: account.profile.seriousMode,
            theme: account.profile.theme,
          },
          studyDayStartMinutes: account.profile.studyDayStart,
          timeZone: account.profile.timezone,
        }}
      />
    </>
  );
}
