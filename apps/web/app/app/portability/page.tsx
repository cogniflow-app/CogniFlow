import { PageShell } from "@lumen/ui";
import type { Metadata } from "next";

import { PortabilityCenter } from "@/components/portability/portability-center.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  description: "Import, export, back up, restore, and print your study material.",
  title: "Import & export",
};

export default async function PortabilityPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly tab?: string }>;
}) {
  const account = await requireAccountContext({ returnTo: "/app/portability" });
  const requestedTab = (await searchParams).tab;
  const snapshot =
    account.activeLearner.kind === "self" ? await readLibrarySnapshot(account.profile.id) : null;
  return (
    <PageShell width="wide">
      <PortabilityCenter
        decks={(snapshot?.decks ?? [])
          .filter((deck) => deck.role === "owner" && deck.status !== "deleted")
          .map((deck) => ({
            cardCount: deck.cardCount,
            id: deck.id,
            noteCount: deck.noteCount,
            title: deck.title,
          }))}
        enabled={account.activeLearner.kind === "self"}
        initialTab={
          requestedTab === "export" ||
          requestedTab === "backups" ||
          requestedTab === "jobs" ||
          requestedTab === "print"
            ? requestedTab
            : "import"
        }
      />
    </PageShell>
  );
}
