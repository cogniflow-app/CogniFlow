import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "The account trust boundary for the foundation phase.",
  robots: { follow: false, index: false },
  title: "Account access boundary",
};

export default function AccountAccessPage() {
  return (
    <main className="plain-page" id="main-content" tabIndex={-1}>
      <div className="site-container">
        <div className="plain-page__card">
          <span className="eyebrow">Account access</span>
          <h1>Trust before sign-in.</h1>
          <p>
            Account creation is intentionally not active in the foundation phase. Identity, session
            handling, learner profiles, privacy controls, and row-level security belong to one
            reviewed boundary and will be implemented together in Phase 01.
          </p>
          <p>
            Today, you can inspect the public experience and the honest application-shell preview
            without entering personal information.
          </p>
          <div className="plain-page__actions">
            <a className="hero-action hero-action--primary" href="/app">
              Open the shell preview
            </a>
            <a className="hero-action hero-action--secondary" href="/">
              Return to overview
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
