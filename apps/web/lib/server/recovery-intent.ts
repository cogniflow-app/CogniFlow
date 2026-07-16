import "server-only";

import {
  pendingRecoveryIntentSchema,
  recoverySessionIntentSchema,
  type PendingRecoveryIntent,
} from "@lumen/auth/inputs";
import { normalizeReturnUrl } from "@lumen/auth/redirects";
import { getServerEnvironment } from "@lumen/config/server-env";
import type { NextRequest, NextResponse } from "next/server";

import { pendingRecoveryIntentCookieName, recoveryIntentCookieName } from "./cookies";
import {
  createOpaqueToken,
  hmacSha256Hex,
  sha256Hex,
  signCompactPayload,
  verifyCompactPayload,
} from "./crypto";

const PENDING_RECOVERY_LIFETIME_MS = 15 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;
const MAX_SIGNED_COOKIE_LENGTH = 4096;

interface IssuedPendingRecoveryIntent {
  readonly callbackNonce: string;
  readonly expiresAt: Date;
  readonly payload: PendingRecoveryIntent;
  readonly token: string;
}

function cookieSecurity() {
  return getServerEnvironment().nodeEnvironment === "production";
}

function hasValidLifetime(
  value: { readonly expiresAt: string; readonly issuedAt: string },
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

export async function issuePendingRecoveryIntent(
  input: { readonly email: string; readonly returnTo: string },
  now = new Date(),
): Promise<IssuedPendingRecoveryIntent> {
  const callbackNonce = createOpaqueToken();
  const expiresAt = new Date(now.getTime() + PENDING_RECOVERY_LIFETIME_MS);
  const payload = pendingRecoveryIntentSchema.parse({
    expiresAt: expiresAt.toISOString(),
    flowNonceHash: await sha256Hex(callbackNonce),
    issuedAt: now.toISOString(),
    purpose: "pending_password_recovery",
    returnTo: normalizeReturnUrl(input.returnTo),
    subjectHash: await hmacSha256Hex(
      input.email.trim().toLowerCase(),
      getServerEnvironment().appEncryptionKey,
    ),
    version: 1,
  });
  return Object.freeze({
    callbackNonce,
    expiresAt,
    payload,
    token: await signCompactPayload(
      JSON.stringify(payload),
      getServerEnvironment().appEncryptionKey,
    ),
  });
}

export function attachPendingRecoveryIntent<T extends NextResponse>(
  response: T,
  issued: IssuedPendingRecoveryIntent,
): T {
  response.cookies.set(pendingRecoveryIntentCookieName, issued.token, {
    expires: issued.expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: cookieSecurity(),
  });
  return response;
}

export async function readPendingRecoveryIntent(
  request: NextRequest,
  callbackNonce: string | null,
  email: string | null | undefined,
  now = new Date(),
): Promise<PendingRecoveryIntent | null> {
  if (!callbackNonce || callbackNonce.length > 512 || !email) return null;
  const token = request.cookies.get(pendingRecoveryIntentCookieName)?.value;
  if (!token || token.length > MAX_SIGNED_COOKIE_LENGTH) return null;
  const serialized = await verifyCompactPayload(token, getServerEnvironment().appEncryptionKey);
  if (!serialized) return null;
  try {
    const parsed = pendingRecoveryIntentSchema.parse(JSON.parse(serialized) as unknown);
    if (!hasValidLifetime(parsed, PENDING_RECOVERY_LIFETIME_MS, now)) return null;
    if (parsed.flowNonceHash !== (await sha256Hex(callbackNonce))) return null;
    const subjectHash = await hmacSha256Hex(
      email.trim().toLowerCase(),
      getServerEnvironment().appEncryptionKey,
    );
    return parsed.subjectHash === subjectHash ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingRecoveryIntent<T extends NextResponse>(response: T): T {
  response.cookies.set(pendingRecoveryIntentCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: cookieSecurity(),
  });
  return response;
}

export async function attachRecoveryIntent(
  response: NextResponse,
  accountId: string,
  now = new Date(),
): Promise<NextResponse> {
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const payload = recoverySessionIntentSchema.parse({
    accountId,
    expiresAt: expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    nonceHash: await sha256Hex(createOpaqueToken()),
    purpose: "password_recovery",
    version: 1,
  });
  const token = await signCompactPayload(
    JSON.stringify(payload),
    getServerEnvironment().appEncryptionKey,
  );
  response.cookies.set(recoveryIntentCookieName, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: cookieSecurity(),
  });
  return response;
}

export async function readRecoveryIntent(request: NextRequest, now = new Date()) {
  const token = request.cookies.get(recoveryIntentCookieName)?.value;
  if (!token) return null;
  const serialized = await verifyCompactPayload(token, getServerEnvironment().appEncryptionKey);
  if (!serialized) return null;
  try {
    const parsed = recoverySessionIntentSchema.parse(JSON.parse(serialized) as unknown);
    return hasValidLifetime(parsed, 10 * 60 * 1000, now) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearRecoveryIntent(response: NextResponse): NextResponse {
  response.cookies.set(recoveryIntentCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: cookieSecurity(),
  });
  return response;
}
