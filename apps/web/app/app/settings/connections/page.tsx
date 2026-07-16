import { Badge, PageHeader } from "@lumen/ui";
import type { Metadata } from "next";

import { ProviderConnectButton } from "@/components/settings/provider-connect-button.client";
import { getConfiguredAuthProviders } from "@/lib/server/auth-providers";
import { requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = { title: "Connected providers" };

export default async function ConnectionsPage() {
  const account = await requireAccountContext({ returnTo: "/app/settings/connections" });
  const oauth = getConfiguredAuthProviders().filter((provider) => provider.kind === "oauth");
  const connected = new Set(
    account.identities.map((identity) =>
      identity.provider === "azure" ? "microsoft" : identity.provider,
    ),
  );
  return (
    <>
      <PageHeader
        eyebrow="Account settings"
        title="Connected providers"
        description="These are the identities reported by Supabase Auth for this account. Provider buttons appear only when owner configuration enables them."
      />
      <div className="grid gap-4">
        <section className="settings-card flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-lg">Email</h2>
              <Badge tone="success">Connected</Badge>
            </div>
            <p className="mt-1 mb-0 text-sm text-[var(--color-text-muted)]">
              {account.email} · {account.emailVerified ? "verified" : "verification pending"}
            </p>
          </div>
        </section>
        {oauth.map((provider) => {
          const isConnected = connected.has(provider.id);
          return (
            <section
              className="settings-card flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
              key={provider.id}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="m-0 text-lg">{provider.label}</h2>
                  <Badge tone={isConnected ? "success" : "neutral"}>
                    {isConnected ? "Connected" : "Available"}
                  </Badge>
                </div>
                <p className="mt-1 mb-0 text-sm text-[var(--color-text-muted)]">
                  {isConnected
                    ? "This provider can sign in to your account."
                    : "Connecting requires the provider and manual identity linking to be enabled in Supabase."}
                </p>
              </div>
              {!isConnected && (
                <ProviderConnectButton
                  label={provider.label}
                  provider={provider.id as "github" | "google" | "microsoft"}
                />
              )}
            </section>
          );
        })}
        {oauth.length === 0 && (
          <section className="settings-card">
            <h2 className="m-0 text-lg">No optional providers configured</h2>
            <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
              Email/password and secure email-link sign-in remain available. The owner can enable
              Google, GitHub, or Microsoft after provider setup.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
