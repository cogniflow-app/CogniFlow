import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintableDeckDocument } from "@/components/portability/printable-deck.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readDeckDetail } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Print preview",
};

const layouts = new Set(["cards", "guide", "report", "test"]);

export default async function PortabilityPrintPage({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const query = await searchParams;
  const deckId = typeof query.deckId === "string" ? query.deckId : "";
  const layout =
    typeof query.layout === "string" && layouts.has(query.layout)
      ? (query.layout as "cards" | "guide" | "report" | "test")
      : "guide";
  const account = await requireAccountContext({
    returnTo: `/app/portability/print?deckId=${encodeURIComponent(deckId)}&layout=${layout}`,
  });
  if (account.activeLearner.kind !== "self") notFound();
  const deck = await readDeckDetail(deckId, account.profile.id);
  if (!deck || deck.role !== "owner") notFound();
  return (
    <PrintableDeckDocument
      cards={deck.cards.map((card) => ({
        answer: card.previewBack,
        front: card.previewFront,
        id: card.id,
      }))}
      deck={{
        cardCount: deck.cardCount,
        description: deck.descriptionPlain,
        noteCount: deck.noteCount,
        title: deck.title,
        updatedAt: deck.updatedAt,
      }}
      layout={layout}
    />
  );
}
