"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";
import { isolateBrowserLearnerContext } from "@/lib/auth/cache-isolation.client";

export function GuardianExitAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");

  async function exitProfile() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/profile-sessions/exit", {
        body: JSON.stringify({ password }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      if (!response.ok) {
        setError("The learner profile could not be closed. Try again.");
        return;
      }
      await isolateBrowserLearnerContext("profile_session_revoked");
      window.location.assign("/app");
    } catch {
      setError("The account service could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      <FormField
        description="A guardian password is required to reopen account controls."
        label="Guardian password"
      >
        <Input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          type="password"
          value={password}
        />
      </FormField>
      <Button
        className="w-full"
        disabled={!password}
        loading={pending}
        loadingLabel="Closing learner profile"
        onClick={() => void exitProfile()}
        variant="secondary"
      >
        Guardian exit
      </Button>
      <CredentialRecoveryHint returnTo="/app" />
      {error && (
        <p className="mt-2 mb-0 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
