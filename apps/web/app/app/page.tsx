import type { Metadata } from "next";

import { LibraryDashboard } from "@/components/content/library-dashboard.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  description: "Your query-backed deck, note, card, and folder library.",
  title: "Library",
};

export default async function LibraryPage() {
  const account = await requireAccountContext({ returnTo: "/app" });
  const snapshot = await readLibrarySnapshot(account.profile.id);
  const learnerName = account.activeLearner.displayName ?? account.activeLearner.pseudonym;
  const canCreate =
    account.activeLearner.kind === "self" && account.capabilities.includes("create");
  return <LibraryDashboard canCreate={canCreate} learnerName={learnerName} snapshot={snapshot} />;
}
