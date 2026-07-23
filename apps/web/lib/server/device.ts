import "server-only";

import type { DatabaseClient } from "@lumen/database";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest, NextResponse } from "next/server";

import { readVerifiedAuthSessionId } from "./auth-session";
import { deviceCookieName } from "./cookies";

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

function deviceDescription(userAgent: string | null): {
  readonly displayName: string;
  readonly platform: string;
} {
  const value = userAgent ?? "";
  const browser = /Firefox\//u.test(value)
    ? "Firefox"
    : /Edg\//u.test(value)
      ? "Edge"
      : /Chrome\//u.test(value)
        ? "Chrome"
        : /Safari\//u.test(value)
          ? "Safari"
          : "Browser";
  const platform = /iPhone|iPad/u.test(value)
    ? "iOS"
    : /Android/u.test(value)
      ? "Android"
      : /Macintosh/u.test(value)
        ? "macOS"
        : /Windows/u.test(value)
          ? "Windows"
          : /Linux/u.test(value)
            ? "Linux"
            : "Unknown";
  return { displayName: `${browser} on ${platform}`, platform };
}

export function resolveRequestDeviceId(request: NextRequest): string {
  const existing = request.cookies.get(deviceCookieName)?.value;
  return existing && uuidV4Pattern.test(existing) ? existing : crypto.randomUUID();
}

export function applyDeviceCookie<T extends NextResponse>(response: T, deviceId: string): T {
  response.cookies.set(deviceCookieName, deviceId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
  });
  return response;
}

export function clearDeviceCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(deviceCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
  });
  return response;
}

export async function registerRequestDevice(
  request: NextRequest,
  accountId: string,
  authClient: DatabaseClient,
): Promise<string> {
  const authSessionId = await readVerifiedAuthSessionId(authClient, accountId);
  const candidateDeviceId = resolveRequestDeviceId(request);
  const description = deviceDescription(request.headers.get("user-agent"));
  const client = createPrivilegedDatabaseClient();
  const { data, error } = await client.rpc("admin_register_request_device", {
    p_actor_account_id: accountId,
    p_auth_session_id: authSessionId,
    p_candidate_device_id: candidateDeviceId,
    p_display_name: description.displayName,
    p_platform: description.platform,
  });
  if (error || !data?.id) {
    throw new Error(
      error?.code === "42501" ? "DEVICE_ACCESS_REVOKED" : "DEVICE_REGISTRATION_FAILED",
    );
  }
  return data.id;
}
