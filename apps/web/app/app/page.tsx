import { Badge, LinkButton, PageHeader, PageShell } from "@lumen/ui";
import type { Metadata } from "next";

import { SessionAction } from "@/components/session-action.client";
import { requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = {
  description: "Your authorized account and learner-profile home.",
  title: "Today",
};

const capabilityLabels = {
  create: "Create",
  host: "Host",
  learn: "Learn",
  teach: "Teach",
} as const;

export default async function DashboardPage() {
  const account = await requireAccountContext({ returnTo: "/app" });
  const selfMode = account.activeLearner.kind === "self";
  const learnerName = account.activeLearner.displayName ?? account.activeLearner.pseudonym;
  return (
    <PageShell width="content">
      <PageHeader
        eyebrow="Today"
        title={`Welcome${learnerName ? `, ${learnerName}` : ""}.`}
        description={
          selfMode
            ? "Your authorized account and self learner context are active."
            : "This managed learner context is isolated from guardian account controls."
        }
        actions={
          selfMode ? (
            <LinkButton href="/app/settings/profile" variant="secondary">
              Account settings
            </LinkButton>
          ) : undefined
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="settings-card" aria-labelledby="learner-context-heading">
          <span className="text-sm font-bold tracking-wider text-[var(--color-brand)] uppercase">
            Current boundary
          </span>
          <h2 className="mt-3 mb-2 text-2xl" id="learner-context-heading">
            {account.activeLearner.displayName ?? account.activeLearner.pseudonym}
          </h2>
          <p className="text-[var(--color-text-muted)]">
            Scheduling and mastery data will belong to this learner profile—not to a shared deck and
            not automatically to a guardian account.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(selfMode ? account.capabilities : (["learn"] as const)).map((capability) => (
              <Badge key={capability} tone="info">
                {capabilityLabels[capability]}
              </Badge>
            ))}
          </div>
        </section>
        {selfMode ? (
          <section className="settings-card" aria-labelledby="privacy-summary-heading">
            <h2 className="m-0 text-xl" id="privacy-summary-heading">
              Privacy defaults
            </h2>
            <ul className="mt-4 grid gap-2 pl-5 text-sm text-[var(--color-text-muted)]">
              <li>
                {account.privacy.defaultContentPrivate
                  ? "New content private"
                  : "Sharing selected per item"}
              </li>
              <li>No targeted advertising</li>
              <li>No sale of learner data</li>
              <li>
                {account.privacy.firstPartyAnalytics
                  ? "First-party product analytics"
                  : "Essential telemetry only"}
              </li>
            </ul>
            <LinkButton className="mt-4" href="/app/settings/privacy" variant="secondary">
              Review privacy
            </LinkButton>
          </section>
        ) : (
          <section className="settings-card" aria-labelledby="managed-boundary-heading">
            <h2 className="m-0 text-xl" id="managed-boundary-heading">
              Managed learner boundary
            </h2>
            <ul className="mt-4 grid gap-2 pl-5 text-sm text-[var(--color-text-muted)]">
              <li>Guardian email and account settings hidden</li>
              <li>Social interaction defaults restricted</li>
              <li>Analytics minimized to essential operation</li>
              <li>Profile locks automatically when this session expires</li>
            </ul>
          </section>
        )}
      </div>
      {selfMode && (
        <section
          className="settings-card mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
          aria-labelledby="session-heading"
        >
          <div>
            <h2 className="m-0 text-lg" id="session-heading">
              Finished on this device?
            </h2>
            <p className="mt-1 mb-0 text-sm text-[var(--color-text-muted)]">
              Signing out clears profile-specific browser storage hooks as well as the local Auth
              session.
            </p>
          </div>
          <SessionAction>Sign out</SessionAction>
        </section>
      )}
    </PageShell>
  );
}
