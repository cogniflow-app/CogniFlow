"use client";

import { Button } from "@lumen/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type { PracticeCardView } from "@/lib/practice/models";

import { recordPracticeAttempt } from "./practice-attempt-client";

type MatchSide = "answer" | "prompt";

interface MatchTile {
  readonly id: string;
  readonly position: number;
  readonly side: MatchSide;
  readonly text: string;
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function shuffled<T>(values: readonly T[], seed: string): readonly T[] {
  const result = [...values];
  let state = hashSeed(seed) || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PracticeMatchBoard({
  cards,
  reducedMotion,
  seriousMode,
}: {
  readonly cards: readonly PracticeCardView[];
  readonly reducedMotion: boolean;
  readonly seriousMode: boolean;
}) {
  const first = cards[0];
  if (!first) return null;
  return (
    <PracticeMatchBoardReady
      cards={cards}
      first={first}
      reducedMotion={reducedMotion}
      seriousMode={seriousMode}
    />
  );
}

function PracticeMatchBoardReady({
  cards,
  first,
  reducedMotion,
  seriousMode,
}: {
  readonly cards: readonly PracticeCardView[];
  readonly first: PracticeCardView;
  readonly reducedMotion: boolean;
  readonly seriousMode: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<number>>(() => new Set());
  const [wrongIds, setWrongIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingPosition, setPendingPosition] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<Readonly<Record<number, number>>>({});
  const [listAnswers, setListAnswers] = useState<Readonly<Record<number, string>>>({});
  const [announcement, setAnnouncement] = useState(
    "Choose a term and its matching definition. You can also drag one card onto the other.",
  );
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(first.session.config.timerSeconds);
  const lastMatchAt = useRef(0);
  const wrongTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardByPosition = useMemo(
    () => new Map(cards.map((card) => [card.item.position, card])),
    [cards],
  );
  const tiles = useMemo(
    () =>
      shuffled(
        cards.flatMap((card) => [
          {
            id: `${String(card.item.position)}:prompt`,
            position: card.item.position,
            side: "prompt" as const,
            text: card.prompt,
          },
          {
            id: `${String(card.item.position)}:answer`,
            position: card.item.position,
            side: "answer" as const,
            text: card.answer,
          },
        ]),
        `${first.session.id}:match-board`,
      ),
    [cards, first.session.id],
  );
  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);
  const answerOptions = useMemo(
    () =>
      shuffled(
        cards.map((card) => ({
          position: card.item.position,
          text: card.answer,
        })),
        `${first.session.id}:match-list`,
      ),
    [cards, first.session.id],
  );

  useEffect(() => {
    lastMatchAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (first.session.config.timerSeconds === null) return;
    const timer = window.setInterval(
      () => setRemainingSeconds((current) => (current === null ? null : Math.max(0, current - 1))),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [first.session.config.timerSeconds]);

  useEffect(
    () => () => {
      if (wrongTimeout.current) clearTimeout(wrongTimeout.current);
    },
    [],
  );

  const markWrong = useCallback(
    (firstTile: MatchTile, secondTile: MatchTile) => {
      const promptTile = firstTile.side === "prompt" ? firstTile : secondTile;
      setMistakes((current) => ({
        ...current,
        [promptTile.position]: (current[promptTile.position] ?? 0) + 1,
      }));
      setWrongIds(new Set([firstTile.id, secondTile.id]));
      setAnnouncement("Not a pair. Both cards are still on the board.");
      if (wrongTimeout.current) clearTimeout(wrongTimeout.current);
      wrongTimeout.current = setTimeout(
        () => setWrongIds(new Set()),
        reducedMotion || seriousMode ? 0 : 420,
      );
    },
    [reducedMotion, seriousMode],
  );

  const saveMatch = useCallback(
    async (firstTile: MatchTile, secondTile: MatchTile) => {
      if (
        pendingPosition !== null ||
        matched.has(firstTile.position) ||
        matched.has(secondTile.position)
      )
        return;
      if (firstTile.side === secondTile.side) {
        setSelectedId(secondTile.id);
        setAnnouncement(
          `Selected ${secondTile.side === "prompt" ? "term" : "definition"}. Now choose a card from the other group.`,
        );
        return;
      }
      if (firstTile.position !== secondTile.position) {
        markWrong(firstTile, secondTile);
        setSelectedId(null);
        return;
      }
      const card = cardByPosition.get(firstTile.position);
      if (!card) return;
      setPendingPosition(firstTile.position);
      setError(null);
      try {
        await recordPracticeAttempt({
          card,
          durationMs: performance.now() - (lastMatchAt.current || performance.now()),
          response: card.answer,
          responseKind: "match",
          retryCount: mistakes[firstTile.position] ?? 0,
        });
        lastMatchAt.current = performance.now();
        const nextMatched = new Set(matched);
        nextMatched.add(firstTile.position);
        setMatched(nextMatched);
        setSelectedId(null);
        setAnnouncement(
          nextMatched.size === cards.length
            ? "Board complete. Opening your results."
            : `Pair matched. ${String(cards.length - nextMatched.size)} remaining.`,
        );
        if (nextMatched.size === cards.length) router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The match could not be saved.");
      } finally {
        setPendingPosition(null);
      }
    },
    [cardByPosition, cards.length, markWrong, matched, mistakes, pendingPosition, router],
  );

  function chooseTile(tile: MatchTile) {
    if (matched.has(tile.position) || pendingPosition !== null) return;
    const selected = selectedId ? tileById.get(selectedId) : null;
    if (!selected || selected.id === tile.id) {
      setSelectedId(selected?.id === tile.id ? null : tile.id);
      setAnnouncement(
        selected?.id === tile.id
          ? "Selection cleared."
          : `Selected ${tile.side === "prompt" ? "term" : "definition"}. Choose its match.`,
      );
      return;
    }
    void saveMatch(selected, tile);
  }

  function dropOn(event: DragEvent<HTMLButtonElement>, target: MatchTile) {
    event.preventDefault();
    const source = tileById.get(event.dataTransfer.getData("text/plain"));
    if (source) void saveMatch(source, target);
  }

  async function checkList() {
    if (pendingPosition !== null) return;
    const unmatchedCards = cards.filter((card) => !matched.has(card.item.position));
    const correct = unmatchedCards.filter(
      (card) => listAnswers[card.item.position] === card.answer,
    );
    const incorrect = unmatchedCards.filter(
      (card) =>
        Boolean(listAnswers[card.item.position]) && listAnswers[card.item.position] !== card.answer,
    );
    if (incorrect.length > 0) {
      setMistakes((current) =>
        incorrect.reduce(
          (next, card) => ({
            ...next,
            [card.item.position]: (next[card.item.position] ?? 0) + 1,
          }),
          current,
        ),
      );
    }
    if (correct.length === 0) {
      setAnnouncement(
        incorrect.length > 0 ? "Some pairs do not match yet." : "Choose at least one match first.",
      );
      return;
    }
    setError(null);
    const nextMatched = new Set(matched);
    try {
      for (const card of correct) {
        setPendingPosition(card.item.position);
        await recordPracticeAttempt({
          card,
          durationMs:
            Math.max(0, performance.now() - (lastMatchAt.current || performance.now())) /
            correct.length,
          response: card.answer,
          responseKind: "match",
          retryCount: mistakes[card.item.position] ?? 0,
        });
        nextMatched.add(card.item.position);
      }
      lastMatchAt.current = performance.now();
      setMatched(nextMatched);
      setAnnouncement(
        nextMatched.size === cards.length
          ? "Board complete. Opening your results."
          : `${String(correct.length)} pair${correct.length === 1 ? "" : "s"} matched.`,
      );
      if (nextMatched.size === cards.length) router.refresh();
    } catch (caught) {
      setMatched(nextMatched);
      setError(caught instanceof Error ? caught.message : "The matches could not be saved.");
    } finally {
      setPendingPosition(null);
    }
  }

  const complete = first.session.completed + matched.size;
  const total = first.session.total;
  return (
    <main
      className={`practice-session practice-match ${reducedMotion ? "practice-session--reduced-motion" : ""}`}
    >
      <header className="practice-session-bar practice-session-bar--play">
        <div className="practice-session-bar__identity">
          <a href="/app/study" aria-label="Save and exit to Study">
            ←
          </a>
          <span>
            <strong>{first.deckTitle}</strong>
            <small>Match</small>
          </span>
        </div>
        <div
          aria-label={`${String(complete)} of ${String(total)} pairs matched`}
          className="practice-session-progress"
        >
          <span>
            <i style={{ width: `${String((complete / total) * 100)}%` }} />
          </span>
          <small>
            {complete} / {total} pairs
          </small>
        </div>
        <div className="practice-session-bar__actions">
          {remainingSeconds !== null && (
            <time aria-label="Time remaining">{formatTimer(remainingSeconds)}</time>
          )}
          <a className="practice-exit-link" href="/app/study">
            Save &amp; exit
          </a>
        </div>
      </header>

      <section className="practice-match__stage" aria-labelledby="match-heading">
        <header className="practice-match__intro">
          <div>
            <p className="eyebrow">Find every pair</p>
            <h1 id="match-heading">Match the cards</h1>
            <p>
              Drag one card onto its match, or select two cards. Each pair disappears when it fits.
            </p>
          </div>
          <div aria-label="Match view" className="practice-view-switch">
            <button aria-pressed={view === "board"} onClick={() => setView("board")} type="button">
              Board
            </button>
            <button aria-pressed={view === "list"} onClick={() => setView("list")} type="button">
              List
            </button>
          </div>
        </header>
        <p aria-live="polite" className="practice-match__status">
          {announcement}
        </p>

        {view === "board" ? (
          <div className="practice-match-board" role="group" aria-label="Shuffled matching cards">
            {tiles
              .filter((tile) => !matched.has(tile.position))
              .map((tile, index) => {
                const isPending = pendingPosition === tile.position;
                return (
                  <button
                    aria-label={`${tile.side === "prompt" ? "Term" : "Definition"}: ${tile.text}`}
                    aria-pressed={selectedId === tile.id}
                    className="practice-match-tile"
                    data-accent={index % 4}
                    data-side={tile.side}
                    data-state={
                      wrongIds.has(tile.id) ? "wrong" : selectedId === tile.id ? "selected" : "idle"
                    }
                    disabled={isPending}
                    draggable={pendingPosition === null}
                    key={tile.id}
                    onClick={() => chooseTile(tile)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", tile.id);
                      setSelectedId(tile.id);
                    }}
                    onDrop={(event) => dropOn(event, tile)}
                    type="button"
                  >
                    <small>{tile.side === "prompt" ? "Term" : "Definition"}</small>
                    <span>{tile.text}</span>
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="practice-match-list">
            {cards.map((card, index) => {
              const isMatched = matched.has(card.item.position);
              return (
                <label data-accent={index % 4} key={card.item.position}>
                  <span>
                    <small>Term {card.item.position + 1}</small>
                    <strong>{card.prompt}</strong>
                  </span>
                  <select
                    aria-label={`Match for ${card.prompt}`}
                    disabled={isMatched || pendingPosition !== null}
                    onChange={(event) =>
                      setListAnswers((current) => ({
                        ...current,
                        [card.item.position]: event.target.value,
                      }))
                    }
                    value={isMatched ? card.answer : (listAnswers[card.item.position] ?? "")}
                  >
                    <option value="">Choose a definition</option>
                    {answerOptions.map((option) => (
                      <option key={option.position} value={option.text}>
                        {option.text}
                      </option>
                    ))}
                  </select>
                  {isMatched && <strong className="practice-match-list__done">Matched ✓</strong>}
                </label>
              );
            })}
            <div className="practice-match-list__actions">
              <Button disabled={pendingPosition !== null} onClick={() => void checkList()}>
                {pendingPosition === null ? "Check pairs" : "Saving…"}
              </Button>
            </div>
          </div>
        )}
        {remainingSeconds === 0 && (
          <p className="practice-session-error" role="status">
            Time is up, but you can finish the board.
          </p>
        )}
        {error && (
          <p className="form-error practice-session-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
