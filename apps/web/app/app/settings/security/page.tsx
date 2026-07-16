import { Badge, LinkButton, PageHeader } from "@lumen/ui";
import type { Metadata } from "next";

import { SessionAction, SignOutAllDevicesAction } from "@/components/session-action.client";
import { requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettingsPage() {
  const account = await requireAccountContext({
    requireSelfLearner: true,
    returnTo: "/app/settings/security",
  });
  return (
    <>
      <PageHeader
        eyebrow="Account settings"
        title="Security"
        description="Authentication state is checked by Supabase Auth; sensitive mutations also require a fresh, rate-limited credential check."
      />
      <div className="grid gap-5">
        <section className="settings-card" aria-labelledby="email-security-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-xl" id="email-security-heading">
              Email account
            </h2>
            <Badge tone={account.emailVerified ? "success" : "warning"}>
              {account.emailVerified ? "Verified" : "Verification pending"}
            </Badge>
          </div>
          <p className="mt-3 mb-0 text-sm break-all text-[var(--color-text-muted)]">
            {account.email}
          </p>
          <LinkButton
            className="mt-4"
            href="/auth/forgot-password?returnTo=/app/settings/security"
            variant="secondary"
          >
            Reset password securely
          </LinkButton>
        </section>
        <section className="settings-card" aria-labelledby="session-security-heading">
          <h2 className="m-0 text-xl" id="session-security-heading">
            Auth sessions
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Current-device sign-out clears this browser. All-device sign-out asks Supabase Auth to
            invalidate every refresh session for the account.
          </p>
          <div className="grid gap-4">
            <div>
              <SessionAction>Sign out this device</SessionAction>
            </div>
            <SignOutAllDevicesAction />
          </div>
        </section>
      </div>
    </>
  );
}
