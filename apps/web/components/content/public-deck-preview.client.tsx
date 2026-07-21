"use client";

import { ArrowLeftIcon, ArrowRightIcon, Badge, Button } from "@lumen/ui";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";

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
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const card = deck.cards[index];

  const move = useCallback(
    (direction: -1 | 1) => {
      setIndex((current) => Math.min(deck.cards.length - 1, Math.max(0, current + direction)));
      setBack(false);
    },
    [deck.cards.length],
  );

  const flip = useCallback(() => setBack((value) => !value), []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const updateReducedMotion = () =>
      setReducedMotion(root.dataset.motion === "reduce" || Boolean(mediaQuery?.matches));
    updateReducedMotion();
    mediaQuery?.addEventListener?.("change", updateReducedMotion);
    const observer = new MutationObserver(updateReducedMotion);
    observer.observe(root, { attributeFilter: ["data-motion"], attributes: true });
    return () => {
      mediaQuery?.removeEventListener?.("change", updateReducedMotion);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (isNestedInteractiveTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flip();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [flip, move]);

  function beginTouch(event: TouchEvent) {
    touchStart.current = event.changedTouches[0]?.clientX ?? null;
    didSwipe.current = false;
  }

  function finishTouch(event: TouchEvent) {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 48) return;
    didSwipe.current = true;
    move(end < start ? 1 : -1);
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    if (didSwipe.current) {
      didSwipe.current = false;
      return;
    }
    if (isNestedInteractiveTarget(event.target)) return;
    flip();
  }

  return (
    <section
      aria-label="Flashcard player"
      className="public-preview"
      data-deck-theme={deck.theme}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <div className="public-preview__progress">
        <progress max={Math.max(deck.cards.length, 1)} value={deck.cards.length ? index + 1 : 0}>
          {deck.cards.length ? index + 1 : 0} of {deck.cards.length}
        </progress>
      </div>

      {card ? (
        <div
          aria-describedby="public-player-instructions"
          aria-label={`${back ? "Answer" : "Question"}, card ${String(index + 1)} of ${String(deck.cards.length)}`}
          className="flashcard-scene"
          onClick={handleCardClick}
          onTouchEnd={finishTouch}
          onTouchStart={beginTouch}
          role="group"
          tabIndex={0}
        >
          <div className="flashcard-inner" data-flipped={back ? "true" : "false"}>
            <article
              aria-hidden={back}
              className="flashcard-face flashcard-front"
              data-face="front"
              inert={back}
            >
              <span className="flashcard-face__label">Question</span>
              <div className="flashcard-face__content">
                <StudyCardRenderer media={card.media} renderer={card.renderer} revealed={false} />
              </div>
              <small>{card.cardType.replaceAll("_", " ")}</small>
            </article>
            <article
              aria-hidden={!back}
              className="flashcard-face flashcard-back"
              data-face="back"
              inert={!back}
            >
              <span className="flashcard-face__label">Answer</span>
              <div className="flashcard-face__content">
                <StudyCardRenderer media={card.media} renderer={card.renderer} revealed />
              </div>
              <small>{card.cardType.replaceAll("_", " ")}</small>
            </article>
          </div>
          <button
            className="visually-hidden public-preview__flip-action"
            onClick={(event) => {
              event.stopPropagation();
              flip();
            }}
            type="button"
          >
            Flip card
          </button>
          <span className="visually-hidden">{card.nonvisualFallback}</span>
        </div>
      ) : (
        <div className="public-preview__empty">
          <strong>This published deck has no cards.</strong>
        </div>
      )}

      <div className="public-preview__controls">
        <Button
          disabled={index === 0}
          leadingIcon={<ArrowLeftIcon />}
          onClick={() => move(-1)}
          variant="secondary"
        >
          Previous
        </Button>
        <output aria-live="polite">
          {deck.cards.length ? `${String(index + 1)} / ${String(deck.cards.length)}` : "0 / 0"}
        </output>
        <Button
          disabled={index >= deck.cards.length - 1}
          onClick={() => move(1)}
          trailingIcon={<ArrowRightIcon />}
          variant="secondary"
        >
          Next
        </Button>
      </div>

      <p className="visually-hidden" id="public-player-instructions">
        Press Space or Enter to flip the card. Use the left and right arrow keys to move between
        cards. This public preview does not create study progress or history.
      </p>
    </section>
  );
}

export function PublicDeckAttribution({ deck }: { readonly deck: PublicDeckView }) {
  return (
    <footer className="public-deck-attribution" aria-label="Deck details">
      <span>
        Created by <strong>{deck.creator.displayName}</strong>
      </span>
      <span>{deck.license.replaceAll("_", " ")}</span>
      <span>Updated {new Date(deck.updatedAt).toLocaleDateString()}</span>
      <Badge tone={deck.visibility === "unlisted" ? "warning" : "success"}>{deck.visibility}</Badge>
    </footer>
  );
}
