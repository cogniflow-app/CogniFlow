import { revokeConsentInputSchema } from "@lumen/auth/profiles";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { verifyPasswordAndIssueGrant } from "@/lib/server/reauthentication";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = revokeConsentInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const body = parsed.data;
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    const user = userData.user;
    if (!user?.email)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again before revoking consent.",
        retryable: false,
      });
    await assertSelfLearnerMutation(request, user.id);
    const consentResult = await database.client
      .from("consent_records")
      .select("id,guardian_account_id,action")
      .eq("id", body.consentRecordId)
      .single();
    if (
      consentResult.error ||
      consentResult.data?.guardian_account_id !== user.id ||
      consentResult.data.action !== "granted"
    )
      return apiError(403, {
        code: "FORBIDDEN",
        message: "That consent record cannot be revoked.",
        retryable: false,
      });
    const proofHash = await verifyPasswordAndIssueGrant({
      accountId: user.id,
      email: user.email,
      password: body.password,
      purpose: "security_change",
      request,
    });
    const { data, error } = await database.client.rpc("current_revoke_consent", {
      p_consent_record_id: body.consentRecordId,
      p_idempotency_key: crypto.randomUUID(),
      p_reauthentication_proof_hash: proofHash,
      p_reason: body.reason ?? "Guardian revoked consent",
    });
    if (error || !data) throw new Error("CONSENT_REVOKE_FAILED");
    return database.applyCookies(apiSuccess({ revocationRecordId: data, status: "revoked" }));
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === "RATE_LIMITED";
    const invalidCredential = error instanceof Error && error.message === "REAUTHENTICATION_FAILED";
    return apiError(rateLimited ? 429 : invalidCredential ? 403 : 400, {
      code: rateLimited ? "RATE_LIMITED" : invalidCredential ? "FORBIDDEN" : "INVALID_INPUT",
      message: rateLimited
        ? "Too many attempts. Wait before trying again."
        : invalidCredential
          ? "The current password could not be verified."
          : "Consent could not be revoked.",
      retryable: !invalidCredential,
    });
  }
}
