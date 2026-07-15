import "server-only";

import { getServerEnvironment } from "@lumen/config/server-env";
import { createClient } from "@supabase/supabase-js";

import type { DatabaseClient, ServerCookieStore } from "./client-types";
import { createCookieDatabaseClient } from "./cookie-client";
import type { Database } from "./database.types";

export function createServerDatabaseClient(cookies: ServerCookieStore): DatabaseClient {
  const environment = getServerEnvironment();
  return createCookieDatabaseClient(cookies, environment.public);
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

export type {
  DatabaseCookie,
  DatabaseCookieMutation,
  DatabaseCookieOptions,
  DatabaseResponseHeaders,
  ServerCookieStore,
} from "./client-types";
