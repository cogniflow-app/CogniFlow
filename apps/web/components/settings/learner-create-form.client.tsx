"use client";

import { Button, FormField, Input, Select, Switch } from "@lumen/ui";
import { useRef, useState } from "react";

export function LearnerCreateForm({
  consentMode,
}: {
  readonly consentMode: "external_verified" | "test_only";
}) {
  const [ageBand, setAgeBand] = useState<"teen" | "under_13">("under_13");
  const [avatarSeed, setAvatarSeed] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pseudonym, setPseudonym] = useState("");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [seriousMode, setSeriousMode] = useState(true);
  const [increasedSpacing, setIncreasedSpacing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  async function createLearner() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/learners", {
        body: JSON.stringify({
          ageBand,
          avatarSeed,
          displayName,
          idempotencyKey: idempotencyKey.current,
          preferences: {
            readingStyle: increasedSpacing ? "increased_spacing" : "standard",
            reduceMotion,
            seriousMode,
            theme,
          },
          pseudonym,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "The learner profile could not be created.");
        return;
      }
      window.location.reload();
    } catch {
      setError("The learner profile service could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-card grid gap-5" aria-labelledby="new-learner-heading">
      <div>
        <h2 className="m-0 text-xl" id="new-learner-heading">
          Create a guardian-managed learner
        </h2>
        <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
          No child email, birthday, school, address, or phone is collected.{" "}
          {consentMode === "test_only"
            ? "This local/test deployment records explicitly labelled test consent evidence."
            : "This deployment requires verified external parental-consent evidence; an owner checkbox is not accepted."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Display name" required>
          <Input
            maxLength={80}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            value={displayName}
          />
        </FormField>
        <FormField
          description="A privacy-safe name used in shared contexts."
          label="Pseudonym"
          required
        >
          <Input
            maxLength={40}
            onChange={(event) => setPseudonym(event.currentTarget.value)}
            value={pseudonym}
          />
        </FormField>
        <FormField label="Age band" required>
          <Select
            onValueChange={(value) => setAgeBand(value === "teen" ? "teen" : "under_13")}
            options={[
              { label: "Under 13", value: "under_13" },
              { label: "Teen", value: "teen" },
            ]}
            value={ageBand}
          />
        </FormField>
        <FormField
          description="Letters, numbers, underscores, or hyphens; used to render a stable abstract avatar."
          label="Avatar seed"
          required
        >
          <Input
            maxLength={64}
            onChange={(event) => setAvatarSeed(event.currentTarget.value)}
            value={avatarSeed}
          />
        </FormField>
        <FormField label="Theme">
          <Select
            onValueChange={(value) =>
              setTheme(value === "dark" ? "dark" : value === "light" ? "light" : "system")
            }
            options={[
              { label: "System", value: "system" },
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
            ]}
            value={theme}
          />
        </FormField>
      </div>
      <Switch
        checked={reduceMotion}
        description="Avoid nonessential motion in this learner context."
        label="Reduce motion"
        onCheckedChange={setReduceMotion}
      />
      <Switch
        checked={seriousMode}
        description="Suppress celebration, sound, and game spectacle."
        label="Serious mode"
        onCheckedChange={setSeriousMode}
      />
      <Switch
        checked={increasedSpacing}
        description="Use more generous reading spacing."
        label="Increased reading spacing"
        onCheckedChange={setIncreasedSpacing}
      />
      <Button
        disabled={!displayName || !pseudonym || !avatarSeed}
        loading={pending}
        loadingLabel="Creating learner"
        onClick={() => void createLearner()}
      >
        Create learner profile
      </Button>
      {error && (
        <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
