import { createRouteDatabaseClient } from "@lumen/database/route";
import { type NextRequest, NextResponse } from "next/server";

type PublicDeckLookup =
  Readonly<{ kind: "invalid" }> | Readonly<{ identifier: string; kind: "public_id" | "slug" }>;

const publicDeckUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const publicDeckSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/u;

export function publicDeckLookupFromPathname(pathname: string): PublicDeckLookup | null {
  const slugMatch = /^\/deck\/([^/]+)$/u.exec(pathname);
  const publicIdMatch = /^\/embed\/deck\/([^/]+)$/u.exec(pathname);
  if (!slugMatch && !publicIdMatch) return null;
  let identifier: string;
  try {
    identifier = decodeURIComponent((slugMatch?.[1] ?? publicIdMatch?.[1]) as string);
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
  if (slugMatch) {
    return publicDeckSlugPattern.test(identifier)
      ? Object.freeze({ identifier, kind: "slug" })
      : Object.freeze({ kind: "invalid" });
  }
  return publicDeckUuidPattern.test(identifier)
    ? Object.freeze({ identifier, kind: "public_id" })
    : Object.freeze({ kind: "invalid" });
}

function publicDeckNotFound(request: NextRequest, response: NextResponse): NextResponse {
  const notFoundUrl = request.nextUrl.clone();
  notFoundUrl.pathname = "/__lumen-publication-not-found";
  notFoundUrl.search = "";
  const notFoundResponse = NextResponse.rewrite(notFoundUrl, { status: 404 });
  for (const cookie of response.cookies.getAll()) notFoundResponse.cookies.set(cookie);
  notFoundResponse.headers.set("Cache-Control", "private, no-store");
  return notFoundResponse;
}

/**
 * Best-effort auth-cookie refresh for routes that can carry a session. Every
 * protected page and mutation still verifies the user independently; this
 * edge middleware is never the authorization boundary.
 *
 * Next 16's newer proxy convention is Node-only. The portable Cloudflare
 * adapter requires this equivalent edge middleware convention.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-lumen-request-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const forwardedRequest = { headers: requestHeaders };
  let response = NextResponse.next({ request: forwardedRequest });
  const client = createRouteDatabaseClient({
    getAll: () => request.cookies.getAll(),
    setAll(mutations) {
      for (const mutation of mutations) {
        request.cookies.set(mutation.name, mutation.value);
      }
      response = NextResponse.next({ request: forwardedRequest });
      for (const mutation of mutations) {
        response.cookies.set(mutation.name, mutation.value, mutation.options);
      }
    },
  });

  await client.auth.getClaims();
  const publicLookup = publicDeckLookupFromPathname(request.nextUrl.pathname);
  if (publicLookup?.kind === "invalid") return publicDeckNotFound(request, response);
  if (publicLookup) {
    const projection =
      publicLookup.kind === "slug"
        ? await client
            .rpc("get_public_deck_by_slug", { p_slug: publicLookup.identifier })
            .maybeSingle()
        : await client
            .rpc("get_public_deck", { p_public_id: publicLookup.identifier })
            .maybeSingle();
    if (!projection.error && !projection.data) return publicDeckNotFound(request, response);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/app/:path*",
    "/auth/:path*",
    "/copyright/:path*",
    "/creator/:path*",
    "/deck/:path*",
    "/discover/:path*",
    "/embed/deck/:path*",
    "/join/:path*",
    "/onboarding/:path*",
    "/privacy/:path*",
    "/safety/:path*",
    "/terms/:path*",
  ],
};
