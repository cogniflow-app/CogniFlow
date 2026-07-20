import type { Metadata } from "next";

import { NewDeckWizard } from "@/components/content/new-deck-wizard.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  description: "Create a private deck and choose its first note and card type.",
  title: "Create deck",
};

export default async function NewDeckPage() {
  const account = await requireAccountContext({ returnTo: "/app/decks/new" });
  if (account.activeLearner.kind !== "self" || !account.capabilities.includes("create")) {
    redirect("/app");
  }
  const library = await readLibrarySnapshot(account.profile.id);
  return <NewDeckWizard folders={library.folders} />;
}
