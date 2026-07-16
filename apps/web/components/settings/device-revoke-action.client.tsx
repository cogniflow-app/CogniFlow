"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";
import { isolateBrowserLearnerContext } from "@/lib/auth/cache-isolation.client";

export function DeviceRevokeAction({ deviceId }: { readonly deviceId: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/devices/revoke", {
        body: JSON.stringify({ deviceId, password }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { currentDevice?: boolean; message?: string };
      if (!response.ok) {
        setError(result.message ?? "That device could not be revoked.");
        return;
      }
      await isolateBrowserLearnerContext("profile_session_revoked");
      window.location.assign(
        result.currentDevice ? "/auth/sign-in?signedOut=1" : "/app/settings/devices",
      );
    } catch {
      setError("The device service could not be reached.");
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
        loadingLabel="Revoking"
        onClick={() => void revoke()}
        variant="danger"
      >
        Revoke
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
