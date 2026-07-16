import { getPublicCapabilities } from "@lumen/config/server-capabilities";
import { Avatar, Badge, PageHeader } from "@lumen/ui";
import type { Metadata } from "next";

import { LearnerCreateForm } from "@/components/settings/learner-create-form.client";
import {
  LearnerEditAction,
  ProfileAccessAction,
  ProfileSwitchAction,
} from "@/components/settings/learner-card-actions.client";
import { requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = { title: "Learner profiles" };

export default async function LearnerProfilesPage() {
  const account = await requireAccountContext({
    requireSelfLearner: true,
    returnTo: "/app/settings/learners",
  });
  const capabilities = getPublicCapabilities();
  const owned = account.learnerProfiles.filter(
    (learner) => learner.ownerAccountId === account.profile.id,
  );
  const observed = account.learnerProfiles.filter(
    (learner) => learner.ownerAccountId !== account.profile.id,
  );

  return (
    <>
      <PageHeader
        eyebrow="Account settings"
        title="Learner profiles"
        description="The signed-in account controls administration. A short-lived learner session controls whose private study state is in view."
      />
      <div className="grid gap-5">
        {owned.map((learner) => {
          const readingStyle =
            learner.settings.reading_style === "increased_spacing"
              ? "increased_spacing"
              : "standard";
          const theme =
            learner.settings.theme === "dark"
              ? "dark"
              : learner.settings.theme === "light"
                ? "light"
                : "system";
          return (
            <section
              className="settings-card"
              key={learner.id}
              aria-labelledby={`learner-${learner.id}`}
            >
              <div className="flex flex-wrap items-center gap-4">
                <Avatar
                  alt={learner.displayName ?? learner.pseudonym}
                  fallback={(learner.displayName ?? learner.pseudonym).slice(0, 2)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-xl" id={`learner-${learner.id}`}>
                      {learner.displayName ?? learner.pseudonym}
                    </h2>
                    <Badge
                      tone={
                        learner.kind === "self"
                          ? "brand"
                          : learner.status === "active"
                            ? "success"
                            : "warning"
                      }
                    >
                      {learner.kind === "self" ? "Self" : learner.status}
                    </Badge>
                  </div>
                  <p className="mt-1 mb-0 text-sm text-[var(--color-text-muted)]">
                    {learner.pseudonym} · {learner.ageBand.replace("_", " ")}
                  </p>
                </div>
              </div>
              {learner.kind !== "self" && (
                <div className="mt-5 grid gap-3">
                  <LearnerEditAction
                    initial={{
                      avatarSeed: learner.avatarSeed,
                      displayName: learner.displayName ?? learner.pseudonym,
                      id: learner.id,
                      preferences: {
                        readingStyle,
                        reduceMotion: learner.settings.reduced_motion === true,
                        seriousMode: learner.settings.serious_mode !== false,
                        theme,
                      },
                      pseudonym: learner.pseudonym,
                      status: learner.status,
                    }}
                  />
                  {learner.status === "active" && (
                    <>
                      <ProfileAccessAction learnerProfileId={learner.id} />
                      <ProfileSwitchAction learnerProfileId={learner.id} />
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {observed.length > 0 && (
          <section className="settings-card">
            <h2 className="m-0 text-xl">Observed learners</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Teacher-observer access is read-only in this account surface.
            </p>
            <ul>
              {observed.map((learner) => (
                <li key={learner.id}>
                  {learner.displayName ?? learner.pseudonym} <Badge>Observed</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {capabilities.childProfiles && capabilities.childConsentReady ? (
          <LearnerCreateForm
            consentMode={
              capabilities.parentalConsentMode === "external_verified"
                ? "external_verified"
                : "test_only"
            }
          />
        ) : (
          <section className="settings-card">
            <h2 className="m-0 text-xl">Guardian-managed profiles unavailable</h2>
            <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
              Production deployments are 13+. Local/test use also requires an explicit consent mode.
              Client input cannot override either server gate.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
