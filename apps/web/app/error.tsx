"use client";

import { PageContainer } from "@lumen/ui/shells";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="plain-page" id="main-content" tabIndex={-1}>
      <PageContainer width="site">
        <div className="plain-page__card" role="alert">
          <span className="eyebrow">Page interrupted</span>
          <h1>This page didn&apos;t load.</h1>
          <p>
            Try again or return home. If you were making a change, check its current state before
            repeating it.
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
      </PageContainer>
    </main>
  );
}
