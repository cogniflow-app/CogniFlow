import type { ReactNode } from "react";

import { PageShell } from "@lumen/ui";

import { readProtectedReturnTo, requireAccountContext } from "@/lib/server/account-context";

const settingsNavigation = [
  ["/app/settings/profile", "Profile"],
  ["/app/settings/security", "Security"],
  ["/app/settings/connections", "Connected providers"],
  ["/app/settings/devices", "Devices and sessions"],
  ["/app/settings/learners", "Learner profiles"],
  ["/app/settings/guardian", "Guardian controls"],
  ["/app/settings/privacy", "Privacy and data"],
] as const;

export default async function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAccountContext({
    requireSelfLearner: true,
    returnTo: await readProtectedReturnTo("/app/settings/profile"),
  });
  return (
    <PageShell width="wide">
      <div className="settings-grid">
        <aside aria-label="Account settings">
          <nav className="settings-nav">
            {settingsNavigation.map(([href, label]) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </PageShell>
  );
}
