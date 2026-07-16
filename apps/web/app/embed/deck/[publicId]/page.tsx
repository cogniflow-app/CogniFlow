import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicDeckPreview } from "@/components/content/public-deck-preview.client";
import { readPublicDeck } from "@/lib/server/content-repository";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Embedded deck preview",
};

export default async function EmbeddedDeckPage({
  params,
}: {
  readonly params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const deck = await readPublicDeck(publicId);
  if (!deck) notFound();
  return (
    <main className="embed-deck" id="main-content">
      <h1 className="visually-hidden">{deck.title}</h1>
      <PublicDeckPreview deck={deck} />
    </main>
  );
}
