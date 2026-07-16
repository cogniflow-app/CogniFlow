import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { GuardianExitAction } from "@/components/guardian-exit-action.client";

export const metadata: Metadata = { title: "Learner profile locked" };

export default function ProfileLockedPage() {
  return (
    <AuthShell
      eyebrow="Managed learner boundary"
      story="The learner study window ended or its local token no longer matches. Account controls stay closed until a guardian verifies their credential."
      title="Guardian controls remain locked."
    >
      <section className="auth-card" aria-labelledby="profile-locked-heading">
        <h2 id="profile-locked-heading">Guardian verification required</h2>
        <p className="auth-card__intro">
          Enter the guardian account password to end managed-learner mode. Reloading, waiting, or
          changing a browser token cannot reopen account settings.
        </p>
        <GuardianExitAction />
      </section>
    </AuthShell>
  );
}
