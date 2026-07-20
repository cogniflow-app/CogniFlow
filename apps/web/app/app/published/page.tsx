import type { Metadata } from "next";

import { PublishedDecksDashboard } from "@/components/content/published-decks-dashboard.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readLibrarySnapshot } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  description: "Published decks owned by the current account.",
  title: "Published decks",
};

export default async function PublishedDecksPage() {
  const account = await requireAccountContext({ returnTo: "/app/published" });
  const decks =
    account.activeLearner.kind === "self"
      ? (await readLibrarySnapshot(account.profile.id)).decks.filter(
          (deck) => deck.visibility === "public" || deck.visibility === "unlisted",
        )
      : [];
  return <PublishedDecksDashboard initialDecks={decks} />;
}
