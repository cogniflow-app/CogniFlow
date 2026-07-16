"use client";

import { Button, FormField, Input, type ButtonProps } from "@lumen/ui";
import { useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";
import { isolateBrowserLearnerContext } from "@/lib/auth/cache-isolation.client";

export function SessionAction({
  children,
  variant = "secondary",
}: {
  readonly children: string;
  readonly variant?: ButtonProps["variant"];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        body: JSON.stringify({ scope: "current" }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      if (!response.ok) {
        setError("Sign-out could not be completed. Try again.");
        return;
      }
      await isolateBrowserLearnerContext("account_signed_out");
      window.location.assign("/auth/sign-in?signedOut=1");
    } catch {
      setError("Sign-out could not reach the account service. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        loading={pending}
        loadingLabel="Signing out"
        onClick={() => void signOut()}
        variant={variant}
      >
        {children}
      </Button>
      {error && (
        <p className="mt-2 mb-0 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SignOutAllDevicesAction() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signOutAll() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        body: JSON.stringify({ password, scope: "all" }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "All-device sign-out could not be completed.");
        return;
      }
      await isolateBrowserLearnerContext("account_signed_out_all");
      window.location.assign("/auth/sign-in?signedOut=1");
    } catch {
      setError("Sign-out could not reach the account service. Check your connection.");
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
        loadingLabel="Signing out"
        onClick={() => void signOutAll()}
        variant="danger"
      >
        Sign out all devices
      </Button>
      <div className="sm:col-span-2">
        <CredentialRecoveryHint returnTo="/app/settings/security" />
      </div>
      {error && (
        <p className="m-0 text-sm text-[var(--color-danger)] sm:col-span-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
