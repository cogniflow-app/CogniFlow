import "server-only";

import { getServerEnvironment } from "@lumen/config/server-env";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const deviceCookieName = "lumen_device";
export const profileSessionCookieName = "lumen_profile_session";
export const reauthenticationCookieName = "lumen_reauthentication";
export const guestSessionCookieName = "lumen_guest";
export const recoveryIntentCookieName = "lumen_recovery_intent";
export const pendingRecoveryIntentCookieName = "lumen_pending_recovery_intent";
export const pendingAuthAgeGateCookieName = "lumen_pending_auth_age_gate";
export const onboardingAgeGateCookieName = "lumen_onboarding_age_gate";

function secureCookies(): boolean {
  return getServerEnvironment().nodeEnvironment === "production";
}

const sensitiveContextCookies = [
  { name: deviceCookieName, path: "/", sameSite: "lax" },
  { name: profileSessionCookieName, path: "/", sameSite: "strict" },
  { name: reauthenticationCookieName, path: "/app/settings", sameSite: "strict" },
  { name: guestSessionCookieName, path: "/", sameSite: "strict" },
  { name: recoveryIntentCookieName, path: "/", sameSite: "strict" },
  { name: pendingRecoveryIntentCookieName, path: "/", sameSite: "lax" },
  { name: pendingAuthAgeGateCookieName, path: "/", sameSite: "lax" },
  { name: onboardingAgeGateCookieName, path: "/", sameSite: "strict" },
] as const;

export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(deviceCookieName)?.value;
  if (
    existing &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(existing)
  ) {
    return existing;
  }

  const deviceId = crypto.randomUUID();
  store.set(deviceCookieName, deviceId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
  });
  return deviceId;
}

export async function setProfileSessionCookie(token: string, _expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(profileSessionCookieName, token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "strict",
    secure: secureCookies(),
  });
}

export function applyProfileSessionCookie<T extends NextResponse>(
  response: T,
  token: string,
  _expiresAt: Date,
): T {
  response.cookies.set(profileSessionCookieName, token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "strict",
    secure: secureCookies(),
  });
  return response;
}

export async function clearProfileSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(profileSessionCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: secureCookies(),
  });
}

export function clearProfileSessionResponseCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(profileSessionCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: secureCookies(),
  });
  return response;
}

export async function setReauthenticationCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(reauthenticationCookieName, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/app/settings",
    sameSite: "strict",
    secure: secureCookies(),
  });
}

export async function clearSensitiveContextCookies(): Promise<void> {
  const store = await cookies();
  for (const cookie of sensitiveContextCookies) {
    store.set(cookie.name, "", {
      expires: new Date(0),
      httpOnly: true,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: secureCookies(),
    });
  }
}

/** Expire app-owned identity cookies directly on the returned response. */
export function clearSensitiveContextResponseCookies<T extends NextResponse>(response: T): T {
  for (const cookie of sensitiveContextCookies) {
    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      httpOnly: true,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: secureCookies(),
    });
  }
  return response;
}
