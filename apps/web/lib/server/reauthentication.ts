import "server-only";

import { passwordCredentialSchema } from "@lumen/auth/inputs";
import { getServerEnvironment } from "@lumen/config/server-env";
import {
  createIsolatedAuthDatabaseClient,
  createPrivilegedDatabaseClient,
} from "@lumen/database/server";

import { createOpaqueToken, sha256PostgresBytea } from "./crypto";
import { requireRequestRateLimit } from "./rate-limit";

/**
 * Rechecks the current credential and writes a short-lived, single-purpose
 * server-side proof. The password and raw proof are never persisted.
 */
export async function verifyPasswordAndIssueGrant(options: {
  readonly accountId: string;
  readonly email: string;
  readonly password: unknown;
  readonly purpose: "account_deletion" | "security_change";
  readonly request: Request;
}): Promise<string> {
  const password = passwordCredentialSchema.safeParse(options.password);
  if (!password.success) {
    throw new Error("REAUTHENTICATION_FAILED");
  }

  const environment = getServerEnvironment();
  await requireRequestRateLimit({
    accountId: options.accountId,
    limit: environment.rateLimits.destructiveRequestAttempts,
    request: options.request,
    scope: `reauthentication_${options.purpose}`,
    windowSeconds: environment.rateLimits.windowSeconds,
  });

  const verifier = createIsolatedAuthDatabaseClient();
  const { data, error } = await verifier.auth.signInWithPassword({
    email: options.email,
    password: password.data,
  });
  if (error || data.user?.id !== options.accountId) {
    if (data.session) await verifier.auth.signOut({ scope: "local" });
    throw new Error("REAUTHENTICATION_FAILED");
  }
  await verifier.auth.signOut({ scope: "local" });

  const rawProof = createOpaqueToken(32);
  const proofHash = await sha256PostgresBytea(rawProof);
  const privileged = createPrivilegedDatabaseClient();
  const { error: grantError } = await privileged.rpc("admin_issue_reauthentication_grant", {
    p_actor_account_id: options.accountId,
    p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    p_idempotency_key: crypto.randomUUID(),
    p_proof_hash: proofHash,
    p_purpose: options.purpose,
  });
  if (grantError) {
    throw new Error("REAUTHENTICATION_FAILED");
  }
  return proofHash;
}
