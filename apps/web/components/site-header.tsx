import { brandConfig } from "@lumen/config/brand";

import { AppearanceControls } from "./appearance-controls.client";
import { AppearanceProvider } from "./appearance-provider.client";

const navigation = [
  { href: "/", label: "Overview" },
  { href: "/app", label: "App shell" },
  { href: "/auth", label: "Access" },
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
        </nav>
        <AppearanceProvider>
          <AppearanceControls />
        </AppearanceProvider>
      </div>
    </header>
  );
}
