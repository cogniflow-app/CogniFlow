import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VersionHistory } from "@/components/content/deck-workspace.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";

export const metadata: Metadata = { title: "Deck history" };

export default async function DeckHistoryPage({
  params,
}: {
  readonly params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}/history` });
  const deck = await readDeckDetail(deckId, account.profile.id);
  if (!deck) notFound();
  return <VersionHistory deck={deck} />;
}
