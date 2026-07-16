"use client";

import type { PublicAuthProviderDescriptor } from "@lumen/auth/providers";
import { Button, FormField, Input, Select } from "@lumen/ui";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

type AuthFormMode = "forgot_password" | "magic_link" | "sign_in" | "sign_up";

interface AuthFormFields {
  ageBand: "" | "adult" | "teen" | "under_13";
  email: string;
  password: string;
}

interface AuthFormProps {
  readonly mode: AuthFormMode;
  readonly providers?: readonly PublicAuthProviderDescriptor[];
  readonly returnTo: string;
}

interface MutationResult {
  readonly message?: string;
  readonly next?: string;
}

function endpointFor(mode: AuthFormMode): string {
  return ["sign_in", "sign_up"].includes(mode) ? "/api/auth/password" : "/api/auth/email-link";
}

function messageFrom(value: unknown): string {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return "We could not complete that request. Please try again.";
  }
  return typeof value.message === "string"
    ? value.message
    : "We could not complete that request. Please try again.";
}

export function AuthForm({ mode, providers = [], returnTo }: AuthFormProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<AuthFormFields>({
    defaultValues: { ageBand: "", email: "", password: "" },
  });
  const selectedAgeBand = useWatch({ control, name: "ageBand" });
  const signupEligible = selectedAgeBand === "adult" || selectedAgeBand === "teen";
  const needsPassword = mode === "sign_in" || mode === "sign_up";

  const submit = handleSubmit(async (fields) => {
    setError(null);
    setNotice(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You appear to be offline. Reconnect before continuing.");
      return;
    }

    const body = {
      email: fields.email,
      returnTo,
      ...(needsPassword ? { password: fields.password } : {}),
      ...(mode === "sign_up" ? { ageBand: fields.ageBand } : {}),
      intent: mode,
    };

    try {
      const response = await fetch(endpointFor(mode), {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as MutationResult;
      if (!response.ok) {
        setError(messageFrom(result));
        return;
      }
      if (result.next) {
        window.location.assign(result.next);
        return;
      }
      setNotice(result.message ?? "Check your email for the next step.");
    } catch {
      setError("The account service could not be reached. Check your connection and try again.");
    }
  });

  const oauthProviders = providers.filter((provider) => provider.kind === "oauth");

  async function beginOAuth(provider: PublicAuthProviderDescriptor) {
    setError(null);
    try {
      const response = await fetch("/api/auth/oauth", {
        body: JSON.stringify({
          ...(mode === "sign_up" ? { ageBand: selectedAgeBand } : {}),
          intent: mode === "sign_up" ? "sign_up" : "sign_in",
          provider: provider.id,
          returnTo,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as MutationResult;
      if (!response.ok || !result.next) {
        setError(messageFrom(result));
        return;
      }
      window.location.assign(result.next);
    } catch {
      setError("The provider sign-in service is unavailable. Try another method.");
    }
  }

  return (
    <>
      {oauthProviders.length > 0 &&
        mode !== "forgot_password" &&
        (mode !== "sign_up" || signupEligible) && (
          <>
            <div className="grid gap-2">
              {oauthProviders.map((provider) => (
                <Button
                  key={provider.id}
                  disabled={isSubmitting}
                  onClick={() => void beginOAuth(provider)}
                  type="button"
                  variant="secondary"
                >
                  Continue with {provider.label}
                </Button>
              ))}
            </div>
            <div className="form-divider my-5">or use email</div>
          </>
        )}

      <form className="form-stack" noValidate onSubmit={submit}>
        {mode === "sign_up" && (
          <FormField
            error={errors.ageBand?.message}
            label="Which age range describes you?"
            description="We ask for an age range—not a birth date—to choose the right account path."
            required
          >
            <Controller
              control={control}
              name="ageBand"
              rules={{ required: "Choose an age range" }}
              render={({ field }) => (
                <Select
                  name={field.name}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === "under_13") {
                      window.location.assign("/auth/guardian-required");
                    }
                  }}
                  options={[
                    { label: "18 or older", value: "adult" },
                    { label: "13 to 17", value: "teen" },
                    { label: "Under 13", value: "under_13" },
                  ]}
                  value={field.value}
                />
              )}
            />
          </FormField>
        )}
        {(mode !== "sign_up" || signupEligible) && (
          <FormField error={errors.email?.message} label="Email address" required>
            <Input
              autoComplete="email"
              inputMode="email"
              type="email"
              {...register("email", {
                maxLength: { message: "Email is too long", value: 254 },
                pattern: { message: "Enter a valid email address", value: /^[^\s@]+@[^\s@]+$/u },
                required: "Enter your email address",
              })}
            />
          </FormField>
        )}
        {needsPassword && (mode !== "sign_up" || signupEligible) && (
          <FormField
            description={mode === "sign_up" ? "Use at least 12 characters." : undefined}
            error={errors.password?.message}
            label="Password"
            required
          >
            <Input
              autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
              type="password"
              {...register("password", {
                maxLength: { message: "Password is too long", value: 128 },
                ...(mode === "sign_up"
                  ? { minLength: { message: "Use at least 12 characters", value: 12 } }
                  : {}),
                required: "Enter your password",
              })}
            />
          </FormField>
        )}
        {(mode !== "sign_up" || signupEligible) && (
          <Button loading={isSubmitting} loadingLabel="Checking securely" type="submit">
            {mode === "sign_in" && "Sign in"}
            {mode === "sign_up" && "Create account"}
            {mode === "magic_link" && "Email me a sign-in link"}
            {mode === "forgot_password" && "Send recovery instructions"}
          </Button>
        )}
        <div aria-live="polite" className="min-h-6 text-sm">
          {error && (
            <p className="m-0 text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="m-0 text-[var(--color-success)]">{notice}</p>}
        </div>
      </form>
    </>
  );
}
