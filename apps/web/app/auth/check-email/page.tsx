import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthShell
      eyebrow="Email sent"
      story="Verification and recovery links are short-lived. If a link expires, return to the relevant form and request a fresh one."
      title="The next step is in your inbox."
    >
      <div className="auth-card" role="status">
        <h2>Check your email</h2>
        <p className="auth-card__intro">
          For privacy, this message is the same whether an account is new, existing, or unavailable.
        </p>
        <a className="font-bold text-[var(--color-brand)]" href="/auth/sign-in">
          Return to sign in
        </a>
      </div>
    </AuthShell>
  );
}
