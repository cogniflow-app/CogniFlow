"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface PasswordFields {
  password: string;
  passwordConfirmation: string;
}

export function PasswordUpdateForm() {
  const [error, setError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
  } = useForm<PasswordFields>();

  const submit = handleSubmit(async (fields) => {
    setError(null);
    try {
      const response = await fetch("/api/auth/password/update", {
        body: JSON.stringify(fields),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result = (await response.json()) as { message?: string; next?: string };
      if (!response.ok) {
        setError(result.message ?? "That recovery session is unavailable. Request a new link.");
        return;
      }
      window.location.assign(result.next ?? "/app/settings/security?password=updated");
    } catch {
      setError("The account service could not be reached. Check your connection and try again.");
    }
  });

  return (
    <form className="form-stack" noValidate onSubmit={submit}>
      <FormField
        description="Use at least 12 characters and do not reuse an important password."
        error={errors.password?.message}
        label="New password"
        required
      >
        <Input
          autoComplete="new-password"
          type="password"
          {...register("password", {
            maxLength: { message: "Password is too long", value: 128 },
            minLength: { message: "Use at least 12 characters", value: 12 },
            required: "Enter a new password",
          })}
        />
      </FormField>
      <FormField error={errors.passwordConfirmation?.message} label="Confirm new password" required>
        <Input
          autoComplete="new-password"
          type="password"
          {...register("passwordConfirmation", {
            required: "Confirm your new password",
            validate: (value) => value === getValues("password") || "Passwords do not match",
          })}
        />
      </FormField>
      <Button loading={isSubmitting} loadingLabel="Updating password" type="submit">
        Update password
      </Button>
      <div aria-live="polite" className="min-h-6 text-sm">
        {error && (
          <p className="m-0 text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
