import { normalizeReturnUrl } from "@lumen/auth/redirects";
import { PageHeader, PageShell } from "@lumen/ui";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { OnboardingAgeGateForm, OnboardingForm } from "@/components/onboarding-form.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readServerOnboardingAgeGate } from "@/lib/server/pending-auth-age-gate";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Set up your account",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ age?: string; returnTo?: string }>;
}) {
  const parameters = await searchParams;
  const returnTo = normalizeReturnUrl(parameters.returnTo);
  const account = await requireAccountContext({
    allowIncompleteOnboarding: true,
    returnTo: "/onboarding",
  });
  if (account.profile.onboardingCompletedAt) {
    redirect(returnTo as Route);
  }
  const ageGate =
    parameters.age === "change" ? null : await readServerOnboardingAgeGate(account.profile.id);
  return (
    <main id="main-content" tabIndex={-1}>
      <PageShell width="content">
        <PageHeader
          eyebrow="Account setup"
          title="Make the workspace yours."
          description="A few privacy-minimizing choices create your self learner profile and study-day context. You can adjust them later."
        />
        {ageGate ? (
          <OnboardingForm
            defaultLocale={account.profile.locale}
            defaultTimeZone={account.profile.timezone}
            returnTo={ageGate.returnTo}
            verifiedAgeBand={ageGate.ageBand}
          />
        ) : (
          <OnboardingAgeGateForm returnTo={returnTo} />
        )}
      </PageShell>
    </main>
  );
}
