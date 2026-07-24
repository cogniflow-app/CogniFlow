"use client";

import { Button, Input } from "@lumen/ui";
import { useMemo, useState } from "react";

import { startGuideEvent } from "@/components/guides/guide-system.client";
import { globalGuide, miniGuides } from "@/lib/guides/definitions";
import type { GettingStartedSnapshot, GuideProgressView } from "@/lib/guides/models";

const glossary = Object.freeze([
  ["Deck", "A collection of related card entries and their generated study cards."],
  ["Card", "A general name for a piece of study material."],
  ["Card entry", "The editable source content you create, such as a prompt and answer."],
  ["Study card", "A generated prompt that a Review or practice session can present."],
  ["New card", "A study card that has not entered the long-term review schedule yet."],
  ["Due card", "A scheduled card that is ready for canonical Review now."],
  ["Review", "The SRS session that changes due dates after you choose Again, Hard, Good, or Easy."],
  [
    "Learn",
    "Adaptive practice that changes question type as mastery grows. It is separate from Review.",
  ],
  ["Flashcards", "Flip-and-sort practice that never changes due dates."],
  ["Write", "Typed recall with explainable grading and a spaced second pass."],
  ["Test", "A seeded practice assessment. Its score does not change your SRS schedule."],
  ["Match", "A quick pairing game with low-weight practice evidence and no SRS effect."],
  ["Mastery", "A private, explainable estimate of recognition and recall built from practice."],
  ["SRS", "A spaced-repetition schedule that decides when a card should return for Review."],
  [
    "Desired retention",
    "The recall target used to balance memory reliability with review workload.",
  ],
  ["Public", "A published deck that can be discovered and opened by others."],
  ["Unlisted", "A published deck available by link but not intended for discovery."],
  ["Private", "A deck visible only to authorized people in your workspace."],
  [
    "Practice only",
    "Activity that can build practice history or mastery but leaves due dates alone.",
  ],
  ["Updates schedule", "An action that changes when a card returns in SRS Review."],
  [
    "Import",
    "Bring authorized study material into private Lumen content after inspection and mapping.",
  ],
  [
    "Export",
    "Create an expiring private artifact in a useful open or application-specific format.",
  ],
  ["Backup", "A full-fidelity versioned Lumen archive intended for disaster recovery."],
  [
    "Restore",
    "Import a Lumen backup with explicit conflicts and fresh canonical IDs where needed.",
  ],
  ["Duplicate", "An incoming card entry that exactly matches content or trusted source identity."],
  [
    "Update existing",
    "Replace only a deliberately matched object, never one chosen by weak similarity.",
  ],
  [
    "Flatten",
    "Convert an interactive card into a simpler static representation with a visible loss report.",
  ],
  [
    "Compatibility loss",
    "A feature, behavior, or history field a target format cannot preserve exactly.",
  ],
  ["Artifact expiration", "The time after which a private generated download becomes unavailable."],
  [
    "Schedule preservation",
    "Import compatible learner-private scheduling instead of starting every card as New.",
  ],
  [
    "Review-history preservation",
    "Carry trustworthy immutable review events while retaining learner ownership.",
  ],
] as const);

const modeEffects = Object.freeze([
  ["Review", "Updates due dates", "Choose a rating after recalling a due card."],
  ["Learn", "Builds mastery", "Eligible recall can update SRS only after you explicitly accept."],
  ["Flashcards", "Practice only", "Flip and sort; due dates never change."],
  ["Write", "Builds mastery", "No SRS change unless an eligible recall is explicitly accepted."],
  ["Test", "Practice score only", "No SRS side effects."],
  ["Match", "Practice game", "No SRS side effects."],
  ["Spell / Pronunciation", "Practice and self-assessment", "Never changes SRS silently."],
  ["Diagram", "Builds mastery", "Never changes SRS silently."],
] as const);

