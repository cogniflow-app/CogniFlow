import { PageContainer } from "@lumen/ui/shells";

export default function NotFound() {
  return (
    <main className="plain-page" id="main-content" tabIndex={-1}>
      <PageContainer width="site">
        <div className="plain-page__card">
          <span className="eyebrow">404 · Route not found</span>
          <h1>We couldn&apos;t find that page.</h1>
          <p>Check the address or return home.</p>
          <div className="plain-page__actions">
            <a className="hero-action hero-action--primary" href="/">
              Return home
            </a>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}
