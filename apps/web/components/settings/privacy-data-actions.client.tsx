"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";
import { isolateBrowserLearnerContext } from "@/lib/auth/cache-isolation.client";

export function ExportRequestAction() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestExport() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/privacy/export", {
        body: JSON.stringify({ format: "json_archive", scope: "complete_account" }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? "The export request could not be queued.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("The export service could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        loading={pending}
        loadingLabel="Requesting export"
        onClick={() => void requestExport()}
        variant="secondary"
      >
        Request JSON archive
      </Button>
      {message && (
        <p className="mt-2 mb-0 text-sm text-[var(--color-danger)]" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

export function DeletionRequestAction() {
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestDeletion() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/privacy/delete", {
        body: JSON.stringify({ confirmationPhrase, password }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "The deletion request could not be queued.");
        return;
      }
      await isolateBrowserLearnerContext("account_deletion_started");
      window.location.reload();
    } catch {
      setError("The deletion service could not be reached.");
    } finally {
      setPending(false);
      setPassword("");
    }
  }

  return (
    <div className="grid gap-4">
      <FormField
        description={
          <>
            Type <strong>DELETE MY ACCOUNT</strong> exactly.
          </>
        }
        label="Confirmation phrase"
        required
      >
        <Input
          autoComplete="off"
          onChange={(event) => setConfirmationPhrase(event.currentTarget.value)}
          value={confirmationPhrase}
        />
      </FormField>
      <FormField
        description="A fresh credential check is required and rate-limited."
        label="Current password"
        required
      >
        <Input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          type="password"
          value={password}
        />
      </FormField>
      <Button
        disabled={confirmationPhrase !== "DELETE MY ACCOUNT" || password.length === 0}
        loading={pending}
        loadingLabel="Queueing deletion"
        onClick={() => void requestDeletion()}
        variant="danger"
      >
        Request account deletion
      </Button>
      <CredentialRecoveryHint returnTo="/app/settings/privacy" />
      {error && (
        <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CancelDeletionAction({ deletionJobId }: { readonly deletionJobId: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelDeletion() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/privacy/delete/cancel", {
        body: JSON.stringify({ deletionJobId, password }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "Deletion could not be cancelled.");
        return;
      }
      window.location.reload();
    } catch {
      setError("The account service could not be reached.");
    } finally {
      setPending(false);
      setPassword("");
    }
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
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
        loadingLabel="Cancelling deletion"
        onClick={() => void cancelDeletion()}
        variant="secondary"
      >
        Cancel deletion
      </Button>
      <div className="sm:col-span-2">
        <CredentialRecoveryHint returnTo="/app/settings/privacy" />
      </div>
      {error && (
        <p className="m-0 text-sm text-[var(--color-danger)] sm:col-span-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
