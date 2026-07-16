"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { AppearanceControls } from "./appearance-controls.client";

interface SiteNavigationLink {
  readonly href: string;
  readonly label: string;
}

interface SiteNavigationProps {
  readonly accountAction: ReactNode;
  readonly links: readonly SiteNavigationLink[];
}

export function SiteNavigation({ accountAction, links }: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) {
      return;
    }

    event.preventDefault();
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <div className="site-navigation" data-open={open ? "true" : "false"} onKeyDown={handleKeyDown}>
      <button
        ref={toggleRef}
        aria-controls="primary-navigation-panel"
        aria-expanded={open}
        aria-label={open ? "Close primary navigation" : "Open primary navigation"}
        className="site-navigation__toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" className="site-navigation__toggle-icon">
          <span />
          <span />
          <span />
        </span>
      </button>
      <div className="site-navigation__panel" id="primary-navigation-panel">
        <nav aria-label="Primary" className="site-nav">
          {links.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
          {accountAction}
        </nav>
        <AppearanceControls />
      </div>
    </div>
  );
}
