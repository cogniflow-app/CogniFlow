import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { DatabaseClient } from "./client-types";
import type { Database } from "./database.types";

export interface TestDatabaseEnvironment {
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
}

/** Requires explicit local-test credentials; it never reads deployment state. */
export function createTestDatabaseClient(environment: TestDatabaseEnvironment): DatabaseClient {
  return createClient<Database>(environment.supabaseUrl, environment.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