export function GettingStartedCenter({
  canCreate,
  snapshot,
}: {
  readonly canCreate: boolean;
  readonly snapshot: GettingStartedSnapshot;
}) {
  const [query, setQuery] = useState("");
  const filteredGlossary = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return glossary.filter(
      ([term, definition]) =>
        !normalized || `${term} ${definition}`.toLocaleLowerCase().includes(normalized),
    );
  }, [query]);
  const percent = Math.round((snapshot.completedCount / snapshot.totalCount) * 100);

  function startGuide(key: string, progress?: GuideProgressView) {
    window.dispatchEvent(
      new CustomEvent(startGuideEvent, {
        detail: {
          key,
          ...(progress?.status === "in_progress"
            ? { progressId: progress.id, step: progress.currentStep }
            : {}),
        },
      }),
    );
  }

  return (
    <main className="getting-started" data-guide-id="getting-started-center">
      <header className="getting-started__hero">
        <div>
          <p className="eyebrow">Help & guide</p>
          <h1>Learn the product while using it</h1>
          <p>
            Short tours point to real controls. Nothing here creates fake progress or blocks
            exploration.
          </p>
        </div>
        <Button
          onClick={() =>
            startGuide(
              globalGuide.key,
              snapshot.progress.find((item) => item.guideKey === globalGuide.key),
            )
          }
        >
          Take the 2-minute tour
        </Button>
      </header>

      <section aria-labelledby="setup-progress-heading" className="getting-started__progress">
        <div className="getting-started__progress-copy">
          <span aria-hidden="true">{percent}%</span>
          <div>
            <h2 id="setup-progress-heading">Your setup progress</h2>
            <p>
              {snapshot.completedCount} of {snapshot.totalCount} real milestones complete
            </p>
          </div>
        </div>
        <div className="getting-started__recommendation">
          <small>Recommended next</small>
          <strong>{snapshot.recommendation.label}</strong>
          <p>{snapshot.recommendation.body}</p>
          <a href={snapshot.recommendation.href}>Go there →</a>
        </div>
      </section>

      <section aria-labelledby="checklist-heading" className="getting-started__section">
        <div className="getting-started__section-heading">
          <div>
            <p className="eyebrow">Real milestones</p>
            <h2 id="checklist-heading">Getting started checklist</h2>
          </div>
          <p>
            Completion comes from decks, cards, practice sessions, reviews, and instructional tour
            state.
          </p>
        </div>
        <ol className="getting-started-checklist">
          {snapshot.checklist
            .filter((item, index) => canCreate || (index !== 0 && index !== 1 && index !== 6))
            .map((item, index) => (
              <li data-complete={item.completed} key={item.label}>
                <span aria-hidden="true">{item.completed ? "✓" : index + 1}</span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
                <a href={item.href}>{item.completed ? "Revisit" : "Start"}</a>
              </li>
            ))}
        </ol>
      </section>

      <section aria-labelledby="mode-effects-heading" className="getting-started__section">
        <div className="getting-started__section-heading">
          <div>
            <p className="eyebrow">Know the difference</p>
            <h2 id="mode-effects-heading">What each study mode changes</h2>
          </div>
        </div>
        <div className="mode-effect-grid">
          {modeEffects.map(([mode, effect, detail]) => (
            <article key={mode}>
              <h3>{mode}</h3>
              <strong>{effect}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="tour-library-heading" className="getting-started__section">
        <div className="getting-started__section-heading">
          <div>
            <p className="eyebrow">At your pace</p>
            <h2 id="tour-library-heading">Restartable mini-guides</h2>
          </div>
          <p>Each guide is optional, role-aware, and usually two steps.</p>
        </div>
        <div className="guide-library">
          {miniGuides
            .filter((guide) => canCreate || !guide.steps.some((step) => step.creatorOnly))
            .map((guide) => {
              const progress = snapshot.progress.find(
                (item) => item.guideKey === guide.key && item.guideVersion === guide.version,
              );
              return (
                <article key={guide.key}>
                  <div>
                    <h3>{guide.label}</h3>
                    <p>
                      {progress?.status === "completed"
                        ? "Completed · restart anytime"
                        : progress?.status === "in_progress"
                          ? `Paused at step ${progress.currentStep + 1}`
                          : "About 1 minute"}
                    </p>
                  </div>
                  <Button
                    onClick={() => startGuide(guide.key, progress)}
                    size="sm"
                    variant="secondary"
                  >
                    {progress?.status === "in_progress" ? "Resume" : progress ? "Restart" : "Start"}
                  </Button>
                </article>
              );
            })}
        </div>
      </section>

      <section
        aria-labelledby="glossary-heading"
        className="getting-started__section getting-started__glossary"
      >
        <div className="getting-started__section-heading">
          <div>
            <p className="eyebrow">Plain language</p>
            <h2 id="glossary-heading">Feature glossary</h2>
          </div>
          <label>
            <span className="visually-hidden">Search glossary</span>
            <Input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search terms"
              type="search"
              value={query}
            />
          </label>
        </div>
        {filteredGlossary.length ? (
          <dl>
            {filteredGlossary.map(([term, definition]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{definition}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="getting-started__empty">No glossary terms match “{query}”.</p>
        )}
      </section>
    </main>
  );
}
