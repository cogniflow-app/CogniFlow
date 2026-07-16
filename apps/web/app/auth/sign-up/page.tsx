import { normalizeAuthenticationReturnUrl } from "@lumen/auth/redirects";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form.client";
import { AuthShell } from "@/components/auth/auth-shell";
import { getConfiguredAuthProviders } from "@/lib/server/auth-providers";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo = normalizeAuthenticationReturnUrl(returnTo);
  return (
    <AuthShell
      eyebrow="A private beginning"
      story="Create one account for secure access, a private self learner profile, and user-controlled privacy settings."
      title="Start with less data, not more."
    >
      <div className="auth-card">
        <h2>Create your account</h2>
        <p className="auth-card__intro">
          We collect only what is needed to secure the account. Your learner preferences come next.
        </p>
        <AuthForm mode="sign_up" providers={getConfiguredAuthProviders()} returnTo={safeReturnTo} />
        <p className="mt-5 mb-0 text-sm text-[var(--color-text-muted)]">
          Already registered?{" "}
          <a
            className="font-bold text-[var(--color-brand)]"
            href={`/auth/sign-in?returnTo=${encodeURIComponent(safeReturnTo)}`}
          >
            Sign in
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
