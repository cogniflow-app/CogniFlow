import "../phase-one.css";
import "../phase-two.css";
import "../product-redesign.css";
import "../phase-three.css";
import "../phase-four.css";
import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AccountAppearanceHydrator } from "@/components/account-appearance-hydrator.client";
import { WorkspaceShell } from "@/components/content/workspace-shell.client";
import { OfflineProvider } from "@/components/offline/offline-provider.client";
import { resolveActiveAppearancePreferences } from "@/lib/appearance";
import { readProtectedReturnTo, requireAccountContext } from "@/lib/server/account-context";
import { deviceCookieName } from "@/lib/server/cookies";
import { readGlobalGuideProgress } from "@/lib/server/guide-repository";

import { productSans } from "../product-font";

export const metadata: Metadata = { robots: { follow: false, index: false } };

export default async function ProtectedAppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await requireAccountContext({ returnTo: await readProtectedReturnTo("/app") });
  const appearance = resolveActiveAppearancePreferences({
    learner: account.activeLearner,
    profile: account.profile,
  });
  const learnerName = account.activeLearner.displayName ?? account.activeLearner.pseudonym;
  const guideProgress = await readGlobalGuideProgress(account.profile.id);
  const deviceId =
    account.activeProfileSession?.deviceId ?? (await cookies()).get(deviceCookieName)?.value;
  if (!deviceId) throw new Error("DEVICE_CONTEXT_UNAVAILABLE");
  return (
    <div className={productSans.variable}>
      <AccountAppearanceHydrator preferences={appearance} />
      <OfflineProvider
        accountId={account.profile.id}
        deviceId={deviceId}
        learnerProfileId={account.activeLearner.id}
      >
        <WorkspaceShell
          brandName={brandConfig.name}
          canCreate={
            account.activeLearner.kind === "self" && account.capabilities.includes("create")
          }
          guideProgress={guideProgress}
          learnerContext={
            account.activeLearner.kind === "self" ? "Personal library" : "Managed learner"
          }
          learnerName={learnerName}
          reducedMotion={appearance.reduceMotion}
          selfMode={account.activeLearner.kind === "self"}
        >
          {children}
        </WorkspaceShell>
      </OfflineProvider>
    </div>
  );
}
