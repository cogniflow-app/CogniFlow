import { normalizeAuthenticationReturnUrl } from "@lumen/auth/redirects";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form.client";
import { AuthShell } from "@/components/auth/auth-shell";
import { getConfiguredAuthProviders } from "@/lib/server/auth-providers";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ accessChanged?: string; returnTo?: string }>;
}) {
  const { accessChanged, returnTo } = await searchParams;
  const safeReturnTo = normalizeAuthenticationReturnUrl(returnTo);
  return (
    <AuthShell
      eyebrow="Welcome back"
      story="Your account controls access. Your active learner profile stays separate from private account settings."
      title="Return to your private workspace."
    >
      <div className="auth-card">
        <h2>Sign in</h2>
        {accessChanged === "1" && (
          <p role="status">
            This browser’s access changed while it was disconnected. Private offline data was
            cleared; sign in again to continue.
          </p>
        )}
        <p className="auth-card__intro">
          Use your password, a secure email link, or an available sign-in provider.
        </p>
        <AuthForm mode="sign_in" providers={getConfiguredAuthProviders()} returnTo={safeReturnTo} />
        <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm font-semibold">
          <a href={`/auth/magic-link?returnTo=${encodeURIComponent(safeReturnTo)}`}>
            Use an email link
          </a>
          <a href="/auth/forgot-password">Forgot password?</a>
        </div>
        <p className="mt-6 mb-0 text-sm text-[var(--color-text-muted)]">
          New here?{" "}
          <a
            className="font-bold text-[var(--color-brand)]"
            href={`/auth/sign-up?returnTo=${encodeURIComponent(safeReturnTo)}`}
          >
            Create an account
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
