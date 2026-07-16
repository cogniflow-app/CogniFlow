"use client";

import { brandConfig } from "@lumen/config/brand";
import { Button, Switch } from "@lumen/ui";
import { useState } from "react";

interface PrivacyPreferenceState {
  readonly allowProductUpdates: boolean;
  readonly allowSocialInteractions: boolean;
  readonly defaultContentPrivate: boolean;
  readonly firstPartyAnalytics: boolean;
}

export function PrivacyPreferencesForm({ initial }: { readonly initial: PrivacyPreferenceState }) {
  const [preferences, setPreferences] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/settings/privacy/preferences", {
        body: JSON.stringify({
          preferences: {
            allowProductUpdates: preferences.allowProductUpdates,
            allowSocialInteractions: preferences.allowSocialInteractions,
            analytics: preferences.firstPartyAnalytics ? "first_party_product" : "essential_only",
            defaultContentPrivate: preferences.defaultContentPrivate,
          },
          target: { kind: "account" },
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "PATCH",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "Privacy choices could not be saved.");
        return;
      }
      setMessage(result.message ?? "Privacy choices saved.");
    } catch {
      setError("Privacy choices could not reach the account service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-card grid gap-5" aria-labelledby="privacy-choices-heading">
      <div>
        <h2 className="m-0 text-xl" id="privacy-choices-heading">
          Account defaults
        </h2>
        <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
          Targeted advertising and data sale remain disabled in every mode.
        </p>
      </div>
      <Switch
        checked={preferences.defaultContentPrivate}
        description="This preference is stored, but study-content creation and sharing are not available in this beta."
        label="Private by default"
        onCheckedChange={(checked) =>
          setPreferences((current) => ({ ...current, defaultContentPrivate: checked }))
        }
      />
      <Switch
        checked={preferences.allowSocialInteractions}
        description="This preference is stored, but social interaction features are not available in this beta."
        label="Allow social interactions"
        onCheckedChange={(checked) =>
          setPreferences((current) => ({ ...current, allowSocialInteractions: checked }))
        }
      />
      <Switch
        checked={preferences.firstPartyAnalytics}
        description="Store whether limited first-party product analytics may be used if enabled. Turning this off permits essential operational telemetry only."
        label="First-party product analytics"
        onCheckedChange={(checked) =>
          setPreferences((current) => ({ ...current, firstPartyAnalytics: checked }))
        }
      />
      <Switch
        checked={preferences.allowProductUpdates}
        description={`Store whether ${brandConfig.name} may send optional product announcements. Transactional security mail is unaffected.`}
        label="Product updates"
        onCheckedChange={(checked) =>
          setPreferences((current) => ({ ...current, allowProductUpdates: checked }))
        }
      />
      <Button loading={pending} loadingLabel="Saving privacy choices" onClick={() => void save()}>
        Save privacy choices
      </Button>
      <div aria-live="polite" className="min-h-6 text-sm">
        {error && (
          <p className="m-0 text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
        {message && <p className="m-0 text-[var(--color-success)]">{message}</p>}
      </div>
    </section>
  );
}
