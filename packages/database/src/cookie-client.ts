import { createServerClient } from "@supabase/ssr";

import type { DatabaseClient, DatabaseCookieMutation, ServerCookieStore } from "./client-types";
import type { Database } from "./database.types";

export interface CookieDatabaseEnvironment {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

export function createCookieDatabaseClient(
  cookies: ServerCookieStore,
  environment: CookieDatabaseEnvironment,
): DatabaseClient {
  return createServerClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey, {
    cookies: {
      getAll() {
        return [...cookies.getAll()];
      },
      async setAll(mutations, responseHeaders) {
        if (!cookies.setAll) {
          return;
        }

        await cookies.setAll(mutations as readonly DatabaseCookieMutation[], responseHeaders);
      },
    },
  });
}
