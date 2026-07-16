import type { ReactNode } from "react";

const informationLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/safety", label: "Safety" },
  { href: "/copyright", label: "Copyright" },
] as const;

export const publicInformationUpdated = "July 15, 2026";

interface PublicInformationPageProps {
  readonly children: ReactNode;
  readonly currentPath: (typeof informationLinks)[number]["href"];
  readonly eyebrow: string;
  readonly notice: ReactNode;
  readonly summary: string;
  readonly title: string;
}

export function PublicInformationPage({
  children,
  currentPath,
  eyebrow,
  notice,
  summary,
  title,
}: PublicInformationPageProps) {
  return (
    <main className="information-page" id="main-content" tabIndex={-1}>
      <div className="site-container information-layout">
        <aside className="information-sidebar">
          <p className="information-sidebar__label">Policies and safety</p>
          <nav aria-label="Public information">
            {informationLinks.map((link) => (
              <a
                aria-current={link.href === currentPath ? "page" : undefined}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="information-article">
          <header className="information-hero">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p className="information-hero__summary">{summary}</p>
            <p className="information-hero__updated">Last updated {publicInformationUpdated}</p>
          </header>

          <div className="information-note">{notice}</div>
          <div className="information-copy">{children}</div>
        </article>
      </div>
    </main>
  );
}
