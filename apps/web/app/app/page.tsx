import type { Metadata } from "next";

import { LibraryDashboard } from "@/components/content/library-dashboard.client";
import type { LibrarySnapshot } from "@/lib/content/view-models";
import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  description: "Your decks, study cards, and folders.",
  title: "Library",
};

const managedLearnerLibrary: LibrarySnapshot = Object.freeze({
  counts: Object.freeze({
    activeDecks: 0,
    archivedDecks: 0,
    cards: 0,
    folders: 0,
    notes: 0,
  }),
  decks: Object.freeze([]),
  folders: Object.freeze([]),
  recentlyEdited: Object.freeze([]),
  truncated: false,
});

export default async function LibraryPage() {
  const account = await requireAccountContext({ returnTo: "/app" });
  // Content authorization is account-self scoped in Phase 02. Managed learners must not invoke
  // the self-only library RPC with their guardian account and instead receive the truthful,
  // deliberately empty managed-profile surface until a later class/sharing phase grants content.
  const snapshot =
    account.activeLearner.kind === "self"
      ? await readLibrarySnapshot(account.profile.id)
      : managedLearnerLibrary;
  const learnerName = account.activeLearner.displayName ?? account.activeLearner.pseudonym;
  const canCreate =
    account.activeLearner.kind === "self" && account.capabilities.includes("create");
  return <LibraryDashboard canCreate={canCreate} learnerName={learnerName} snapshot={snapshot} />;
}
