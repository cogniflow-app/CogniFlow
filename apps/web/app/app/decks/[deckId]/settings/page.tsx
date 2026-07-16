import type { Metadata } from "next";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { DeckSettingsEditor } from "@/components/content/deck-workspace.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";

export const metadata: Metadata = { title: "Deck settings" };

export default async function DeckSettingsPage({
  params,
}: {
  readonly params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  const account = await requireAccountContext({ returnTo: `/app/decks/${deckId}/settings` });
  const deck = await readDeckDetail(deckId, account.profile.id);
  if (!deck) notFound();
  if (deck.status !== "active" || !["owner", "manager"].includes(deck.role))
    redirect(`/app/decks/${deckId}` as Route);
  return <DeckSettingsEditor deck={deck} />;
}
