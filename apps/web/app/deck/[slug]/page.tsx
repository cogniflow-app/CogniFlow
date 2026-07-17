import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@lumen/ui";

import {
  PublicDeckAttribution,
  PublicDeckPreview,
} from "@/components/content/public-deck-preview.client";
import { readPublicDeck } from "@/lib/server/content-repository";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const deck = await readPublicDeck(slug);
  if (!deck) notFound();
  return {
    title: deck.title,
    description: deck.description || `Preview ${String(deck.cardCount)} published cards.`,
    robots:
      deck.visibility === "unlisted"
        ? { index: false, follow: false }
        : { index: true, follow: true },
    openGraph: { title: deck.title, description: deck.description, type: "article" },
  };
}

export default async function PublicDeckPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const deck = await readPublicDeck(slug);
  if (!deck) notFound();
  return (
    <main id="main-content">
      <PageShell width="wide" className="public-deck-shell">
        <header className="public-deck-hero">
          <div>
            <span>Published deck</span>
            <h1>{deck.title}</h1>
            <p>{deck.description || "A focused collection of published recall cards."}</p>
          </div>
          {deck.coverMedia && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed publication URL.
            <img
              alt={deck.coverMedia.altText}
              className="public-deck-cover"
              src={deck.coverMedia.signedUrl}
            />
          )}
          <dl>
            <div>
              <dt>Cards</dt>
              <dd>{deck.cardCount}</dd>
            </div>
            <div>
              <dt>Formats</dt>
              <dd>{deck.supportedCardTypes.length}</dd>
            </div>
          </dl>
        </header>
        <PublicDeckPreview deck={deck} />
        <PublicDeckAttribution deck={deck} />
      </PageShell>
    </main>
  );
}
