import "server-only";

import { normalizeReturnUrl } from "@lumen/auth/redirects";
import { headers } from "next/headers";
import { cache } from "react";

import { createNextServerDatabaseClient } from "@/lib/supabase/server";

const PUBLIC_RETURN_ORIGIN = "https://public-return.invalid";
const PUBLIC_RETURN_PATH_PREFIXES = [
  "/copyright",
  "/creator",
  "/deck",
  "/discover",
  "/embed/deck",
  "/join",
  "/privacy",
  "/safety",
  "/terms",
] as const;

export interface PublicViewerContext {
  readonly accountHref: "/app";
  readonly authenticated: boolean;
  readonly intendedReturnTo: string;
  readonly signInHref: string;
  readonly signUpHref: string;
}

function isPublicReturnPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_RETURN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Narrows a same-origin redirect to the public route families. This keeps a
 * public-shell CTA from carrying users into account, API, or auth routes and
 * also applies the shared encoded-navigation-hazard checks.
 */
export function normalizePublicReturnUrl(value: unknown, fallback: string = "/"): string {
  const normalizedFallback = normalizeReturnUrl(fallback, "/");
  const fallbackPathname = new URL(normalizedFallback, PUBLIC_RETURN_ORIGIN).pathname;
  const publicFallback = isPublicReturnPath(fallbackPathname) ? normalizedFallback : "/";
  const candidate = normalizeReturnUrl(value, publicFallback);
  const pathname = new URL(candidate, PUBLIC_RETURN_ORIGIN).pathname;
  return isPublicReturnPath(pathname) ? candidate : publicFallback;
}

export function createPublicViewerContext(
  authenticated: boolean,
  requestPath: unknown,
  fallback: string = "/",
): PublicViewerContext {
  const intendedReturnTo = normalizePublicReturnUrl(requestPath, fallback);
  const encodedReturnTo = encodeURIComponent(intendedReturnTo);
  return Object.freeze({
    accountHref: "/app",
    authenticated,
    intendedReturnTo,
    signInHref: `/auth/sign-in?returnTo=${encodedReturnTo}`,
    signUpHref: `/auth/sign-up?returnTo=${encodedReturnTo}`,
  });
}

/**
 * Resolves only the minimum public-shell identity projection. Public routes
 * remain usable when Auth is unavailable, while a verified account receives
 * the workspace CTA. Product authorization is still owned by protected pages
 * and mutation boundaries.
 */
export async function loadPublicViewerContext(
  fallback: string = "/",
): Promise<PublicViewerContext> {
  const requestPath = (await headers()).get("x-lumen-request-path");
  let authenticated = false;

  try {
    const client = await createNextServerDatabaseClient();
    const { data, error } = await client.auth.getUser();
    authenticated = !error && Boolean(data.user);
  } catch {
    // The public shell must remain available during a transient Auth outage.
  }

  return createPublicViewerContext(authenticated, requestPath, fallback);
}

export const readPublicViewerContext = cache(loadPublicViewerContext);

/**
 * Resolves an internal deck id only when the verified public-page viewer owns
 * the matching publication. The user-bound client and the explicit owner
 * predicate make this fail closed under RLS, expired sessions, and outages.
 */
export async function loadOwnedPublicDeckId(publicId: string): Promise<string | null> {
  try {
    const client = await createNextServerDatabaseClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return null;

    const { data, error } = await client
      .from("decks")
      .select("id")
      .eq("public_id", publicId)
      .eq("owner_account_id", userData.user.id)
      .maybeSingle();
    return !error && typeof data?.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}

export const readOwnedPublicDeckId = cache(loadOwnedPublicDeckId);
