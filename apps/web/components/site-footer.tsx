import { brandConfig } from "@lumen/config/brand";
import { PageContainer } from "@lumen/ui/shells";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <PageContainer className="site-footer__inner" width="site">
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
      </PageContainer>
    </footer>
  );
}
