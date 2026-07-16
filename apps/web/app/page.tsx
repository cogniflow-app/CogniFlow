import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const principles = [
  {
    number: "01",
    title: "Identity stays bounded",
    description:
      "An account and a learner profile are different things. The active learner is obvious, authorized on the server, and isolated from private account controls.",
  },
  {
    number: "02",
    title: "Child access stays gated",
    description:
      "The public beta is 13+. Guardian-managed profiles are local/test-only until child browsers have an independent identity boundary and every launch gate is complete.",
  },
  {
    number: "03",
    title: "Privacy is a workflow",
    description:
      "Preferences, device sessions, export requests, and deletion requests use real account state—not decorative toggles or success messages.",
  },
] as const;

const foundations = [
  {
    tag: "Secure access",
    title: "Choose how you sign in",
    description:
      "Use email and password, a magic link, or a configured identity provider—with verified callbacks, safe return paths, recovery, and session controls.",
  },
  {
    tag: "Learner context",
    title: "Know who is learning",
    description:
      "Every eligible account receives one self learner profile. Guardian-managed behavior is fully tested but cannot be activated in a production runtime.",
  },
  {
    tag: "Account control",
    title: "See and change real state",
    description:
      "Review profile choices, provider connections, devices, privacy preferences, and the actual status of export or deletion requests.",
  },
] as const;

export default function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="hero">
        <div className="site-container hero__grid">
          <div>
            <span className="eyebrow">A trustworthy place to begin</span>
            <h1>
              Learn from a foundation <em>you control.</em>
            </h1>
            <p className="hero__lead">
              Set up secure account access, choose the right learner context, and manage privacy
              before study history enters the picture. Durable recall, adaptive practice, and
              purposeful play build on these boundaries in later phases.
            </p>
            <div className="hero__actions">
              <a className="hero-action hero-action--primary" href="/auth/sign-up">
                Create an account
              </a>
              <a className="hero-action hero-action--secondary" href="/auth/sign-in">
                Sign in
              </a>
            </div>
          </div>
          <div
            aria-label="Authentication, learner profiles, and privacy surround one account"
            className="memory-map"
          >
            <span className="memory-map__core">Account</span>
            <span className="memory-map__node memory-map__node--recall">Access</span>
            <span className="memory-map__node memory-map__node--practice">Profiles</span>
            <span className="memory-map__node memory-map__node--play">Privacy</span>
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
            <h2 id="foundation-heading">Trust comes before study data.</h2>
            <p>
              Phase 01 establishes the identity, authorization, and privacy boundaries that later
              notes, reviews, classes, sharing, and games must respect. The controls below describe
              implemented account behavior, not sample metrics or promised study results.
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
