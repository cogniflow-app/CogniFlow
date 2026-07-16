import { passwordResetInputSchema } from "@lumen/auth/inputs";
import { mapAuthError } from "@lumen/auth/errors";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { clearRecoveryIntent, readRecoveryIntent } from "@/lib/server/recovery-intent";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = passwordResetInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the password fields and try again.",
        retryable: false,
      });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data: userData, error: userError } = await database.client.auth.getUser();
    if (userError || !userData.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "That recovery session has expired. Request a new recovery email.",
        retryable: false,
      });
    }
    await assertSelfLearnerMutation(request, userData.user.id);
    const recoveryIntent = await readRecoveryIntent(request);
    if (!recoveryIntent || recoveryIntent.accountId !== userData.user.id) {
      return apiError(403, {
        code: "FORBIDDEN",
        message: "That recovery session has expired. Request a new recovery email.",
        retryable: false,
      });
    }
    const { error } = await database.client.auth.updateUser({ password: parsed.data.password });
    if (error) {
      const safe = mapAuthError(error, "recovery");
      return apiError(400, {
        code: "INVALID_INPUT",
        message: safe.message,
        retryable: safe.retryable,
      });
    }
    return database.applyCookies(
      clearRecoveryIntent(
        apiSuccess({
          message: "Your password was updated.",
          next: "/app/settings/security?password=updated",
        }),
      ),
    );
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "That password could not be updated. Request a new recovery email if needed.",
      retryable: true,
    });
  }
}
