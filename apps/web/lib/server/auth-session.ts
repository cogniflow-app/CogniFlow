import "server-only";

import type { DatabaseClient } from "@lumen/database";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Returns the verified Auth session claim, bound to the expected account. */
export async function readVerifiedAuthSessionId(
  client: DatabaseClient,
  accountId: string,
): Promise<string> {
  const { data, error } = await client.auth.getClaims();
  const sessionId = data?.claims.session_id;
  if (
    error ||
    data?.claims.sub !== accountId ||
    typeof sessionId !== "string" ||
    !uuidPattern.test(sessionId)
  ) {
    throw new Error("AUTH_SESSION_UNAVAILABLE");
  }
  return sessionId;
}
