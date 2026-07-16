import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordUpdateForm } from "@/components/auth/password-update-form.client";

export const metadata: Metadata = { title: "Choose a new password" };

export default function UpdatePasswordPage() {
  return (
    <AuthShell
      eyebrow="Secure recovery"
      story="A valid recovery session is checked again on the server before the credential changes. An expired or reused link cannot update the account."
      title="Choose a new password."
    >
      <div className="auth-card">
        <h2>Update password</h2>
        <p className="auth-card__intro">
          This form works only after opening a valid recovery email.
        </p>
        <PasswordUpdateForm />
      </div>
    </AuthShell>
  );
}
