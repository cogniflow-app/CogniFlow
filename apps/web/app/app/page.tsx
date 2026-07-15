import type { Metadata } from "next";

export const metadata: Metadata = {
  description:
    "A truthful preview of the application shell established during the foundation phase.",
  robots: { follow: false, index: false },
  title: "Application foundation",
};

export default function AppShellPreviewPage() {
  return (
    <main className="plain-page" id="main-content" tabIndex={-1}>
      <div className="site-container">
        <span className="eyebrow">Foundation preview</span>
        <h1>A calm place to begin.</h1>
        <p>
          This route proves the responsive application shell and its accessibility preferences. It
          does not create an account session, show invented study data, or imply that Phase 01
          identity work already exists.
        </p>
        <div className="shell-preview">
          <aside aria-label="Preview navigation" className="shell-preview__rail">
            <strong>Workspace</strong>
            <ul>
              <li>Foundation</li>
              <li>Appearance</li>
              <li>System health</li>
            </ul>
          </aside>
          <section className="shell-preview__content">
            <span className="foundation-card__tag">No account session</span>
            <h2>Built before the data arrives</h2>
            <p>
              The shell is deliberately sparse. Later phases will add identity and real learner data
              only after server authorization, row-level security, and profile safety are
              implemented together.
            </p>
            <div className="truth-note" role="note">
              <span aria-hidden="true">ⓘ</span>
              <span>
                Child profiles remain disabled. No under-13 launch is permitted without the
                documented provider, consent, privacy, and legal gates.
              </span>
            </div>
            <div className="plain-page__actions">
              <a className="hero-action hero-action--secondary" href="/">
                Return to overview
              </a>
              <a className="hero-action hero-action--primary" href="/api/health">
                View system health
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
