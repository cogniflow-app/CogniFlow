import "server-only";

import {
  pendingAuthAgeGateSchema,
  verifiedOnboardingAgeGateSchema,
  type PendingAuthAgeGate,
  type VerifiedOnboardingAgeGate,
} from "@lumen/auth/inputs";
import type { OAuthProviderName } from "@lumen/auth/providers";
import { normalizeReturnUrl } from "@lumen/auth/redirects";
import { getServerEnvironment } from "@lumen/config/server-env";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { onboardingAgeGateCookieName, pendingAuthAgeGateCookieName } from "./cookies";
import {
  createOpaqueToken,
  hmacSha256Hex,
  sha256Hex,
  signCompactPayload,
  verifyCompactPayload,
} from "./crypto";

const PENDING_GATE_LIFETIME_MS = 15 * 60 * 1000;
const ONBOARDING_GATE_LIFETIME_MS = 30 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;
const MAX_SIGNED_COOKIE_LENGTH = 4096;

interface IssuedGate<T> {
  readonly expiresAt: Date;
  readonly payload: T;
  readonly token: string;
}

interface IssuedPendingGate extends IssuedGate<PendingAuthAgeGate> {
  readonly callbackNonce: string;
}

function secureCookies(): boolean {
  return getServerEnvironment().nodeEnvironment === "production";
}

function validLifetime(
  value: { readonly issuedAt: string; readonly expiresAt: string },
  maximumLifetimeMs: number,
  now: Date,
): boolean {
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  return (
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    issuedAt <= now.getTime() + CLOCK_SKEW_MS &&
    expiresAt > now.getTime() &&
    expiresAt - issuedAt <= maximumLifetimeMs
  );
}

async function signPayload(payload: unknown): Promise<string> {
  return signCompactPayload(JSON.stringify(payload), getServerEnvironment().appEncryptionKey);
}

async function parseSignedPayload(token: string): Promise<unknown | null> {
  if (token.length === 0 || token.length > MAX_SIGNED_COOKIE_LENGTH) return null;
  const serialized = await verifyCompactPayload(token, getServerEnvironment().appEncryptionKey);
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}

async function issuePendingGate(
  payload: Omit<PendingAuthAgeGate, "expiresAt" | "flowNonceHash" | "issuedAt" | "version">,
  now: Date,
): Promise<IssuedPendingGate> {
  const callbackNonce = createOpaqueToken();
  const expiresAt = new Date(now.getTime() + PENDING_GATE_LIFETIME_MS);
  const parsed = pendingAuthAgeGateSchema.parse({
    ...payload,
    expiresAt: expiresAt.toISOString(),
    flowNonceHash: await sha256Hex(callbackNonce),
    issuedAt: now.toISOString(),
    version: 1,
  });
  return Object.freeze({
    callbackNonce,
    expiresAt,
    payload: parsed,
    token: await signPayload(parsed),
  });
}

export async function issuePasswordSignupAgeGate(
  input: {
    readonly ageBand: "adult" | "teen";
    readonly email: string;
    readonly returnTo: string;
  },
  now = new Date(),
): Promise<IssuedPendingGate> {
  return issuePendingGate(
    {
      ageBand: input.ageBand,
      flow: "password_signup",
      intent: "sign_up",
      provider: null,
      purpose: "pending_auth_age_gate",
      returnTo: normalizeReturnUrl(input.returnTo),
      subjectHash: await hmacSha256Hex(
        input.email.trim().toLowerCase(),
        getServerEnvironment().appEncryptionKey,
      ),
    },
    now,
  );
}

export async function issueOAuthAgeGate(
  input:
    | {
        readonly ageBand: "adult" | "teen";
        readonly intent: "sign_up";
        readonly provider: OAuthProviderName;
        readonly returnTo: string;
      }
    | {
        readonly intent: "sign_in";
        readonly provider: OAuthProviderName;
        readonly returnTo: string;
      },
  now = new Date(),
): Promise<IssuedPendingGate> {
  return issuePendingGate(
    input.intent === "sign_up"
      ? {
          ageBand: input.ageBand,
          flow: "oauth",
          intent: "sign_up",
          provider: input.provider,
          purpose: "pending_auth_age_gate",
          returnTo: normalizeReturnUrl(input.returnTo),
          subjectHash: null,
        }
      : {
          ageBand: null,
          flow: "oauth",
          intent: "sign_in",
          provider: input.provider,
          purpose: "pending_auth_age_gate",
          returnTo: normalizeReturnUrl(input.returnTo),
          subjectHash: null,
        },
    now,
  );
}

