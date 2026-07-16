import { normalizeReturnUrl } from "@lumen/auth/redirects";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form.client";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Email sign-in link" };

export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const safeReturnTo = normalizeReturnUrl((await searchParams).returnTo);
  return (
    <AuthShell
      eyebrow="Passwordless access"
      story="A short-lived sign-in link goes only to the email address on the account. The response never reveals whether an address is registered."
      title="One link. One safe return."
    >
      <div className="auth-card">
        <h2>Email me a sign-in link</h2>
        <p className="auth-card__intro">Open the link on this device to finish signing in.</p>
        <AuthForm mode="magic_link" returnTo={safeReturnTo} />
        <p className="mt-5 mb-0 text-sm">
          <a href={`/auth/sign-in?returnTo=${encodeURIComponent(safeReturnTo)}`}>Back to sign in</a>
        </p>
      </div>
    </AuthShell>
  );
}
