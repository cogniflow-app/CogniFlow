"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";

export function ProfileSessionRevokeAction({
  profileSessionId,
}: {
  readonly profileSessionId: string;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/profile-sessions/revoke", {
        body: JSON.stringify({ password, profileSessionId }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "That learner session could not be revoked.");
        return;
      }
      window.location.assign("/app/settings/devices");
    } catch {
      setError("The session service could not be reached.");
    } finally {
      setPending(false);
      setPassword("");
    }
  }

  return (
    <div className="grid min-w-64 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <FormField label="Current password" required>
        <Input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          type="password"
          value={password}
        />
      </FormField>
      <Button
        disabled={password.length === 0}
        loading={pending}
        loadingLabel="Revoking session"
        onClick={() => void revoke()}
        variant="danger"
      >
        Revoke session
      </Button>
      <div className="sm:col-span-2">
        <CredentialRecoveryHint returnTo="/app/settings/devices" />
      </div>
      {error && (
        <p className="m-0 text-sm text-[var(--color-danger)] sm:col-span-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
