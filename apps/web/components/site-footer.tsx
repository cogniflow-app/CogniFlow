import { brandConfig } from "@lumen/config/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container site-footer__inner">
        <div className="site-footer__identity">
          <strong>{brandConfig.name}</strong>
          <span>Durable learning starts with trustworthy account boundaries.</span>
        </div>
        <nav aria-label="Policies">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/safety">Safety</a>
          <a href="/copyright">Copyright</a>
        </nav>
        <span className="site-footer__stance">No ads. No sale of learner data.</span>
      </div>
    </footer>
  );
}
