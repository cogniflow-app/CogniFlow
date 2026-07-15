import { brandConfig } from "@lumen/config/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container site-footer__inner">
        <span>{brandConfig.name} · a learning platform foundation</span>
        <span>No ads. No sale of learner data.</span>
      </div>
    </footer>
  );
}
