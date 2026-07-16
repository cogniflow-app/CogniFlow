import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form.client";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Recover account" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      story="Recovery messages use the same neutral response whether or not an address is registered, which helps prevent account enumeration."
      title="A careful way back in."
    >
      <div className="auth-card">
        <h2>Reset your password</h2>
        <p className="auth-card__intro">
          If an account can use this address, recovery instructions will arrive shortly.
        </p>
        <AuthForm mode="forgot_password" returnTo="/auth/update-password" />
        <p className="mt-5 mb-0 text-sm">
          <a href="/auth/sign-in">Back to sign in</a>
        </p>
      </div>
    </AuthShell>
  );
}
