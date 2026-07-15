import { readPublicEnvironment } from "@lumen/config/public-env";
import { createBrowserClient } from "@supabase/ssr";

import type { DatabaseClient } from "./client-types";
import type { Database } from "./database.types";

export interface BrowserDatabaseEnvironment {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

export function createBrowserDatabaseClient(
  environment: BrowserDatabaseEnvironment = readPublicEnvironment(),
): DatabaseClient {
  return createBrowserClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey);
}
