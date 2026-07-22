import "../phase-one.css";
import "../phase-two.css";
import "../product-redesign.css";
import "../phase-three.css";

import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountAppearanceHydrator } from "@/components/account-appearance-hydrator.client";
import { WorkspaceShell } from "@/components/content/workspace-shell.client";
import { resolveActiveAppearancePreferences } from "@/lib/appearance";
import { readProtectedReturnTo, requireAccountContext } from "@/lib/server/account-context";

import { productSans } from "../product-font";

export const metadata: Metadata = { robots: { follow: false, index: false } };

export default async function ProtectedAppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await requireAccountContext({ returnTo: await readProtectedReturnTo("/app") });
  const appearance = resolveActiveAppearancePreferences({
    learner: account.activeLearner,
    profile: account.profile,
  });
  const learnerName = account.activeLearner.displayName ?? account.activeLearner.pseudonym;
  return (
    <div className={productSans.variable}>
      <AccountAppearanceHydrator preferences={appearance} />
      <WorkspaceShell
        brandName={brandConfig.name}
        learnerContext={
          account.activeLearner.kind === "self" ? "Personal library" : "Managed learner"
        }
        learnerName={learnerName}
        selfMode={account.activeLearner.kind === "self"}
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}
