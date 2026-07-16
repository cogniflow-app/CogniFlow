import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Guardian-managed profile required" };

export default function GuardianRequiredPage() {
  return (
    <AuthShell
      eyebrow="A different account path"
      story="Learners under 13 do not create an independent email account. A guardian signs in to their own account and creates a pseudonymous learner profile after the required consent process."
      title="A guardian keeps the account boundary."
    >
      <div className="auth-card">
        <h2>Ask a guardian to continue</h2>
        <p className="auth-card__intro">
          This beta does not collect a child email, exact birthday, school, address, or phone
          number.
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Child profiles remain unavailable in production. Future activation requires a separate
          child-facing identity boundary plus provider, consent, privacy, retention, incident
          response, and legal review.
        </p>
        <a className="font-bold text-[var(--color-brand)]" href="/">
          Return to the public site
        </a>
      </div>
    </AuthShell>
  );
}
