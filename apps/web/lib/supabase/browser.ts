import type { DatabaseClient } from "@lumen/database";
import { createBrowserDatabaseClient } from "@lumen/database/browser";

let browserClient: DatabaseClient | undefined;

export function getBrowserDatabaseClient(): DatabaseClient {
  browserClient ??= createBrowserDatabaseClient();
  return browserClient;
}
