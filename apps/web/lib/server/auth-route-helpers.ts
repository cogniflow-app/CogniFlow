import "server-only";

import { normalizeAuthenticationReturnUrl } from "@lumen/auth/redirects";
import { getServerEnvironment } from "@lumen/config/server-env";

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function buildAuthCallbackUrl(
  intent: "authentication" | "reauthentication" | "recovery",
  returnTo: unknown,
  ageGate?: {
    readonly callbackNonce: string;
    readonly flow: "oauth" | "password_signup";
    readonly provider?: "github" | "google" | "microsoft";
  },
  recovery?: { readonly callbackNonce: string },
): string {
  const url = new URL("/auth/callback", getServerEnvironment().public.appUrl);
  url.searchParams.set("intent", intent);
  url.searchParams.set("returnTo", normalizeAuthenticationReturnUrl(returnTo));
  if (ageGate) {
    url.searchParams.set("ageGate", ageGate.callbackNonce);
    url.searchParams.set("authFlow", ageGate.flow);
    if (ageGate.provider) url.searchParams.set("provider", ageGate.provider);
  }
  if (recovery) url.searchParams.set("recoveryState", recovery.callbackNonce);
  return url.toString();
}

export function buildAuthConfirmationUrl(returnTo: unknown): string {
  const url = new URL("/auth/confirm", getServerEnvironment().public.appUrl);
  url.searchParams.set("returnTo", normalizeAuthenticationReturnUrl(returnTo));
  return url.toString();
}

export function zodFieldErrors(
  issues: readonly { readonly message: string; readonly path: readonly PropertyKey[] }[],
): Readonly<Record<string, readonly string[]>> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}
