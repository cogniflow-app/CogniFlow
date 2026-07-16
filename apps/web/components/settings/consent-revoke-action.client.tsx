"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";
import { isolateBrowserLearnerContext } from "@/lib/auth/cache-isolation.client";

export function ConsentRevokeAction({ consentRecordId }: { readonly consentRecordId: string }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/guardian/consent/revoke", {
        body: JSON.stringify({ consentRecordId, password, reason }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "Consent could not be revoked.");
        return;
      }
      await isolateBrowserLearnerContext("profile_session_revoked");
      window.location.reload();
    } catch {
      setError("The guardian-control service could not be reached.");
    } finally {
      setPending(false);
      setPassword("");
    }
  }

  return (
    <details className="mt-3 rounded-xl border border-[var(--color-border)] p-3">
      <summary className="cursor-pointer font-bold text-[var(--color-danger)]">
        Revoke this consent
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label="Reason">
          <Input
            maxLength={500}
            onChange={(event) => setReason(event.currentTarget.value)}
            value={reason}
          />
        </FormField>
        <FormField label="Current password" required>
          <Input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            type="password"
            value={password}
          />
        </FormField>
        <Button
          className="sm:col-span-2"
          disabled={!password}
          loading={pending}
          loadingLabel="Revoking consent"
          onClick={() => void revoke()}
          variant="danger"
        >
          Revoke and lock affected access
        </Button>
        <div className="sm:col-span-2">
          <CredentialRecoveryHint returnTo="/app/settings/guardian" />
        </div>
        {error && (
          <p className="m-0 text-sm text-[var(--color-danger)] sm:col-span-2" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
