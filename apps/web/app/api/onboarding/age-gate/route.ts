import { onboardingAgeGateSelectionInputSchema } from "@lumen/auth/profiles";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { deleteRejectedProvisionalAuthUser } from "@/lib/server/authentication-age-gate";
import { asRecord, zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { clearSensitiveContextResponseCookies } from "@/lib/server/cookies";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import {
  attachVerifiedOnboardingAgeGate,
  issueVerifiedOnboardingAgeGate,
  readRequestOnboardingAgeGate,
} from "@/lib/server/pending-auth-age-gate";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = onboardingAgeGateSelectionInputSchema.safeParse(
      asRecord(await readBoundedJson(request)),
    );
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Choose an age range to continue.",
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
    await assertSelfLearnerMutation(request, userData.user.id);
    const existingGate = await readRequestOnboardingAgeGate(request, userData.user.id);
    if (!existingGate) {
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Restart the verified signup flow before choosing an age range.",
        retryable: false,
      });
    }
    if (parsed.data.ageBand === "under_13") {
      await database.client.auth.signOut({ scope: "local" });
      await deleteRejectedProvisionalAuthUser(userData.user.id);
      return clearSensitiveContextResponseCookies(
        database.applyCookies(
          apiSuccess({ next: "/auth/guardian-required", status: "guardian_required" }),
        ),
      );
    }
    const gate = await issueVerifiedOnboardingAgeGate({
      accountId: userData.user.id,
      ageBand: parsed.data.ageBand,
      returnTo: parsed.data.returnTo,
    });
    return attachVerifiedOnboardingAgeGate(
      database.applyCookies(
        apiSuccess({
          next: `/onboarding?returnTo=${encodeURIComponent(parsed.data.returnTo)}`,
          status: "age_gate_verified",
        }),
      ),
      gate,
    );
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "The age-range choice could not be verified. Please try again.",
      retryable: true,
    });
  }
}
