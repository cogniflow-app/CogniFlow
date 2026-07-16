import "server-only";

import { createPrivilegedDatabaseClient } from "@lumen/database/server";

import { createRateLimitSubject } from "./request-security";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/**
 * Applies a database-backed fixed-window limit using only an HMAC-pseudonymized
 * network/account subject. Raw addresses never reach the database.
 */
export async function consumeRequestRateLimit(options: {
  readonly accountId?: string;
  readonly limit: number;
  readonly request: Request;
  readonly scope: string;
  readonly windowSeconds: number;
}): Promise<RateLimitDecision> {
  const subjectHash = await createRateLimitSubject(
    options.request,
    options.scope,
    options.accountId,
  );
  const client = createPrivilegedDatabaseClient();
  const { data, error } = await client.rpc("admin_consume_rate_limit", {
    p_limit: options.limit,
    p_now: new Date().toISOString(),
    p_scope: options.scope,
    p_subject_hash: `\\x${subjectHash}`,
    p_window_seconds: options.windowSeconds,
  });
  const row = data?.[0];
  if (error || !row) {
    throw new Error("RATE_LIMIT_UNAVAILABLE");
  }
  return Object.freeze({
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: row.retry_after_seconds,
  });
}

export async function requireRequestRateLimit(
  options: Parameters<typeof consumeRequestRateLimit>[0],
): Promise<void> {
  const decision = await consumeRequestRateLimit(options);
  if (!decision.allowed) {
    const error = new Error("RATE_LIMITED");
    Object.assign(error, { retryAfterSeconds: decision.retryAfterSeconds });
    throw error;
  }
}
