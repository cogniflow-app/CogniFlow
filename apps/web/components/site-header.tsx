import { brandConfig } from "@lumen/config/brand";

import { AppearanceControls } from "./appearance-controls.client";
import { HeaderAccountAction } from "./header-account-action";

const navigation = [
  { href: "/", label: "Overview" },
  { href: "/join", label: "Join a game" },
  { href: "/safety", label: "Safety" },
] as const;

export function SiteHeader() {
  const links =
    process.env.NODE_ENV === "production"
      ? navigation
      : [...navigation, { href: "/dev/design-system" as const, label: "Components" }];

  return (
    <header className="site-header">
      <div className="site-container site-header__inner">
        <a className="brand-lockup" href="/" aria-label={`${brandConfig.name} home`}>
          <span aria-hidden="true" className="brand-lockup__mark" />
          <span>{brandConfig.name}</span>
        </a>
        <nav aria-label="Primary" className="site-nav">
          {links.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
          <HeaderAccountAction />
        </nav>
        <AppearanceControls />
      </div>
    </header>
  );
}
