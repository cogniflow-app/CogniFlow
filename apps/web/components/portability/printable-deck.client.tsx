"use client";

import { Button } from "@lumen/ui";
import { useState } from "react";

interface PrintableCard {
  readonly answer: string;
  readonly front: string;
  readonly id: string;
}

export function PrintableDeckDocument({
  cards,
  deck,
  layout,
}: {
  readonly cards: readonly PrintableCard[];
  readonly deck: {
    readonly cardCount: number;
    readonly description: string;
    readonly noteCount: number;
    readonly title: string;
    readonly updatedAt: string;
  };
  readonly layout: "cards" | "guide" | "report" | "test";
}) {
  const [paper, setPaper] = useState<"A4" | "Letter">("A4");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("portrait");
  const [margin, setMargin] = useState<8 | 12 | 18>(12);
  return (
    <div
      className="portability-print-document"
      data-layout={layout}
      data-orientation={orientation}
      data-paper={paper.toLowerCase()}
    >
      <style>{`@page { size: ${paper} ${orientation}; margin: ${String(margin)}mm; }`}</style>
      <div className="portability-print-toolbar" role="region" aria-label="Print controls">
        <a href="/app/portability">← Back to Import & export</a>
        <div>
          <label>
            Paper
            <select
              aria-label="Paper size"
              onChange={(event) => setPaper(event.target.value === "Letter" ? "Letter" : "A4")}
              value={paper}
            >
              <option>A4</option>
              <option>Letter</option>
            </select>
          </label>
          <label>
            Orientation
            <select
              aria-label="Orientation"
              onChange={(event) =>
                setOrientation(event.target.value === "landscape" ? "landscape" : "portrait")
              }
              value={orientation}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label>
            Margins
            <select
              aria-label="Print margins"
              onChange={(event) => {
                const value = Number(event.target.value);
                setMargin(value === 8 || value === 18 ? value : 12);
              }}
              value={margin}
            >
              <option value={8}>Narrow</option>
              <option value={12}>Normal</option>
              <option value={18}>Wide</option>
            </select>
          </label>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      <main className="print-sheet">
        <header className="print-title">
          <div>
            <p>
              Lumen ·{" "}
              {layout === "cards"
                ? "Cut-out flashcards"
                : layout === "test"
                  ? "Practice test"
                  : layout === "report"
                    ? "Progress report"
                    : "Study guide"}
            </p>
            <h1>{deck.title}</h1>
            {deck.description && <p>{deck.description}</p>}
          </div>
          <dl>
            <div>
              <dt>Entries</dt>
              <dd>{deck.noteCount}</dd>
            </div>
            <div>
              <dt>Study cards</dt>
              <dd>{deck.cardCount}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(deck.updatedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </header>

        {layout === "guide" && (
          <section aria-label="Study guide" className="print-guide">
            {cards.map((card, index) => (
              <article key={card.id}>
                <span>{index + 1}</span>
                <div>
                  <h2>{card.front}</h2>
                  <p>{card.answer}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {layout === "cards" && (
          <section aria-label="Cut-out flashcards" className="print-flashcards">
            {cards.map((card, index) => (
              <article key={card.id}>
                <span>{index + 1}</span>
                <div className="print-card-front">
                  <small>Front</small>
                  <h2>{card.front}</h2>
                </div>
                <div className="print-card-back">
                  <small>Back</small>
                  <p>{card.answer}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {layout === "test" && (
          <>
            <section aria-label="Practice test questions" className="print-test">
              {cards.map((card, index) => (
                <article key={card.id}>
                  <h2>
                    {index + 1}. {card.front}
                  </h2>
                  <div aria-label={`Answer space for question ${index + 1}`} />
                </article>
              ))}
            </section>
            <section aria-label="Answer key" className="print-answer-key">
              <h2>Answer key</h2>
              <ol>
                {cards.map((card) => (
                  <li key={card.id}>{card.answer}</li>
                ))}
              </ol>
            </section>
          </>
        )}

        {layout === "report" && (
          <section aria-label="Deck progress report" className="print-report">
            <h2>Content overview</h2>
            <p>
              This report describes the selected deck. Private learner scheduling is shown only when
              a dedicated authorized report snapshot is available.
            </p>
            <dl>
              <div>
                <dt>Card entries</dt>
                <dd>{deck.noteCount}</dd>
              </div>
              <div>
                <dt>Generated cards</dt>
                <dd>{deck.cardCount}</dd>
              </div>
              <div>
                <dt>Cards represented here</dt>
                <dd>{cards.length}</dd>
              </div>
            </dl>
            <h2>Card inventory</h2>
            <ol>
              {cards.map((card) => (
                <li key={card.id}>{card.front}</li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}
