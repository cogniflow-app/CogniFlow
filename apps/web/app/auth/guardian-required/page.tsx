import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Age requirement" };

export default function GuardianRequiredPage() {
  return (
    <AuthShell
      eyebrow="Age requirement"
      story="Independent accounts in this beta are limited to people age 13 or older. Guardian-managed child profiles are not currently available."
      title="This beta is for ages 13 and older."
    >
      <div className="auth-card">
        <h2>A child account cannot be created</h2>
        <p className="auth-card__intro">
          This beta does not collect a child email, exact birthday, school, address, or phone
          number.
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          If you are under 13, please stop here and ask a guardian to review this service with you.
        </p>
        <a className="font-bold text-[var(--color-brand)]" href="/">
          Return to the public site
        </a>
      </div>
    </AuthShell>
  );
}
