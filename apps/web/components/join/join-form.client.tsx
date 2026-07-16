"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface JoinFormFields {
  customNickname: string;
  joinCode: string;
}

interface JoinFormProps {
  readonly initialJoinCode?: string;
}

function responseMessage(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return "Room access could not be checked. Try again.";
}

function safeJoinDestination(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("next" in value) || typeof value.next !== "string") {
    return null;
  }
  return /^\/join\/[A-HJ-NP-Z2-9]{6}$/u.test(value.next) ? value.next : null;
}

export function JoinForm({ initialJoinCode = "" }: JoinFormProps) {
  const [error, setError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<JoinFormFields>({
    defaultValues: { customNickname: "", joinCode: initialJoinCode },
  });

  const submit = handleSubmit(async (fields) => {
    setError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You appear to be offline. Reconnect before checking a room code.");
      return;
    }

    try {
      const response = await fetch("/api/guest/join", {
        body: JSON.stringify(fields),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
        method: "POST",
      });
      const result: unknown = await response.json();
      const next = safeJoinDestination(result);
      if (!response.ok || !next) {
        setError(responseMessage(result));
        return;
      }
      window.location.assign(next);
    } catch {
      setError("The room service could not be reached. Check your connection and try again.");
    }
  });

  return (
    <form className="form-stack" noValidate onSubmit={submit}>
      <FormField
        description="Codes use six letters or numbers. Spaces and a single dash are okay."
        label="Room code"
        required
        {...(errors.joinCode?.message ? { error: errors.joinCode.message } : {})}
      >
        <Input
          autoCapitalize="characters"
          autoComplete="one-time-code"
          className="join-code-input"
          inputMode="text"
          maxLength={32}
          spellCheck={false}
          {...register("joinCode", {
            pattern: {
              message: "Enter the six-character code supplied by the host",
              value: /^[A-HJ-NP-Z2-9\s-]+$/iu,
            },
            required: "Enter the room code",
            validate: (value) =>
              value.replace(/[\s-]+/gu, "").length === 6 ||
              "Enter the six-character code supplied by the host",
          })}
        />
      </FormField>
      <FormField
        description="Optional. Leave this blank for a randomly generated, classroom-safe name."
        label="Nickname"
        {...(errors.customNickname?.message ? { error: errors.customNickname.message } : {})}
      >
        <Input
          autoComplete="off"
          maxLength={24}
          placeholder="Generated if left blank"
          {...register("customNickname", {
            maxLength: { message: "Use 24 characters or fewer", value: 24 },
          })}
        />
      </FormField>
      <Button loading={isSubmitting} loadingLabel="Checking room" type="submit">
        Check room code
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
