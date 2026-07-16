import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { GuardianExitAction } from "@/components/guardian-exit-action.client";

export const metadata: Metadata = { title: "Learner profile locked" };

export default function ProfileLockedPage() {
  return (
    <AuthShell
      eyebrow="Learner session ended"
      story="Your managed learner session ended. Account settings remain locked until a guardian confirms their password."
      title="Guardian controls remain locked."
    >
      <section className="auth-card" aria-labelledby="profile-locked-heading">
        <h2 id="profile-locked-heading">Guardian verification required</h2>
        <p className="auth-card__intro">
          Enter the guardian account password to leave the learner profile and return to account
          settings.
        </p>
        <GuardianExitAction />
      </section>
    </AuthShell>
  );
}
