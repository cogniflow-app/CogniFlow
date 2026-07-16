import { emailPasswordSignInInputSchema, emailPasswordSignUpInputSchema } from "@lumen/auth/inputs";
import { mapAuthError } from "@lumen/auth/errors";
import { getServerEnvironment } from "@lumen/config/server-env";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { ensureApplicationAccount } from "@/lib/server/account-provisioning";
import { deleteRejectedProvisionalAuthUser } from "@/lib/server/authentication-age-gate";
import { asRecord, buildAuthCallbackUrl, zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { clearSensitiveContextResponseCookies } from "@/lib/server/cookies";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { applyDeviceCookie, registerRequestDevice } from "@/lib/server/device";
import {
  attachPendingAuthAgeGate,
  attachVerifiedOnboardingAgeGate,
  issuePasswordSignupAgeGate,
  issueVerifiedOnboardingAgeGate,
  readRequestOnboardingAgeGate,
} from "@/lib/server/pending-auth-age-gate";
import { requireRequestRateLimit } from "@/lib/server/rate-limit";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const untrusted = asRecord(await readBoundedJson(request));
    const intent = untrusted?.intent;
    if (!untrusted || (intent !== "sign_in" && intent !== "sign_up")) {
      return apiError(400, {
        code: "INVALID_INPUT",
        message: "Review the account details and try again.",
        retryable: false,
      });
    }

    const { intent: _intent, ...candidate } = untrusted;
    const parsed =
      intent === "sign_up"
        ? emailPasswordSignUpInputSchema.safeParse(candidate)
        : emailPasswordSignInInputSchema.safeParse(candidate);
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the highlighted fields and try again.",
        retryable: false,
      });
    }

    if (intent === "sign_up" && "ageBand" in parsed.data && parsed.data.ageBand === "under_13") {
      return apiSuccess({ next: "/auth/guardian-required", status: "guardian_required" });
    }

    const rateLimits = getServerEnvironment().rateLimits;
    await requireRequestRateLimit({
      limit: rateLimits.signupAttempts,
      request,
      scope: intent === "sign_up" ? "auth_signup" : "auth_password_signin",
      windowSeconds: rateLimits.windowSeconds,
    });

    const database = createNextRouteDatabaseContext(request);
    if (intent === "sign_up") {
      const input = emailPasswordSignUpInputSchema.parse(candidate);
      if (input.ageBand === "under_13") {
        return apiSuccess({ next: "/auth/guardian-required", status: "guardian_required" });
      }
      const eligibleAgeBand = input.ageBand;
      const pendingAgeGate = await issuePasswordSignupAgeGate({
        ageBand: eligibleAgeBand,
        email: input.email,
        returnTo: input.returnTo,
      });
      const { data, error } = await database.client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: buildAuthCallbackUrl("authentication", input.returnTo, {
            callbackNonce: pendingAgeGate.callbackNonce,
            flow: "password_signup",
          }),
        },
      });
      if (error) {
        const safe = mapAuthError(error, "sign_up");
        if (safe.code === "account_state_hidden") {
          return database.applyCookies(
            apiSuccess({ next: "/auth/check-email", status: "verification_required" }),
          );
        }
        return apiError(safe.code === "rate_limited" ? 429 : 400, {
          code: safe.code === "rate_limited" ? "RATE_LIMITED" : "INVALID_INPUT",
          message: safe.message,
          retryable: safe.retryable,
        });
      }
      if (data.session) {
        if (!data.user) {
          throw new Error("AUTH_USER_UNAVAILABLE");
        }
        await ensureApplicationAccount(data.user.id);
        const deviceId = await registerRequestDevice(request, data.user.id, database.client);
        const verifiedAgeGate = await issueVerifiedOnboardingAgeGate({
          accountId: data.user.id,
          ageBand: eligibleAgeBand,
          returnTo: input.returnTo,
        });
        return applyDeviceCookie(
          attachVerifiedOnboardingAgeGate(
            database.applyCookies(
              apiSuccess({
                next: `/onboarding?returnTo=${encodeURIComponent(input.returnTo)}`,
                status: "authenticated",
              }),
            ),
            verifiedAgeGate,
          ),
          deviceId,
        );
      }
      return attachPendingAuthAgeGate(
        database.applyCookies(
          apiSuccess({ next: "/auth/check-email", status: "verification_required" }),
        ),
        pendingAgeGate,
      );
    }

    const input = emailPasswordSignInInputSchema.parse(candidate);
    const { data, error } = await database.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      const safe = mapAuthError(error, "sign_in");
      return apiError(safe.code === "rate_limited" ? 429 : 400, {
        code: safe.code === "rate_limited" ? "RATE_LIMITED" : "INVALID_INPUT",
        message: safe.message,
        retryable: safe.retryable,
      });
    }
    if (!data.user) {
      throw new Error("AUTH_USER_UNAVAILABLE");
    }
    const privileged = createPrivilegedDatabaseClient();
    const { data: profileRows, error: profileError } = await privileged.rpc(
      "admin_get_authentication_profile_state",
      { p_actor_account_id: data.user.id },
    );
    const profileState = profileRows?.[0];
    if (profileError || !profileState) {
      throw new Error("AUTH_PROFILE_STATE_UNAVAILABLE");
    }
    if (!profileState.profile_exists || !profileState.onboarding_completed_at) {
      const onboardingGate = await readRequestOnboardingAgeGate(request, data.user.id);
      if (!onboardingGate) {
        await database.client.auth.signOut({ scope: "local" });
        await deleteRejectedProvisionalAuthUser(data.user.id);
        return clearSensitiveContextResponseCookies(
          database.applyCookies(
            apiError(400, {
              code: "INVALID_INPUT",
              message: "We could not complete that account request. Please try again.",
              retryable: false,
            }),
          ),
        );
      }
    }
    await ensureApplicationAccount(data.user.id);
    const deviceId = await registerRequestDevice(request, data.user.id, database.client);
    return applyDeviceCookie(
      database.applyCookies(apiSuccess({ next: input.returnTo, status: "authenticated" })),
      deviceId,
    );
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
      message: "We could not complete that account request. Please try again.",
      retryable: true,
    });
  }
}
