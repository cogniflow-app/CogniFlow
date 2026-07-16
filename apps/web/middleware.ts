import { createRouteDatabaseClient } from "@lumen/database/route";
import { type NextRequest, NextResponse } from "next/server";

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
