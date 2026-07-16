import "server-only";

import { getServerEnvironment } from "@lumen/config/server-env";

import type { DatabaseClient, MutableServerCookieStore } from "./client-types";
import { createCookieDatabaseClient } from "./cookie-client";

/** Route handlers must provide a mutable response-cookie adapter. */
export function createRouteDatabaseClient(cookies: MutableServerCookieStore): DatabaseClient {
  const environment = getServerEnvironment();
  return createCookieDatabaseClient(cookies, {
    ...environment.public,
    secureCookies: environment.nodeEnvironment === "production",
  });
}

export type { MutableServerCookieStore } from "./client-types";
