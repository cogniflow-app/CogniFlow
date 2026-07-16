import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Account link unavailable" };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const reason = (await searchParams).reason;
  const expired = reason === "expired";
  return (
    <AuthShell
      eyebrow="Link not accepted"
      story="Account links can expire, be used already, or fail an integrity check. We do not expose provider details on this screen."
      title={expired ? "That link has expired." : "That link could not be completed."}
    >
      <div className="auth-card" role="alert">
        <h2>{expired ? "Request a new link" : "Try a safe route"}</h2>
        <p className="auth-card__intro">
          No account changes were made. Return to sign in, magic link, or recovery and start again.
        </p>
        <div className="flex flex-wrap gap-3 text-sm font-bold">
          <a href="/auth/sign-in">Sign in</a>
          <a href="/auth/magic-link">New email link</a>
          <a href="/auth/forgot-password">Recover account</a>
        </div>
      </div>
    </AuthShell>
  );
}
