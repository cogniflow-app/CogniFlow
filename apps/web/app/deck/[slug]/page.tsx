import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brandConfig } from "@lumen/config/brand";
import { LinkButton, PageShell } from "@lumen/ui";

import { AppearanceControls } from "@/components/appearance-controls.client";
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
    <div className="public-player-page">
      <header className="public-player-header">
        <a className="public-player-brand" href="/">
          <span aria-hidden="true">{brandConfig.name.slice(0, 1)}</span>
          <strong>{brandConfig.name}</strong>
        </a>
        <div className="public-player-header__actions">
          <LinkButton href="/app" size="sm" variant="ghost">
            Workspace
          </LinkButton>
          <AppearanceControls className="public-player-appearance" />
        </div>
      </header>
      <main id="main-content">
        <PageShell width="wide" className="public-deck-shell">
          <header className="public-deck-hero">
            <div>
              <h1>{deck.title}</h1>
              {deck.description && <p>{deck.description}</p>}
              <div className="public-deck-meta" aria-label="Deck summary">
                <span>
                  {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                </span>
                <span>
                  {deck.supportedCardTypes.length}{" "}
                  {deck.supportedCardTypes.length === 1 ? "format" : "formats"}
                </span>
                <span>{deck.visibility}</span>
              </div>
            </div>
            {deck.coverMedia && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed publication URL.
              <img
                alt={deck.coverMedia.altText}
                className="public-deck-cover"
                src={deck.coverMedia.signedUrl}
              />
            )}
          </header>
          <PublicDeckPreview deck={deck} />
          <PublicDeckAttribution deck={deck} />
        </PageShell>
      </main>
    </div>
  );
}
