import "server-only";

import type { NextRequest } from "next/server";

import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

import { profileSessionCookieName } from "./cookies";

/** Fails closed when an account-level mutation is attempted from managed-learner mode. */
export async function assertSelfLearnerMutation(
  request: NextRequest,
  accountId: string,
): Promise<void> {
  const token = request.cookies.get(profileSessionCookieName)?.value;
  const authClient = createNextRouteDatabaseContext(request).client;
  const { data, error } = await authClient.rpc("current_assert_self_context");
  if (error || data !== accountId) {
    throw new Error("LEARNER_CONTEXT_UNAVAILABLE");
  }
  if (token) {
    throw new Error("MANAGED_LEARNER_ACTIVE");
  }
}
