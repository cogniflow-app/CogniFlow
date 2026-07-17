"use client";

import { Badge, Button, LinkButton } from "@lumen/ui";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

import type { PublicDeckView } from "@/lib/content/view-models";
import { StudyCardRenderer } from "./study-card-renderer.client";

function isNestedInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a,button,input,select,textarea,audio,video,canvas,summary,[contenteditable="true"],[role="button"],[role="slider"],[role="radio"],[role="checkbox"]',
      ),
    )
  );
}

export function PublicDeckPreview({ deck }: { readonly deck: PublicDeckView }) {
  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  });
  const touchStart = useRef<number | null>(null);
  const card = deck.cards[index];

  const move = useCallback(
    (direction: -1 | 1) => {
      setIndex((current) => Math.min(deck.cards.length - 1, Math.max(0, current + direction)));
      setBack(false);
    },
    [deck.cards.length],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) {
      setReducedMotion(false);
      return undefined;
    }
    const updateReducedMotion = () => setReducedMotion(mediaQuery.matches);
    updateReducedMotion();
    mediaQuery.addEventListener?.("change", updateReducedMotion);
    return () => mediaQuery.removeEventListener?.("change", updateReducedMotion);
  }, []);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (isNestedInteractiveTarget(event.target)) return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setBack((value) => !value);
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [move]);

  function beginTouch(event: TouchEvent) {
    touchStart.current = event.changedTouches[0]?.clientX ?? null;
  }

  function finishTouch(event: TouchEvent) {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 48) return;
    move(end < start ? 1 : -1);
  }

  return (
    <div
      className="public-preview"
      data-deck-theme={deck.theme}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <div className="public-preview__progress" aria-live="polite">
        <span>
          {deck.cards.length ? `${String(index + 1)} of ${String(deck.cards.length)}` : "No cards"}
        </span>
        <progress max={Math.max(deck.cards.length, 1)} value={deck.cards.length ? index + 1 : 0}>
          {deck.cards.length ? index + 1 : 0} of {deck.cards.length}
        </progress>
      </div>
      {card ? (
        <div
          aria-label={`${back ? "Answer" : "Prompt"} card preview`}
          className="public-preview__viewport"
          role="region"
        >
          <button
            aria-label={`${back ? "Answer" : "Prompt"} card preview`}
            className="public-preview__card"
            data-side={back ? "back" : "front"}
            onClick={() => setBack((value) => !value)}
            onTouchEnd={finishTouch}
            onTouchStart={beginTouch}
            type="button"
          >
            <span className="public-preview__side">{back ? "Answer" : "Prompt"}</span>
            <div className="public-preview__flip-shell">
              <div
                className={`public-preview__flip-face ${reducedMotion ? "public-preview__flip-face--static" : "public-preview__flip-face--animated"}`}
                data-side={back ? "back" : "front"}
              >
                <StudyCardRenderer media={card.media} renderer={card.renderer} revealed={back} />
              </div>
            </div>
            <div className="public-preview__footer">
              <small>{card.cardType.replaceAll("_", " ")}</small>
              {!reducedMotion && <span className="public-preview__hint">Tap to flip</span>}
            </div>
            <span className="visually-hidden">{card.nonvisualFallback}</span>
          </button>
          <button
            className="public-preview__toggle"
            onClick={(event) => {
              event.stopPropagation();
              setBack((value) => !value);
            }}
            type="button"
          >
            {back ? "Show prompt" : "Reveal answer"}
          </button>
        </div>
      ) : (
        <div className="public-preview__card">
          <strong>This published deck has no cards.</strong>
        </div>
      )}
      <div className="public-preview__controls">
        <Button disabled={index === 0} onClick={() => move(-1)} variant="secondary">
          ← Previous
        </Button>
        <Button
          disabled={index >= deck.cards.length - 1}
          onClick={() => move(1)}
          variant="secondary"
        >
          Next →
        </Button>
      </div>
      <p className="public-preview__privacy">
        This preview does not create learner progress, history, scheduling state, or browser
        tracking records.
        <span className="visually-hidden">
          It is a read-only public preview that keeps deck content visible without adding study
          history or progress records.
        </span>
      </p>
    </div>
  );
}

export function PublicDeckAttribution({ deck }: { readonly deck: PublicDeckView }) {
  const returnTo = `/deck/${encodeURIComponent(deck.slug)}`;
  return (
    <aside className="public-deck-attribution" aria-labelledby="public-attribution-heading">
      <div>
        <span className="text-xs font-extrabold tracking-wider text-[var(--color-brand)] uppercase">
          Published by
        </span>
        <h2 id="public-attribution-heading">{deck.creator.displayName}</h2>
        {deck.creator.handle && <p>@{deck.creator.handle}</p>}
      </div>
      <dl>
        <div>
          <dt>License</dt>
          <dd>{deck.license.replaceAll("_", " ").toUpperCase()}</dd>
        </div>
        <div>
          <dt>Cards</dt>
          <dd>{deck.cardCount}</dd>
        </div>
        <div>
          <dt>Card types</dt>
          <dd>
            {deck.supportedCardTypes.map((kind) => kind.replaceAll("_", " ")).join(", ") || "None"}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{new Date(deck.updatedAt).toLocaleDateString()}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>
          Create your own deck
        </LinkButton>
        <LinkButton
          href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
          variant="secondary"
        >
          Sign in
        </LinkButton>
        <Badge tone={deck.visibility === "unlisted" ? "warning" : "success"}>
          {deck.visibility}
        </Badge>
      </div>
    </aside>
  );
}
