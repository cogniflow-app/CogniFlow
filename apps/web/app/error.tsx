"use client";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="plain-page" id="main-content" tabIndex={-1}>
      <div className="site-container">
        <div className="plain-page__card" role="alert">
          <span className="eyebrow">Page interrupted</span>
          <h1>That surface did not load.</h1>
          <p>
            Your data was not changed. Try this page once more, or return to the working public
            overview.
          </p>
          <div className="plain-page__actions">
            <button className="hero-action hero-action--primary" onClick={reset} type="button">
              Try again
            </button>
            <a className="hero-action hero-action--secondary" href="/">
              Return home
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
