"use client";

import type { OAuthProviderName } from "@lumen/auth/providers";
import { Button } from "@lumen/ui";
import { useState } from "react";

export function ProviderConnectButton({
  provider,
  label,
}: {
  readonly label: string;
  readonly provider: OAuthProviderName;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/provider/link", {
        body: JSON.stringify({ provider }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string; next?: string };
      if (!response.ok || !result.next) {
        setError(result.message ?? "This provider could not be connected.");
        return;
      }
      window.location.assign(result.next);
    } catch {
      setError("This provider could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        loading={pending}
        loadingLabel={`Connecting ${label}`}
        onClick={() => void connect()}
        variant="secondary"
      >
        Connect {label}
      </Button>
      {error && (
        <p className="mt-2 mb-0 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
