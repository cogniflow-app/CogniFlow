import { magicLinkSignInInputSchema, passwordRecoveryRequestInputSchema } from "@lumen/auth/inputs";
import { mapAuthError } from "@lumen/auth/errors";
import { getServerEnvironment } from "@lumen/config/server-env";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { asRecord, buildAuthCallbackUrl, zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { requireRequestRateLimit } from "@/lib/server/rate-limit";
import {
  attachPendingRecoveryIntent,
  issuePendingRecoveryIntent,
} from "@/lib/server/recovery-intent";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const untrusted = asRecord(await readBoundedJson(request));
    const intent = untrusted?.intent;
    if (!untrusted || (intent !== "magic_link" && intent !== "forgot_password")) {
      throw new Error("INVALID_INTENT");
    }
    const { intent: _intent, ...candidate } = untrusted;
    const schema =
      intent === "magic_link" ? magicLinkSignInInputSchema : passwordRecoveryRequestInputSchema;
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Enter a valid email address.",
        retryable: false,
      });
    }

    const rateLimits = getServerEnvironment().rateLimits;
    await requireRequestRateLimit({
      limit: rateLimits.passwordResetAttempts,
      request,
      scope: intent === "magic_link" ? "auth_magic_link" : "auth_password_recovery",
      windowSeconds: rateLimits.windowSeconds,
    });

    const database = createNextRouteDatabaseContext(request);
    const pendingRecovery =
      intent === "forgot_password"
        ? await issuePendingRecoveryIntent({
            email: parsed.data.email,
            returnTo: parsed.data.returnTo,
          })
        : null;
    const callback = buildAuthCallbackUrl(
      intent === "magic_link" ? "authentication" : "recovery",
      parsed.data.returnTo,
      undefined,
      pendingRecovery ? { callbackNonce: pendingRecovery.callbackNonce } : undefined,
    );
    const { error } =
      intent === "magic_link"
        ? await database.client.auth.signInWithOtp({
            email: parsed.data.email,
            options: { emailRedirectTo: callback, shouldCreateUser: false },
          })
        : await database.client.auth.resetPasswordForEmail(parsed.data.email, {
            redirectTo: callback,
          });

    const safe = error
      ? mapAuthError(error, intent === "magic_link" ? "magic_link" : "recovery")
      : null;
    if (safe?.code === "rate_limited") {
      return apiError(429, {
        code: "RATE_LIMITED",
        message: safe.message,
        retryable: true,
      });
    }

    // Deliberately neutral whether the account exists or a provider declined
    // the request. This prevents the endpoint becoming an email oracle.
    const response = database.applyCookies(
      apiSuccess({
        message: "If that address can use this flow, a secure email will arrive shortly.",
        status: "email_sent",
      }),
    );
    return pendingRecovery ? attachPendingRecoveryIntent(response, pendingRecovery) : response;
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return apiError(429, {
        code: "RATE_LIMITED",
        message: "Too many attempts. Wait a moment and try again.",
        retryable: true,
      });
    }
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "We could not start that email flow. Please try again.",
      retryable: true,
    });
  }
}
