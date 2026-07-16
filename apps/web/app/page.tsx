import type { Metadata } from "next";
import { PageContainer } from "@lumen/ui/shells";

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
      "This beta is for people age 13 and older. Child profiles are not currently available.",
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
      "Every eligible account receives a private self learner profile, kept separate from account settings.",
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
        <PageContainer className="hero__grid" width="site">
          <div>
            <span className="eyebrow">A trustworthy place to begin</span>
            <h1>
              Learn from a foundation <em>you control.</em>
            </h1>
            <p className="hero__lead">
              Set up secure account access, choose the right learner context, and manage privacy
              preferences in one place. This beta focuses on the account controls that protect your
              learning data.
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
            role="img"
          >
            <span className="memory-map__core">Account</span>
            <span className="memory-map__node memory-map__node--recall">Access</span>
            <span className="memory-map__node memory-map__node--practice">Profiles</span>
            <span className="memory-map__node memory-map__node--play">Privacy</span>
          </div>
        </PageContainer>
      </section>

      <section aria-labelledby="principles-heading" className="principles">
        <PageContainer width="site">
          <header className="principles__heading">
            <div>
              <span className="eyebrow">Designed with care</span>
              <h2 id="principles-heading">Product principles</h2>
            </div>
            <p>
              Clear identity, age, and privacy boundaries shape every account interaction in the
              beta.
            </p>
          </header>
          <div className="principles__grid">
            {principles.map((principle) => (
              <article className="principle" key={principle.number}>
                <span className="principle__number">{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </PageContainer>
      </section>

      <section aria-labelledby="foundation-heading" className="foundation-section">
        <PageContainer width="site">
          <div className="section-heading">
            <h2 id="foundation-heading">Trust comes before study data.</h2>
            <p>
              Secure identity, learner context, and privacy controls come first. The account
              features below are available now; study sets, reviews, classes, sharing, and live
              games are not part of this beta.
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
        </PageContainer>
      </section>
    </main>
  );
}
