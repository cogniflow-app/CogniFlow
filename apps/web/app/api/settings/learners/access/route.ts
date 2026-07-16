import { configureProfileAccessInputSchema } from "@lumen/auth/profiles";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { verifyPasswordAndIssueGrant } from "@/lib/server/reauthentication";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

const familyAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createFamilyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => familyAlphabet[value % familyAlphabet.length]).join("");
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = configureProfileAccessInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        message: "Use a strong matching PIN and a lock time from 5 to 30 minutes.",
        retryable: false,
      });
    }
    const body = parsed.data;
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    const user = userData.user;
    if (!user?.email)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to configure profile access.",
        retryable: false,
      });
    await assertSelfLearnerMutation(request, user.id);
    const proofHash = await verifyPasswordAndIssueGrant({
      accountId: user.id,
      email: user.email,
      password: body.password,
      purpose: "security_change",
      request,
    });
    const familyCode = createFamilyCode();
    const { data: configured, error: configureError } = await database.client.rpc(
      "current_configure_learner_profile_access",
      {
        p_family_code: familyCode,
        p_idempotency_key: body.idempotencyKey,
        p_learner_profile_id: body.learnerProfileId,
        p_lock_after_minutes: body.lockAfterMinutes,
        p_pin: body.pin,
        p_reauthentication_proof_hash: proofHash,
      },
    );
    if (configureError) throw new Error("PROFILE_ACCESS_SETUP_FAILED");
    if (!configured) {
      return apiError(409, {
        code: "CONFLICT",
        message:
          "The previous rotation already completed. Submit once more to issue a new family code.",
        retryable: true,
      });
    }
    return database.applyCookies(
      apiSuccess({
        familyCode,
        message: "Profile access rotated. Save the family code now; it will not be shown again.",
      }),
    );
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === "RATE_LIMITED";
    const invalidCredential = error instanceof Error && error.message === "REAUTHENTICATION_FAILED";
    return apiError(rateLimited ? 429 : invalidCredential ? 403 : 400, {
      code: rateLimited ? "RATE_LIMITED" : invalidCredential ? "FORBIDDEN" : "INVALID_INPUT",
      message: rateLimited
        ? "Too many attempts. Wait before trying again."
        : invalidCredential
          ? "The current password could not be verified."
          : "Profile access could not be configured.",
      retryable: !invalidCredential,
    });
  }
}
