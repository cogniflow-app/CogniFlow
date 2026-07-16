import { onboardingDetailsInputSchema, onboardingInputSchema } from "@lumen/auth/profiles";
import { normalizeAuthenticationReturnUrl } from "@lumen/auth/redirects";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { readVerifiedAuthSessionId } from "@/lib/server/auth-session";
import { asRecord, zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { createOpaqueToken, sha256PostgresBytea } from "@/lib/server/crypto";
import {
  clearVerifiedOnboardingAgeGate,
  readRequestOnboardingAgeGate,
} from "@/lib/server/pending-auth-age-gate";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const untrusted = asRecord(await readBoundedJson(request));
    const parsed = onboardingDetailsInputSchema.safeParse(untrusted);
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the account setup fields and try again.",
        retryable: false,
      });
    }

    const database = createNextRouteDatabaseContext(request);
    const { data: userData, error: userError } = await database.client.auth.getUser();
    if (userError || !userData.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Your account session has expired. Sign in and continue setup.",
        retryable: false,
      });
    }
    const ageGate = await readRequestOnboardingAgeGate(request, userData.user.id);
    if (!ageGate) {
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Choose your age range again before finishing account setup.",
        retryable: false,
      });
    }
    const input = onboardingInputSchema.parse({ ...parsed.data, ageBand: ageGate.ageBand });
    const completionIdempotencyKey = crypto.randomUUID();
    const authorizationProofHash = await sha256PostgresBytea(createOpaqueToken(32));
    const authSessionId = await readVerifiedAuthSessionId(database.client, userData.user.id);
    const privileged = createPrivilegedDatabaseClient();
    const { data: authorizationId, error: authorizationError } = await privileged.rpc(
      "admin_issue_onboarding_authorization",
      {
        p_actor_account_id: userData.user.id,
        p_age_band: input.ageBand,
        p_auth_session_id: authSessionId,
        p_completion_idempotency_key: completionIdempotencyKey,
        p_display_name: input.displayName,
        p_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        p_handle: input.handle,
        p_issue_idempotency_key: crypto.randomUUID(),
        p_learning_goals: input.learningGoals,
        p_locale: input.locale,
        p_proof_hash: authorizationProofHash,
        p_reading_style: input.preferences.readingStyle,
        p_reduced_motion: input.preferences.reduceMotion,
        p_serious_mode: input.preferences.seriousMode,
        p_study_day_start: input.studyDayStartMinutes,
        p_theme: input.preferences.theme,
        p_timezone: input.timeZone,
      },
    );
    if (authorizationError || !authorizationId) {
      throw new Error("ONBOARDING_AUTHORIZATION_FAILED");
    }
    const { error } = await database.client.rpc("current_complete_account_onboarding", {
      p_age_band: input.ageBand,
      p_authorization_proof_hash: authorizationProofHash,
      p_display_name: input.displayName,
      p_handle: input.handle,
      p_idempotency_key: completionIdempotencyKey,
      p_learning_goals: input.learningGoals,
      p_locale: input.locale,
      p_reading_style: input.preferences.readingStyle,
      p_reduced_motion: input.preferences.reduceMotion,
      p_serious_mode: input.preferences.seriousMode,
      p_study_day_start: input.studyDayStartMinutes,
      p_theme: input.preferences.theme,
      p_timezone: input.timeZone,
    });
    if (error) {
      const handleConflict = error.code === "23505";
      return apiError(handleConflict ? 409 : 400, {
        code: handleConflict ? "CONFLICT" : "INVALID_INPUT",
        message: handleConflict
          ? "That handle is unavailable. Choose another."
          : "Account setup could not be saved. Review the form and try again.",
        retryable: !handleConflict,
      });
    }
    return clearVerifiedOnboardingAgeGate(
      database.applyCookies(
        apiSuccess({
          message: "Account setup is complete.",
          next: normalizeAuthenticationReturnUrl(ageGate.returnTo),
          status: "onboarded",
        }),
      ),
    );
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "Account setup could not be saved. Review the form and try again.",
      retryable: true,
    });
  }
}
