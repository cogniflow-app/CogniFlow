import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const principles = [
  {
    number: "01",
    title: "Memory stays auditable",
    description:
      "Dedicated review will own long-term scheduling. Practice, assessment, and game results remain separate evidence instead of blurring into one score.",
  },
  {
    number: "02",
    title: "Practice adapts with purpose",
    description:
      "Recognition can introduce an idea, but genuine recall is what moves learning forward. Every transition is designed to be explainable.",
  },
  {
    number: "03",
    title: "Play never rewrites truth",
    description:
      "Games can be expressive, social, and strategic while academic accuracy remains untouched by speed bonuses, streaks, or power-ups.",
  },
] as const;

const foundations = [
  {
    tag: "Long-term memory",
    title: "Review that can be inspected",
    description:
      "Notes, generated cards, scheduling state, and review history will form one traceable system—with learner control over every meaningful change.",
  },
  {
    tag: "Adaptive study",
    title: "From seeing to recalling",
    description:
      "Study experiences will progress from a gentle introduction to independent retrieval without confusing short-term familiarity for durable memory.",
  },
  {
    tag: "Purposeful games",
    title: "Energy with boundaries",
    description:
      "A shared question layer will support calm solo modes and lively rooms while keeping scoring, mastery, and scheduling distinct.",
  },
] as const;

export default function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="hero">
        <div className="site-container hero__grid">
          <div>
            <span className="eyebrow">Learning, with a longer horizon</span>
            <h1>
              Make knowledge <em>stay.</em>
            </h1>
            <p className="hero__lead">
              A thoughtful learning platform in formation—bringing durable recall, adaptive
              practice, and purposeful play together without letting one kind of progress
              impersonate another.
            </p>
            <div className="hero__actions">
              <a className="hero-action hero-action--primary" href="/app">
                Explore the app foundation
              </a>
              <a className="hero-action hero-action--secondary" href="/auth">
                Understand account access
              </a>
            </div>
          </div>
          <div
            aria-label="Recall, practice, and play orbit durable learning"
            className="memory-map"
          >
            <span className="memory-map__core">Learning</span>
            <span className="memory-map__node memory-map__node--recall">Recall</span>
            <span className="memory-map__node memory-map__node--practice">Practice</span>
            <span className="memory-map__node memory-map__node--play">Play</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="principles-heading" className="principles">
        <h2 className="sr-only" id="principles-heading">
          Product principles
        </h2>
        <div className="site-container principles__grid">
          {principles.map((principle) => (
            <article className="principle" key={principle.number}>
              <span className="principle__number">{principle.number}</span>
              <h2>{principle.title}</h2>
              <p>{principle.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="foundation-heading" className="foundation-section">
        <div className="site-container">
          <div className="section-heading">
            <h2 id="foundation-heading">Three systems. One honest foundation.</h2>
            <p>
              The platform is being built from stable, accessible primitives first. It already
              supports responsive themes, reduced motion, serious mode, typed runtime boundaries,
              and a local database workflow—before any account or learning data is introduced.
            </p>
          </div>
          <div className="foundation-grid">
            {foundations.map((foundation) => (
              <article className="foundation-card" key={foundation.tag}>
                <span className="foundation-card__tag">{foundation.tag}</span>
                <h3>{foundation.title}</h3>
                <p>{foundation.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
