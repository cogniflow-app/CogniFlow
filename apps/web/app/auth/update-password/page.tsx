import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordUpdateForm } from "@/components/auth/password-update-form.client";

export const metadata: Metadata = { title: "Choose a new password" };

export default function UpdatePasswordPage() {
  return (
    <AuthShell
      eyebrow="Secure recovery"
      story="Only a valid, unexpired recovery link can change your password."
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
