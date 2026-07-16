import "server-only";

import { getServerEnvironment } from "@lumen/config/server-env";
import { createClient } from "@supabase/supabase-js";

import type { DatabaseClient, ServerCookieStore } from "./client-types";
import { createCookieDatabaseClient } from "./cookie-client";
import type { Database } from "./database.types";

export function createServerDatabaseClient(cookies: ServerCookieStore): DatabaseClient {
  const environment = getServerEnvironment();
  return createCookieDatabaseClient(cookies, {
    ...environment.public,
    secureCookies: environment.nodeEnvironment === "production",
  });
}

/**
 * Server-only escape hatch for audited administrative workflows. Ordinary
 * requests should use the cookie-aware RLS client above.
 */
export function createPrivilegedDatabaseClient(): DatabaseClient {
  const environment = getServerEnvironment();
  return createClient<Database>(environment.public.supabaseUrl, environment.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

/**
 * Isolated publishable-key client for credential verification. Its session is
 * never persisted into the request cookie store and must be signed out after
 * use so a reauthentication check cannot rotate the active browser session.
 */
export function createIsolatedAuthDatabaseClient(): DatabaseClient {
  const environment = getServerEnvironment();
  return createClient<Database>(
    environment.public.supabaseUrl,
    environment.public.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

export type {
  DatabaseCookie,
  DatabaseCookieMutation,
  DatabaseCookieOptions,
  DatabaseResponseHeaders,
  ServerCookieStore,
} from "./client-types";
