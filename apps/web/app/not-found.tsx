export default function NotFound() {
  return (
    <main className="plain-page" id="main-content" tabIndex={-1}>
      <div className="site-container">
        <div className="plain-page__card">
          <span className="eyebrow">404 · Route not found</span>
          <h1>This path is not part of the foundation.</h1>
          <p>The navigation only lists destinations that are implemented and ready to inspect.</p>
          <div className="plain-page__actions">
            <a className="hero-action hero-action--primary" href="/">
              Return to overview
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
