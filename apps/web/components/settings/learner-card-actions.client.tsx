"use client";

import { Button, FormField, Input, Select, Switch } from "@lumen/ui";
import { useRef, useState } from "react";

import { CredentialRecoveryHint } from "@/components/credential-recovery-hint";
import {
  isolateBrowserLearnerContext,
  replaceWithActiveLearnerDocument,
} from "@/lib/auth/cache-isolation.client";

interface ManagedLearnerInitial {
  readonly avatarSeed: string;
  readonly displayName: string;
  readonly id: string;
  readonly preferences: {
    readonly readingStyle: "increased_spacing" | "standard";
    readonly reduceMotion: boolean;
    readonly seriousMode: boolean;
    readonly theme: "dark" | "light" | "system";
  };
  readonly pseudonym: string;
  readonly status: string;
}

export function LearnerEditAction({ initial }: { readonly initial: ManagedLearnerInitial }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [pseudonym, setPseudonym] = useState(initial.pseudonym);
  const [avatarSeed, setAvatarSeed] = useState(initial.avatarSeed);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/learners", {
        body: JSON.stringify({
          avatarSeed,
          displayName,
          learnerProfileId: initial.id,
          preferences,
          pseudonym,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "PATCH",
      });
      const result = (await response.json()) as { message?: string };
      setMessage(
        response.ok
          ? (result.message ?? "Learner profile saved.")
          : (result.message ?? "The learner profile could not be saved."),
      );
    } catch {
      setMessage("The learner profile service could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-xl border border-[var(--color-border)] p-4">
      <summary className="cursor-pointer font-bold">Rename and preferences</summary>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Display name">
            <Input
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              value={displayName}
            />
          </FormField>
          <FormField label="Pseudonym">
            <Input
              onChange={(event) => setPseudonym(event.currentTarget.value)}
              value={pseudonym}
            />
          </FormField>
          <FormField label="Avatar seed">
            <Input
              onChange={(event) => setAvatarSeed(event.currentTarget.value)}
              value={avatarSeed}
            />
          </FormField>
          <FormField label="Theme">
            <Select
              onValueChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  theme: value === "dark" ? "dark" : value === "light" ? "light" : "system",
                }))
              }
              options={[
                { label: "System", value: "system" },
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
              ]}
              value={preferences.theme}
            />
          </FormField>
        </div>
        <Switch
          checked={preferences.reduceMotion}
          label="Reduce motion"
          onCheckedChange={(checked) =>
            setPreferences((current) => ({ ...current, reduceMotion: checked }))
          }
        />
        <Switch
          checked={preferences.seriousMode}
          label="Serious mode"
          onCheckedChange={(checked) =>
            setPreferences((current) => ({ ...current, seriousMode: checked }))
          }
        />
        <Switch
          checked={preferences.readingStyle === "increased_spacing"}
          label="Increased reading spacing"
          onCheckedChange={(checked) =>
            setPreferences((current) => ({
              ...current,
              readingStyle: checked ? "increased_spacing" : "standard",
            }))
          }
        />
        <Button loading={pending} loadingLabel="Saving learner" onClick={() => void save()}>
          Save learner
        </Button>
        {message && (
          <p className="m-0 text-sm" role="status">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}

export function ProfileAccessAction({ learnerProfileId }: { readonly learnerProfileId: string }) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [lockAfterMinutes, setLockAfterMinutes] = useState("15");
  const [familyCode, setFamilyCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function configure() {
    setPending(true);
    setError(null);
    setFamilyCode(null);
    try {
      const response = await fetch("/api/settings/learners/access", {
        body: JSON.stringify({
          learnerProfileId,
          idempotencyKey: idempotencyKey.current,
          lockAfterMinutes: Number(lockAfterMinutes),
          password,
          pin,
          pinConfirmation: confirmation,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as {
        code?: string;
        familyCode?: string;
        message?: string;
      };
      if (!response.ok || !result.familyCode) {
        if (result.code === "CONFLICT") idempotencyKey.current = crypto.randomUUID();
        setError(result.message ?? "Profile access could not be configured.");
        return;
      }
      setFamilyCode(result.familyCode);
      idempotencyKey.current = crypto.randomUUID();
    } catch {
      setError("The profile access service could not be reached.");
    } finally {
      setPending(false);
      setPassword("");
      setPin("");
      setConfirmation("");
    }
  }

  return (
    <details className="rounded-xl border border-[var(--color-border)] p-4">
      <summary className="cursor-pointer font-bold">Set or rotate PIN and family code</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField description="Use 6–12 nontrivial digits." label="New PIN" required>
          <Input
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => setPin(event.currentTarget.value)}
            type="password"
            value={pin}
          />
        </FormField>
        <FormField label="Confirm PIN" required>
          <Input
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            type="password"
            value={confirmation}
          />
        </FormField>
        <FormField label="Lock after minutes" required>
          <Input
            max={30}
            min={5}
            onChange={(event) => setLockAfterMinutes(event.currentTarget.value)}
            type="number"
            value={lockAfterMinutes}
          />
        </FormField>
        <FormField
          description="Required before rotating access secrets."
          label="Guardian password"
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
          className="sm:col-span-2"
          disabled={!pin || pin !== confirmation || !password}
          loading={pending}
          loadingLabel="Rotating access"
          onClick={() => void configure()}
          variant="secondary"
        >
          Rotate profile access
        </Button>
        <div className="sm:col-span-2">
          <CredentialRecoveryHint returnTo="/app/settings/learners" />
        </div>
        {familyCode && (
          <div
            className="rounded-xl border border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)] p-4 sm:col-span-2"
            role="status"
          >
            <strong>
              Save this family code now:{" "}
              <span className="font-mono text-lg tracking-widest">{familyCode}</span>
            </strong>
            <p className="mt-1 mb-0 text-sm">
              It is stored only as a digest and will not be shown again.
            </p>
          </div>
        )}
        {error && (
          <p className="m-0 text-sm text-[var(--color-danger)] sm:col-span-2" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

export function ProfileSwitchAction({ learnerProfileId }: { readonly learnerProfileId: string }) {
  const [familyCode, setFamilyCode] = useState("");
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchProfile() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/profile-sessions", {
        body: JSON.stringify({ familyCode, learnerProfileId, pin }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "The learner profile could not be opened.");
        return;
      }
      try {
        await isolateBrowserLearnerContext("learner_profile_switched");
      } catch {
        // The server-side session switch is already authoritative. Cleanup is
        // best-effort and must not turn a successful switch into an error state.
      } finally {
        // The server has already changed the HttpOnly profile session. Always
        // replace the guardian document, even if a browser cleanup API fails.
        replaceWithActiveLearnerDocument();
      }
    } catch {
      setError("The profile switch service could not be reached.");
    } finally {
      setPending(false);
      setPin("");
    }
  }

  return (
    <details className="rounded-xl border border-[var(--color-border)] p-4">
      <summary className="cursor-pointer font-bold">Open this learner profile</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FormField label="Family code" required>
          <Input
            autoCapitalize="characters"
            maxLength={16}
            onChange={(event) => setFamilyCode(event.currentTarget.value)}
            value={familyCode}
          />
        </FormField>
        <FormField label="PIN" required>
          <Input
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => setPin(event.currentTarget.value)}
            type="password"
            value={pin}
          />
        </FormField>
        <Button
          disabled={!familyCode || !pin}
          loading={pending}
          loadingLabel="Opening profile"
          onClick={() => void switchProfile()}
        >
          Open profile
        </Button>
        {error && (
          <p className="m-0 text-sm text-[var(--color-danger)] sm:col-span-3" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
