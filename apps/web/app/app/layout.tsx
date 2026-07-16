import "../phase-one.css";

import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountAppearanceHydrator } from "@/components/account-appearance-hydrator.client";
import { AppearanceControls } from "@/components/appearance-controls.client";
import { WorkspaceNavigation } from "@/components/content/workspace-navigation.client";
import { GuardianExitAction } from "@/components/guardian-exit-action.client";
import { SessionAction } from "@/components/session-action.client";
import { resolveActiveAppearancePreferences } from "@/lib/appearance";
import { readProtectedReturnTo, requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = { robots: { follow: false, index: false } };

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
        <a className="workspace-home" href="/app" aria-label="Open your deck library">
          <span aria-hidden="true">{brandConfig.name.slice(0, 1)}</span>
          <strong>Workspace</strong>
        </a>
        <div className="active-profile">
          <small>Active learner</small>
          <strong>{account.activeLearner.displayName ?? account.activeLearner.pseudonym}</strong>
          <small>
            {account.activeLearner.kind === "self"
              ? "Your private study context"
              : "Managed learner context"}
          </small>
        </div>
        <WorkspaceNavigation selfMode={account.activeLearner.kind === "self"} />
        <div className="workspace-rail__actions grid gap-3">
          <AppearanceControls className="workspace-appearance" persistToAccount />
          {account.activeLearner.kind !== "self" && <GuardianExitAction />}
          <SessionAction>Sign out this device</SessionAction>
        </div>
      </aside>
      <main className="workspace-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
