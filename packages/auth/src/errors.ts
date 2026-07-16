export const authErrorContexts = [
  "sign_in",
  "sign_up",
  "magic_link",
  "recovery",
  "callback",
  "sign_out",
  "reauthentication",
  "generic",
] as const;

export type AuthErrorContext = (typeof authErrorContexts)[number];
export type SafeAuthErrorCode =
  | "invalid_credentials"
  | "verification_required"
  | "expired_link"
  | "rate_limited"
  | "weak_password"
  | "network_unavailable"
  | "account_state_hidden"
  | "request_not_completed";

export interface SafeAuthError {
  readonly code: SafeAuthErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly field?: "email" | "password";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function providerCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code.trim().toLowerCase() : undefined;
}

function providerStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function safeError(error: SafeAuthError): SafeAuthError {
  return Object.freeze(error);
}

/** Maps provider failures to stable copy without reflecting provider messages or account existence. */
export function mapAuthError(error: unknown, context: AuthErrorContext): SafeAuthError {
  const code = providerCode(error);
  const status = providerStatus(error);

  if (status === 429 || code === "over_request_rate_limit" || code === "rate_limit_exceeded") {
    return safeError({
      code: "rate_limited",
      message: "Too many attempts. Wait a little before trying again.",
      retryable: true,
    });
  }

  if (code === "weak_password" || code === "same_password") {
    return safeError({
      code: "weak_password",
      message: "Choose a stronger password that you have not used for this account.",
      retryable: true,
      field: "password",
    });
  }

  if (code === "email_not_confirmed") {
    return safeError({
      code: "verification_required",
      message: "Verify your email before signing in. You can request a new link if needed.",
      retryable: true,
      field: "email",
    });
  }

  if (
    code === "otp_expired" ||
    code === "otp_disabled" ||
    code === "flow_state_expired" ||
    code === "bad_code_verifier"
  ) {
    return safeError({
      code: "expired_link",
      message: "This sign-in link is invalid or has expired. Request a new link.",
      retryable: true,
    });
  }

  if (code === "invalid_credentials" && context === "sign_in") {
    return safeError({
      code: "invalid_credentials",
      message: "The email or password was not accepted.",
      retryable: true,
    });
  }

  if (
    context === "sign_up" &&
    (code === "user_already_exists" ||
      code === "user_already_registered" ||
      code === "email_exists")
  ) {
    return safeError({
      code: "account_state_hidden",
      message: "If that address can use this flow, a secure email will arrive shortly.",
      retryable: false,
    });
  }

  const errorName = isRecord(error) && typeof error.name === "string" ? error.name : undefined;
  if (errorName === "TypeError" || code === "request_timeout" || code === "network_error") {
    return safeError({
      code: "network_unavailable",
      message: "The account service could not be reached. Check your connection and try again.",
      retryable: true,
    });
  }

  const message =
    context === "sign_up" || context === "magic_link" || context === "recovery"
      ? "The request could not be completed. Check the submitted details or try again later."
      : "The account request could not be completed. Try again safely.";

  return safeError({ code: "request_not_completed", message, retryable: true });
}
