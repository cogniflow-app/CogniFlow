"use client";

import { BookOpenIcon, GlobeIcon, LockIcon, UserIcon, UsersIcon } from "@lumen/ui";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

interface WorkspaceNavigationItem {
  readonly exact?: boolean;
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly label: string;
}

const primaryItems: readonly WorkspaceNavigationItem[] = [
  { exact: true, href: "/app", icon: BookOpenIcon, label: "Library" },
  { href: "/app/published", icon: GlobeIcon, label: "Published" },
] as const;

const accountItems: readonly WorkspaceNavigationItem[] = [
  { href: "/app/settings/profile", icon: UserIcon, label: "Profile" },
  { href: "/app/settings/learners", icon: UsersIcon, label: "Learner profiles" },
  { href: "/app/settings/privacy", icon: LockIcon, label: "Privacy" },
] as const;

function NavigationList({
  items,
  onNavigate,
}: {
  readonly items: readonly WorkspaceNavigationItem[];
  readonly onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname() ?? "";

  return (
    <>
      {items.map((item) => {
        const current = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <a
            aria-current={current ? "page" : undefined}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <span aria-hidden="true" className="workspace-nav-symbol">
              <Icon />
            </span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </>
  );
}

export function WorkspaceNavigation({
  onNavigate,
  selfMode,
}: {
  readonly onNavigate?: (() => void) | undefined;
  readonly selfMode: boolean;
}) {
  return (
    <nav aria-label="Workspace navigation" className="workspace-navigation">
      <div className="workspace-navigation__group">
        <span className="workspace-navigation__label">Content</span>
        <NavigationList items={primaryItems} onNavigate={onNavigate} />
      </div>
      {selfMode && (
        <div className="workspace-navigation__group">
          <span className="workspace-navigation__label">Account</span>
          <NavigationList items={accountItems} onNavigate={onNavigate} />
        </div>
      )}
    </nav>
  );
}
