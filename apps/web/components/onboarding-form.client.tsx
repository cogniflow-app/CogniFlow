"use client";

import { Button, Checkbox, FormField, Input, Select, Switch } from "@lumen/ui";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";

interface OnboardingFields {
  displayName: string;
  handle: string;
  learningGoals: string[];
  locale: string;
  preferences: {
    readingStyle: "increased_spacing" | "standard";
    reduceMotion: boolean;
    seriousMode: boolean;
    theme: "dark" | "light" | "system";
  };
  studyDayStartMinutes: number;
  timeZone: string;
}

const learningGoals = [
  ["long_term_retention", "Remember for the long term"],
  ["exam_preparation", "Prepare for an exam"],
  ["language_learning", "Learn a language"],
  ["professional_certification", "Earn a certification"],
  ["classroom_learning", "Learn or teach in a class"],
] as const;

export function OnboardingForm({
  defaultLocale,
  defaultTimeZone,
  returnTo,
  verifiedAgeBand,
}: {
  readonly defaultLocale: string;
  readonly defaultTimeZone: string;
  readonly returnTo: string;
  readonly verifiedAgeBand: "adult" | "teen";
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<OnboardingFields>({
    defaultValues: {
      displayName: "",
      handle: "",
      learningGoals: [],
      locale: defaultLocale,
      preferences: {
        readingStyle: "standard",
        reduceMotion: false,
        seriousMode: false,
        theme: "system",
      },
      studyDayStartMinutes: 240,
      timeZone: defaultTimeZone,
    },
  });

  const submit = handleSubmit(async (fields) => {
    setError(null);
    if (!navigator.onLine) {
      setError("You appear to be offline. Reconnect to finish account setup.");
      return;
    }
    try {
      const response = await fetch("/api/onboarding", {
        body: JSON.stringify(fields),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string; next?: string };
      if (!response.ok) {
        setError(
          result.message ?? "Account setup could not be saved. Review the form and try again.",
        );
        return;
      }
      window.location.assign(result.next ?? returnTo);
    } catch {
      setError("The account service could not be reached. Your entries remain in this form.");
    }
  });

  return (
    <form className="grid gap-7" noValidate onSubmit={submit}>
      <section aria-labelledby="identity-heading" className="settings-card grid gap-5">
        <div>
          <h2 className="m-0 text-xl" id="identity-heading">
            Your study identity
          </h2>
          <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
            Use a name you are comfortable seeing while you study. Public creator details remain off
            until you choose otherwise in a later publishing flow.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <FormField error={errors.displayName?.message} label="Display name" required>
            <Input
              autoComplete="name"
              {...register("displayName", {
                maxLength: { message: "Use 80 characters or fewer", value: 80 },
                required: "Enter a display name",
              })}
            />
          </FormField>
          <FormField
            description="Lowercase letters, numbers, and underscores."
            error={errors.handle?.message}
            label="Handle"
            required
          >
            <Input
              autoCapitalize="none"
              spellCheck={false}
              {...register("handle", {
                maxLength: { message: "Use 30 characters or fewer", value: 30 },
                minLength: { message: "Use at least 3 characters", value: 3 },
                pattern: {
                  message: "Use lowercase letters, numbers, and internal underscores",
                  value: /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/u,
                },
                required: "Choose a handle",
              })}
            />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="age-heading" className="settings-card grid gap-5">
        <div>
          <h2 className="m-0 text-xl" id="age-heading">
            Choose the right account path
          </h2>
          <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
            We store an age range, not your exact birthday.
          </p>
        </div>
        <p className="m-0 font-semibold">
          {verifiedAgeBand === "adult" ? "18 or older" : "13 to 17"}
        </p>
        <a
          className="w-fit text-sm font-bold text-[var(--color-brand)]"
          href={`/onboarding?returnTo=${encodeURIComponent(returnTo)}&age=change`}
        >
          Choose a different age range
        </a>
      </section>

      <section aria-labelledby="rhythm-heading" className="settings-card grid gap-5">
        <div>
          <h2 className="m-0 text-xl" id="rhythm-heading">
            Your study-day rhythm
          </h2>
          <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
            Times are stored in UTC and interpreted using your IANA time zone and study-day
            boundary.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <FormField error={errors.locale?.message} label="Locale" required>
            <Input {...register("locale", { required: "Enter a locale" })} />
          </FormField>
          <FormField error={errors.timeZone?.message} label="Time zone" required>
            <Input {...register("timeZone", { required: "Enter an IANA time zone" })} />
          </FormField>
          <FormField
            description="Minutes after midnight; 240 means 4:00 AM."
            error={errors.studyDayStartMinutes?.message}
            label="Study day starts"
            required
          >
            <Input
              max={1439}
              min={0}
              type="number"
              {...register("studyDayStartMinutes", {
                max: { message: "Use 1439 or less", value: 1439 },
                min: { message: "Use zero or more", value: 0 },
                required: "Choose a study-day start",
                valueAsNumber: true,
              })}
            />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="goals-heading" className="settings-card grid gap-4">
        <div>
          <h2 className="m-0 text-xl" id="goals-heading">
            Learning goals
          </h2>
          <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
            Optional. These guide recommendations without limiting what you can do.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {learningGoals.map(([value, label]) => (
            <Controller
              control={control}
              key={value}
              name="learningGoals"
              render={({ field }) => (
                <Checkbox
                  checked={field.value.includes(value)}
                  className="ml-1"
                  label={label}
                  onCheckedChange={(checked) => {
                    field.onChange(
                      checked
                        ? [...field.value, value]
                        : field.value.filter((goal) => goal !== value),
                    );
                  }}
                />
              )}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="appearance-heading" className="settings-card grid gap-5">
        <div>
          <h2 className="m-0 text-xl" id="appearance-heading">
            Comfort and focus
          </h2>
          <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
            These preferences follow your account. Operating-system reduced motion is respected
            independently.
          </p>
        </div>
        <FormField label="Theme">
          <Controller
            control={control}
            name="preferences.theme"
            render={({ field }) => (
              <Select
                name={field.name}
                onValueChange={field.onChange}
                options={[
                  { label: "Use system setting", value: "system" },
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                ]}
                value={field.value}
              />
            )}
          />
        </FormField>
        <Controller
          control={control}
          name="preferences.reduceMotion"
          render={({ field }) => (
            <Switch
              checked={field.value}
              description="Avoid flips, zooms, and celebratory movement."
              label="Reduce motion"
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="preferences.seriousMode"
          render={({ field }) => (
            <Switch
              checked={field.value}
              description="Suppress celebrations, game effects, and sound."
              label="Serious mode"
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="preferences.readingStyle"
          render={({ field }) => (
            <Switch
              checked={field.value === "increased_spacing"}
              description="Use more space between letters, words, and lines."
              label="Increased reading spacing"
              onCheckedChange={(checked) =>
                field.onChange(checked ? "increased_spacing" : "standard")
              }
            />
          )}
        />
      </section>

      <Button loading={isSubmitting} loadingLabel="Saving your account" size="lg" type="submit">
        Finish account setup
      </Button>
      <div aria-live="polite" className="min-h-6">
        {error && (
          <p className="m-0 text-sm font-semibold text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

interface AgeGateFields {
  ageBand: "" | "adult" | "teen" | "under_13";
}

export function OnboardingAgeGateForm({ returnTo }: { readonly returnTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<AgeGateFields>({ defaultValues: { ageBand: "" } });

  const submit = handleSubmit(async ({ ageBand }) => {
    setError(null);
    if (!navigator.onLine) {
      setError("You appear to be offline. Reconnect to choose an account path.");
      return;
    }
    try {
      const response = await fetch("/api/onboarding/age-gate", {
        body: JSON.stringify({ ageBand, returnTo }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string; next?: string };
      if (!response.ok || !result.next) {
        setError(result.message ?? "Choose an age range and try again.");
        return;
      }
      window.location.assign(result.next);
    } catch {
      setError("The account service could not be reached. Check your connection and try again.");
    }
  });

  return (
    <form className="settings-card grid gap-5" noValidate onSubmit={submit}>
      <div>
        <h2 className="m-0 text-xl">Choose the right account path</h2>
        <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
          We store an age range, not your exact birthday. This choice is verified for this account
          setup before any profile details are saved.
        </p>
      </div>
      <FormField error={errors.ageBand?.message} label="Age range" required>
        <Controller
          control={control}
          name="ageBand"
          rules={{ required: "Choose an age range" }}
          render={({ field }) => (
            <Select
              name={field.name}
              onValueChange={field.onChange}
              options={[
                { label: "Select an age range", value: "" },
                { label: "18 or older", value: "adult" },
                { label: "13 to 17", value: "teen" },
                { label: "Under 13", value: "under_13" },
              ]}
              value={field.value}
            />
          )}
        />
      </FormField>
      <Button loading={isSubmitting} loadingLabel="Checking account path" type="submit">
        Continue
      </Button>
      <div aria-live="polite" className="min-h-6">
        {error && (
          <p className="m-0 text-sm font-semibold text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
