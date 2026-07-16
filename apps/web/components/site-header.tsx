import { brandConfig } from "@lumen/config/brand";
import { PageContainer } from "@lumen/ui/shells";

import { HeaderAccountAction } from "./header-account-action";
import { SiteNavigation } from "./site-navigation.client";

const navigation = [
  { href: "/", label: "Overview" },
  { href: "/join", label: "Enter a room code" },
  { href: "/safety", label: "Safety" },
] as const;

export function SiteHeader() {
  const links =
    process.env.NODE_ENV === "production"
      ? navigation
      : [...navigation, { href: "/dev/design-system" as const, label: "Components" }];

  return (
    <header className="site-header">
      <PageContainer className="site-header__inner" width="site">
        <a className="brand-lockup" href="/" aria-label={`${brandConfig.name} home`}>
          <span aria-hidden="true" className="brand-lockup__mark" />
          <span>{brandConfig.name}</span>
        </a>
        <SiteNavigation accountAction={<HeaderAccountAction />} links={links} />
      </PageContainer>
    </header>
  );
}
