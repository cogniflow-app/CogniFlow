import { signOutInputSchema } from "@lumen/auth/inputs";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { clearSensitiveContextResponseCookies } from "@/lib/server/cookies";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { verifyPasswordAndIssueGrant } from "@/lib/server/reauthentication";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = signOutInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const body = parsed.data;
    const scope = body.scope;
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    const user = userData.user;
    let revocation: { readonly error: unknown } = { error: null };
    if (scope === "all") {
      if (!user?.email) throw new Error("REAUTHENTICATION_FAILED");
      await assertSelfLearnerMutation(request, user.id);
      const proofHash = await verifyPasswordAndIssueGrant({
        accountId: user.id,
        email: user.email,
        password: body.password,
        purpose: "security_change",
        request,
      });
      revocation = await database.client.rpc("current_sign_out_all_devices", {
        p_idempotency_key: crypto.randomUUID(),
        p_reauthentication_proof_hash: proofHash,
      });
    } else if (user) {
      revocation = await database.client.rpc("current_sign_out_devices", {
        p_idempotency_key: crypto.randomUUID(),
        p_scope: "current",
      });
    }
    if (revocation.error) {
      return apiError(400, {
        code: "INVALID_INPUT",
        message: "The device session could not be revoked. Try again.",
        retryable: true,
      });
    }
    const { error: authError } = await database.client.auth.signOut({
      scope: scope === "all" ? "global" : "local",
    });
    const response = database.applyCookies(
      apiSuccess({
        authSessionInvalidation: authError ? "application_boundary" : "provider_confirmed",
        status: "signed_out",
      }),
    );
    // When Auth refresh invalidation fails, the application device is already
    // revoked, so existing access tokens are still denied at RLS.
    return clearSensitiveContextResponseCookies(response);
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === "RATE_LIMITED";
    const forbidden =
      error instanceof Error &&
      ["LEARNER_CONTEXT_UNAVAILABLE", "MANAGED_LEARNER_ACTIVE", "REAUTHENTICATION_FAILED"].includes(
        error.message,
      );
    return apiError(rateLimited ? 429 : forbidden ? 403 : 400, {
      code: rateLimited ? "RATE_LIMITED" : forbidden ? "FORBIDDEN" : "INVALID_INPUT",
      message: rateLimited
        ? "Too many attempts. Wait before trying again."
        : forbidden
          ? "Confirm this account-level sign-out with the current password."
          : "Sign-out could not be completed. Try again.",
      retryable: rateLimited || !forbidden,
    });
  }
}
