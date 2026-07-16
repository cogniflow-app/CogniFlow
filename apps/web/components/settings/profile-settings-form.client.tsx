"use client";

import { Button, FormField, Input, Select, Switch } from "@lumen/ui";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";

import { synchronizeAppearancePreferences } from "@/components/appearance-provider.client";

interface ProfileSettingsFields {
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

export function ProfileSettingsForm({ initial }: { readonly initial: ProfileSettingsFields }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ProfileSettingsFields>({ defaultValues: initial });

  const submit = handleSubmit(async (fields) => {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/settings/profile", {
        body: JSON.stringify(fields),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "PATCH",
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "Profile changes could not be saved.");
        return;
      }
      synchronizeAppearancePreferences({
        color: fields.preferences.theme,
        reduceMotion: fields.preferences.reduceMotion,
        seriousMode: fields.preferences.seriousMode,
      });
      setMessage(result.message ?? "Profile saved.");
    } catch {
      setError("Profile changes could not reach the account service.");
    }
  });

  return (
    <form className="settings-card grid gap-5" noValidate onSubmit={submit}>
      <div className="grid gap-5 md:grid-cols-2">
        <FormField error={errors.displayName?.message} label="Display name" required>
          <Input
            {...register("displayName", { maxLength: 80, required: "Enter a display name" })}
          />
        </FormField>
        <FormField
          description="Lowercase letters, numbers, and internal underscores."
          error={errors.handle?.message}
          label="Handle"
          required
        >
          <Input
            autoCapitalize="none"
            spellCheck={false}
            {...register("handle", {
              maxLength: 30,
              minLength: 3,
              pattern: {
                message: "Use lowercase letters, numbers, and internal underscores",
                value: /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/u,
              },
              required: "Choose a handle",
            })}
          />
        </FormField>
        <FormField label="Locale" required>
          <Input {...register("locale", { required: true })} />
        </FormField>
        <FormField label="Time zone" required>
          <Input {...register("timeZone", { required: true })} />
        </FormField>
        <FormField description="Minutes after midnight." label="Study day starts" required>
          <Input
            max={1439}
            min={0}
            type="number"
            {...register("studyDayStartMinutes", {
              max: 1439,
              min: 0,
              required: true,
              valueAsNumber: true,
            })}
          />
        </FormField>
        <FormField label="Theme">
          <Controller
            control={control}
            name="preferences.theme"
            render={({ field }) => (
              <Select
                name={field.name}
                onValueChange={field.onChange}
                options={[
                  { label: "System", value: "system" },
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                ]}
                value={field.value}
              />
            )}
          />
        </FormField>
      </div>
      <Controller
        control={control}
        name="preferences.reduceMotion"
        render={({ field }) => (
          <Switch
            checked={field.value}
            description="Avoid nonessential flips, zooms, and effects."
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
            description="Suppress celebration, sound, and game spectacle."
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
            description="Add spacing for easier reading."
            label="Increased reading spacing"
            onCheckedChange={(checked) =>
              field.onChange(checked ? "increased_spacing" : "standard")
            }
          />
        )}
      />
      <Button loading={isSubmitting} loadingLabel="Saving profile" type="submit">
        Save profile
      </Button>
      <div aria-live="polite" className="min-h-6 text-sm">
        {error && (
          <p className="m-0 text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
        {message && <p className="m-0 text-[var(--color-success)]">{message}</p>}
      </div>
    </form>
  );
}
