import "server-only";

import type { PendingAuthAgeGate } from "@lumen/auth/inputs";
import { oauthProviderNameSchema } from "@lumen/auth/providers";
import { normalizeReturnUrl } from "@lumen/auth/redirects";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { ensureApplicationAccount } from "./account-provisioning";
import {
  issueVerifiedOnboardingAgeGate,
  pendingPasswordGateMatchesEmail,
  readPendingAuthAgeGate,
} from "./pending-auth-age-gate";

interface CallbackUser {
  readonly email?: string;
  readonly id: string;
}

export type AuthenticationAgeGateOutcome =
  | {
      readonly allowed: false;
      readonly deleteProvisionalAccount: true;
    }
  | {
      readonly allowed: true;
      readonly onboardingGate: Awaited<ReturnType<typeof issueVerifiedOnboardingAgeGate>> | null;
      readonly returnTo: string;
    };

function isEstablishedApplicationProfile(
  profile: {
    readonly onboarding_completed_at: string | null;
  } | null,
): boolean {
  return profile?.onboarding_completed_at != null;
}

async function readCallbackGate(
  request: NextRequest,
  user: CallbackUser,
  now: Date,
): Promise<PendingAuthAgeGate | null> {
  const callbackNonce = request.nextUrl.searchParams.get("ageGate");
  const authFlow = request.nextUrl.searchParams.get("authFlow");
  if (authFlow === "password_signup") {
    const gate = await readPendingAuthAgeGate(
      request,
      callbackNonce,
      { flow: "password_signup", provider: null },
      now,
    );
    return gate && (await pendingPasswordGateMatchesEmail(gate, user.email)) ? gate : null;
  }
  if (authFlow === "oauth") {
    const provider = oauthProviderNameSchema.safeParse(
      request.nextUrl.searchParams.get("provider"),
    );
    if (!provider.success) return null;
    return readPendingAuthAgeGate(
      request,
      callbackNonce,
      { flow: "oauth", provider: provider.data },
      now,
    );
  }
  return null;
}

/**
 * Decides whether an authenticated callback may provision an application
 * account. Completed application accounts remain usable without a gate. Every
 * incomplete account must carry a valid signed signup gate; there is no
 * elapsed-time or user-metadata fallback.
 */
export async function resolveAuthenticationAgeGate(
  request: NextRequest,
  user: CallbackUser,
  now = new Date(),
): Promise<AuthenticationAgeGateOutcome> {
  const privileged = createPrivilegedDatabaseClient();
  const { data: profileRows, error: profileError } = await privileged.rpc(
    "admin_get_authentication_profile_state",
    { p_actor_account_id: user.id },
  );
  const profileState = profileRows?.[0];
  if (profileError || !profileState) throw new Error("AGE_GATE_PROFILE_LOOKUP_FAILED");

  const gate = await readCallbackGate(request, user, now);
  const eligibleSignupGate = gate?.intent === "sign_up" && gate.ageBand !== null ? gate : null;
  const establishedAccount =
    profileState.profile_exists && isEstablishedApplicationProfile(profileState);
  if (!establishedAccount && !eligibleSignupGate) {
    return Object.freeze({ allowed: false, deleteProvisionalAccount: true });
  }

  await ensureApplicationAccount(user.id);
  const returnTo =
    gate?.returnTo ?? normalizeReturnUrl(request.nextUrl.searchParams.get("returnTo"));
  const onboardingGate = eligibleSignupGate
    ? await issueVerifiedOnboardingAgeGate({
        accountId: user.id,
        ageBand: eligibleSignupGate.ageBand,
        returnTo,
      })
    : null;
  return Object.freeze({ allowed: true, onboardingGate, returnTo });
}

export async function deleteRejectedProvisionalAuthUser(accountId: string): Promise<void> {
  const { error } = await createPrivilegedDatabaseClient().rpc("admin_reject_provisional_account", {
    p_actor_account_id: accountId,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error("UNVERIFIED_AUTH_ACCOUNT_CLEANUP_FAILED");
}
