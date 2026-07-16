import "../phase-one.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountAppearanceHydrator } from "@/components/account-appearance-hydrator.client";
import { GuardianExitAction } from "@/components/guardian-exit-action.client";
import { SessionAction } from "@/components/session-action.client";
import { resolveActiveAppearancePreferences } from "@/lib/appearance";
import { readProtectedReturnTo, requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = { robots: { follow: false, index: false } };

const workspaceNavigation = [
  ["/app", "Today"],
  ["/app/settings/profile", "Profile"],
  ["/app/settings/learners", "Learner profiles"],
  ["/app/settings/privacy", "Privacy"],
] as const;

export default async function ProtectedAppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await requireAccountContext({ returnTo: await readProtectedReturnTo("/app") });
  const appearance = resolveActiveAppearancePreferences({
    learner: account.activeLearner,
    profile: account.profile,
  });
  return (
    <div className="workspace-frame">
      <AccountAppearanceHydrator preferences={appearance} />
      <aside className="workspace-rail" aria-label="Workspace">
        <div className="active-profile mb-4">
          <small>Active learner</small>
          <strong>{account.activeLearner.displayName ?? account.activeLearner.pseudonym}</strong>
          <small>
            {account.activeLearner.kind === "self"
              ? "Your private study context"
              : "Managed learner context"}
          </small>
        </div>
        <nav aria-label="Workspace navigation">
          {(account.activeLearner.kind === "self"
            ? workspaceNavigation
            : workspaceNavigation.slice(0, 1)
          ).map(([href, label]) => (
            <a href={href} key={href}>
              {label}
            </a>
          ))}
        </nav>
        {account.activeLearner.kind !== "self" && (
          <div className="grid gap-3">
            <GuardianExitAction />
            <SessionAction>Sign out this device</SessionAction>
          </div>
        )}
      </aside>
      <main className="workspace-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
