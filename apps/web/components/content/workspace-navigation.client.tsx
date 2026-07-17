"use client";

import { usePathname } from "next/navigation";

interface WorkspaceNavigationItem {
  readonly exact?: boolean;
  readonly href: string;
  readonly label: string;
  readonly symbol: string;
}

const primaryItems: readonly WorkspaceNavigationItem[] = [
  { exact: true, href: "/app", label: "Library", symbol: "⌂" },
] as const;

const accountItems: readonly WorkspaceNavigationItem[] = [
  { href: "/app/settings/profile", label: "Profile", symbol: "◉" },
  { href: "/app/settings/learners", label: "Learner profiles", symbol: "◎" },
  { href: "/app/settings/privacy", label: "Privacy", symbol: "◇" },
] as const;

function NavigationList({ items }: { readonly items: readonly WorkspaceNavigationItem[] }) {
  const pathname = usePathname() ?? "";

  return (
    <>
      {items.map((item) => {
        const current = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <a aria-current={current ? "page" : undefined} href={item.href} key={item.href}>
            <span aria-hidden="true" className="workspace-nav-symbol">
              {item.symbol}
            </span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </>
  );
}

export function WorkspaceNavigation({ selfMode }: { readonly selfMode: boolean }) {
  return (
    <nav aria-label="Workspace navigation" className="workspace-navigation">
      <div className="workspace-navigation__group">
        <span className="workspace-navigation__label">Content</span>
        <NavigationList items={primaryItems} />
      </div>
      {selfMode && (
        <div className="workspace-navigation__group">
          <span className="workspace-navigation__label">Account</span>
          <NavigationList items={accountItems} />
        </div>
      )}
    </nav>
  );
}