export function attachPendingAuthAgeGate<T extends NextResponse>(
  response: T,
  issued: IssuedGate<PendingAuthAgeGate>,
): T {
  response.cookies.set(pendingAuthAgeGateCookieName, issued.token, {
    expires: issued.expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
  });
  return response;
}

export async function readPendingAuthAgeGate(
  request: NextRequest,
  callbackNonce: string | null,
  expected?: {
    readonly flow?: PendingAuthAgeGate["flow"];
    readonly provider?: OAuthProviderName | null;
  },
  now = new Date(),
): Promise<PendingAuthAgeGate | null> {
  if (!callbackNonce || callbackNonce.length > 512) return null;
  const token = request.cookies.get(pendingAuthAgeGateCookieName)?.value;
  if (!token) return null;
  const parsed = pendingAuthAgeGateSchema.safeParse(await parseSignedPayload(token));
  if (!parsed.success || !validLifetime(parsed.data, PENDING_GATE_LIFETIME_MS, now)) return null;
  if (parsed.data.flowNonceHash !== (await sha256Hex(callbackNonce))) return null;
  if (expected?.flow !== undefined && parsed.data.flow !== expected.flow) return null;
  if (expected?.provider !== undefined && parsed.data.provider !== expected.provider) return null;
  return parsed.data;
}

export async function pendingPasswordGateMatchesEmail(
  gate: PendingAuthAgeGate,
  email: string | null | undefined,
): Promise<boolean> {
  if (gate.flow !== "password_signup" || !email) return false;
  return (
    gate.subjectHash ===
    (await hmacSha256Hex(email.trim().toLowerCase(), getServerEnvironment().appEncryptionKey))
  );
}

export function clearPendingAuthAgeGate<T extends NextResponse>(response: T): T {
  response.cookies.set(pendingAuthAgeGateCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
  });
  return response;
}

export async function issueVerifiedOnboardingAgeGate(
  input: {
    readonly accountId: string;
    readonly ageBand: "adult" | "teen";
    readonly returnTo: string;
  },
  now = new Date(),
): Promise<IssuedGate<VerifiedOnboardingAgeGate>> {
  const expiresAt = new Date(now.getTime() + ONBOARDING_GATE_LIFETIME_MS);
  const parsed = verifiedOnboardingAgeGateSchema.parse({
    accountId: input.accountId,
    ageBand: input.ageBand,
    expiresAt: expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    nonceHash: await sha256Hex(createOpaqueToken()),
    purpose: "verified_onboarding_age_gate",
    returnTo: normalizeReturnUrl(input.returnTo),
    version: 1,
  });
  return Object.freeze({ expiresAt, payload: parsed, token: await signPayload(parsed) });
}

export function attachVerifiedOnboardingAgeGate<T extends NextResponse>(
  response: T,
  issued: IssuedGate<VerifiedOnboardingAgeGate>,
): T {
  response.cookies.set(onboardingAgeGateCookieName, issued.token, {
    expires: issued.expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: secureCookies(),
  });
  return response;
}

async function parseVerifiedOnboardingGate(
  token: string | undefined,
  accountId: string,
  now: Date,
): Promise<VerifiedOnboardingAgeGate | null> {
  if (!token) return null;
  const parsed = verifiedOnboardingAgeGateSchema.safeParse(await parseSignedPayload(token));
  if (
    !parsed.success ||
    parsed.data.accountId !== accountId ||
    !validLifetime(parsed.data, ONBOARDING_GATE_LIFETIME_MS, now)
  ) {
    return null;
  }
  return parsed.data;
}

export async function readRequestOnboardingAgeGate(
  request: NextRequest,
  accountId: string,
  now = new Date(),
): Promise<VerifiedOnboardingAgeGate | null> {
  return parseVerifiedOnboardingGate(
    request.cookies.get(onboardingAgeGateCookieName)?.value,
    accountId,
    now,
  );
}

export async function readServerOnboardingAgeGate(
  accountId: string,
  now = new Date(),
): Promise<VerifiedOnboardingAgeGate | null> {
  const store = await cookies();
  return parseVerifiedOnboardingGate(store.get(onboardingAgeGateCookieName)?.value, accountId, now);
}

export function clearVerifiedOnboardingAgeGate<T extends NextResponse>(response: T): T {
  response.cookies.set(onboardingAgeGateCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: secureCookies(),
  });
  return response;
}
