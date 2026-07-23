"use client";

import { OfflineRepository, profileCacheNamespaceSchema, type PinManifest } from "@lumen/offline";
import { useEffect, useState } from "react";

const activeNamespaceStorageKey = "lumen:private:active-namespace:v1";

type CardProjection = Readonly<Record<string, unknown>>;

function cardText(card: CardProjection, side: "back" | "front"): string {
  const key = side === "front" ? "previewFront" : "previewBack";
  const value = card[key];
  return typeof value === "string" && value.trim()
    ? value
    : side === "front"
      ? "This card has no offline text prompt."
      : "This answer requires content that is not available as offline text.";
}

export function OfflineShell() {
  const [repository, setRepository] = useState<OfflineRepository | null>(null);
  const [pins, setPins] = useState<readonly PinManifest[]>([]);
  const [selected, setSelected] = useState<PinManifest | null>(null);
  const [cards, setCards] = useState<readonly CardProjection[]>([]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("Opening the offline library…");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const next = new OfflineRepository();
    void (async () => {
      try {
        if (!("indexedDB" in window)) throw new Error("storage");
        const namespaceKey = window.localStorage.getItem(activeNamespaceStorageKey);
        if (!namespaceKey) {
          setMessage(
            "No locally authorized learner is active. Reconnect and sign in before using private offline decks.",
          );
          setReady(true);
          return;
        }
        await next.open();
        const metadata = await next.database.namespaceMetadata.get(namespaceKey);
        const namespace = profileCacheNamespaceSchema.safeParse(metadata?.value);
        if (!metadata || !namespace.success || namespace.data.kind !== "private") {
          setMessage(
            "The saved learner context is unavailable. Reconnect to verify access before opening private decks.",
          );
          setReady(true);
          return;
        }
        await next.activateNamespace(namespace.data);
        const pinned = await next.listPins();
        if (!active) return;
        setRepository(next);
        setPins(pinned);
        setMessage(
          pinned.length
            ? "Authorization was last verified while online. Changes on other devices are checked after reconnection."
            : "No decks are pinned on this browser. Reconnect and pin a deck from Library.",
        );
        setReady(true);
      } catch {
        if (active) {
          setMessage(
            "Offline storage could not be opened. Browser storage may be blocked or need recovery after reconnection.",
          );
          setReady(true);
        }
      }
    })();
    return () => {
      active = false;
      next.close();
    };
  }, []);

  async function openDeck(pin: PinManifest) {
    if (!repository) return;
    const projected = await repository.deckProjectionRows("studyCardProjections", pin.deckId);
    setSelected(pin);
    setCards(projected.filter((card) => card.active !== false));
    setPosition(0);
    setRevealed(false);
  }

  const card = cards[position] ?? null;
  return (
    <section aria-labelledby="offline-title" className="offline-shell">
      <p className="eyebrow">Offline</p>
      <h1 id="offline-title">{selected ? selected.deckTitle : "Pinned library"}</h1>
      <p role="status">{message}</p>

      {!ready ? null : selected ? (
        <>
          <div className="offline-shell__toolbar">
            <button onClick={() => setSelected(null)} type="button">
              Back to pinned decks
            </button>
            <span>
              {cards.length ? `${String(position + 1)} of ${String(cards.length)}` : "No cards"}
            </span>
          </div>
          {card ? (
            <article aria-live="polite" className="offline-shell__card">
              <p>{revealed ? "Answer" : "Prompt"}</p>
              <h2>{cardText(card, revealed ? "back" : "front")}</h2>
              <button onClick={() => setRevealed((value) => !value)} type="button">
                {revealed ? "Show prompt" : "Reveal answer"}
              </button>
            </article>
          ) : (
            <p>This pin contains no active cards. Reconnect to refresh it.</p>
          )}
          <div className="offline-shell__toolbar">
            <button
              disabled={position === 0}
              onClick={() => {
                setPosition((value) => Math.max(0, value - 1));
                setRevealed(false);
              }}
              type="button"
            >
              Previous
            </button>
            <button
              disabled={position >= cards.length - 1}
              onClick={() => {
                setPosition((value) => Math.min(cards.length - 1, value + 1));
                setRevealed(false);
              }}
              type="button"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <ul className="offline-shell__decks">
          {pins.map((pin) => (
            <li key={pin.deckId}>
              <button onClick={() => void openDeck(pin)} type="button">
                <strong>{pin.deckTitle}</strong>
                <span>{pin.cardCount} cards · ready offline</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p>
        <a href="/app">Reconnect to synchronize</a>
      </p>
      <noscript>Reconnect and reload this page to continue.</noscript>
    </section>
  );
}
