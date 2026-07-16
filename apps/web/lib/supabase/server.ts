import "server-only";

import type { DatabaseClient, DatabaseCookieMutation } from "@lumen/database";
import { createRouteDatabaseClient } from "@lumen/database/route";
import { createServerDatabaseClient } from "@lumen/database/server";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Creates an RLS-scoped Supabase client for a Server Component or Server
 * Action. Cookie writes succeed in actions and are intentionally ignored by
 * read-only render contexts; `proxy.ts` performs best-effort refresh writes.
 */
export async function createNextServerDatabaseClient(): Promise<DatabaseClient> {
  const cookieStore = await cookies();

  return createServerDatabaseClient({
    getAll: () => cookieStore.getAll(),
    async setAll(mutations) {
      try {
        for (const mutation of mutations) {
          cookieStore.set(mutation.name, mutation.value, mutation.options);
        }
      } catch {
        // Server Components cannot mutate cookies. Authorization still calls
        // Auth directly; session refresh is an optimization owned by proxy.ts.
      }
    },
  });
}

export interface NextRouteDatabaseContext {
  readonly client: DatabaseClient;
  applyCookies(response: NextResponse): NextResponse;
}

/**
 * Route-handler adapter that buffers auth cookie mutations until the final
 * response object exists. The in-memory request view is updated as well so a
 * multi-step callback sees the newest cookie values.
 */
export function createNextRouteDatabaseContext(request: NextRequest): NextRouteDatabaseContext {
  const values = new Map(request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]));
  const pending = new Map<string, DatabaseCookieMutation>();
  const client = createRouteDatabaseClient({
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    setAll(mutations) {
      for (const mutation of mutations) {
        values.set(mutation.name, mutation.value);
        pending.set(mutation.name, mutation);
      }
    },
  });

  return {
    client,
    applyCookies(response) {
      for (const mutation of pending.values()) {
        response.cookies.set(mutation.name, mutation.value, mutation.options);
      }
      return response;
    },
  };
}
