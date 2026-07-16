import {
  createGuardianManagedLearnerInputSchema,
  updateLearnerProfileInputSchema,
} from "@lumen/auth/profiles";
import { getServerEnvironment } from "@lumen/config/server-env";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { readVerifiedAuthSessionId } from "@/lib/server/auth-session";
import { zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { createOpaqueToken, sha256PostgresBytea } from "@/lib/server/crypto";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { getParentalConsentVerifier } from "@/lib/server/parental-consent";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = createGuardianManagedLearnerInputSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the learner profile details.",
        retryable: false,
      });
    }
    const environment = getServerEnvironment();
    if (
      !environment.enableChildProfiles ||
      environment.deploymentProfile === "vercel_beta" ||
      environment.vercelRuntime
    ) {
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Guardian-managed profiles are disabled in this deployment.",
        retryable: false,
      });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to create a learner profile.",
        retryable: false,
      });
    await assertSelfLearnerMutation(request, userData.user.id);
    const input = parsed.data;
    const evidence = await getParentalConsentVerifier().verify({
      accountId: userData.user.id,
      learnerAgeBand: input.ageBand,
    });
    const settings = {
      analytics: "essential_only",
      public_content: false,
      reading_style: input.preferences.readingStyle,
      reduced_motion: input.preferences.reduceMotion,
      serious_mode: input.preferences.seriousMode,
      social_interactions: false,
      theme: input.preferences.theme,
    } as const;
    const authSessionId = await readVerifiedAuthSessionId(database.client, userData.user.id);
    const authorizationProofHash = await sha256PostgresBytea(createOpaqueToken(32));
    const privileged = createPrivilegedDatabaseClient();
    const { data: authorizationId, error: authorizationError } = await privileged.rpc(
      "admin_issue_verified_child_creation_authorization",
      {
        p_actor_account_id: userData.user.id,
        p_age_band: input.ageBand,
        p_auth_session_id: authSessionId,
        p_avatar_seed: input.avatarSeed,
        p_consent_scope: evidence.scope,
        p_consent_type: "child_profile",
        p_creation_idempotency_key: input.idempotencyKey,
        p_display_name: input.displayName,
        p_evidence_reference: evidence.evidenceReference,
        p_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        p_issue_idempotency_key: crypto.randomUUID(),
        p_policy_version: evidence.policyVersion,
        p_proof_hash: authorizationProofHash,
        p_pseudonym: input.pseudonym,
        p_settings: settings,
        p_verification_method: evidence.method,
      },
    );
    if (authorizationError || !authorizationId) {
      throw new Error("CHILD_PROFILE_AUTHORIZATION_FAILED");
    }
    const { data, error } = await database.client.rpc("current_create_child_learner_configured", {
      p_age_band: input.ageBand,
      p_authorization_proof_hash: authorizationProofHash,
      p_avatar_seed: input.avatarSeed,
      p_consent_scope: evidence.scope,
      p_consent_type: "child_profile",
      p_display_name: input.displayName,
      p_evidence_reference: evidence.evidenceReference,
      p_idempotency_key: input.idempotencyKey,
      p_policy_version: evidence.policyVersion,
      p_pseudonym: input.pseudonym,
      p_settings: settings,
      p_verification_method: evidence.method,
    });
    if (error || !data) throw new Error("CHILD_PROFILE_CREATE_FAILED");
    return database.applyCookies(apiSuccess({ learnerProfileId: data, status: "created" }, 201));
  } catch (error) {
    const unavailable =
      error instanceof Error && error.message === "EXTERNAL_CONSENT_VERIFIER_UNAVAILABLE";
    const notVerified = error instanceof Error && error.message === "EXTERNAL_CONSENT_NOT_VERIFIED";
    return apiError(unavailable ? 503 : notVerified ? 403 : 400, {
      code: unavailable ? "OFFLINE" : notVerified ? "FORBIDDEN" : "INVALID_INPUT",
      message: unavailable
        ? "The configured verified parental-consent provider is not available. No profile was created."
        : notVerified
          ? "Verified parental consent was not returned. No profile was created."
          : "The learner profile could not be created.",
      retryable: unavailable,
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = updateLearnerProfileInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success)
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the learner profile changes.",
        retryable: false,
      });
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to edit the learner profile.",
        retryable: false,
      });
    await assertSelfLearnerMutation(request, userData.user.id);
    const currentResult = await database.client
      .from("learner_profiles")
      .select("display_name,pseudonym,avatar_seed,settings,kind")
      .eq("id", parsed.data.learnerProfileId)
      .single();
    if (currentResult.error || !currentResult.data || currentResult.data.kind === "self")
      return apiError(403, {
        code: "FORBIDDEN",
        message: "That learner profile cannot be edited here.",
        retryable: false,
      });
    const current = currentResult.data;
    const existingSettings =
      typeof current.settings === "object" &&
      current.settings !== null &&
      !Array.isArray(current.settings)
        ? current.settings
        : {};
    const existingTheme = existingSettings.theme;
    const existingReadingStyle = existingSettings.reading_style;
    const preferences =
      parsed.data.preferences ??
      Object.freeze({
        readingStyle:
          existingReadingStyle === "increased_spacing" ? "increased_spacing" : "standard",
        reduceMotion:
          typeof existingSettings.reduced_motion === "boolean"
            ? existingSettings.reduced_motion
            : true,
        seriousMode:
          typeof existingSettings.serious_mode === "boolean" ? existingSettings.serious_mode : true,
        theme: existingTheme === "dark" || existingTheme === "light" ? existingTheme : "system",
      });
    const { error } = await database.client.rpc("current_update_learner_profile", {
      p_avatar_seed: parsed.data.avatarSeed ?? current.avatar_seed,
      p_display_name: parsed.data.displayName ?? current.display_name ?? current.pseudonym,
      p_idempotency_key: crypto.randomUUID(),
      p_learner_profile_id: parsed.data.learnerProfileId,
      p_pseudonym: parsed.data.pseudonym ?? current.pseudonym,
      p_reading_style: preferences.readingStyle,
      p_reduced_motion: preferences.reduceMotion,
      p_serious_mode: preferences.seriousMode,
      p_theme: preferences.theme,
    });
    if (error) throw new Error("LEARNER_UPDATE_FAILED");
    return database.applyCookies(apiSuccess({ message: "Learner profile saved." }));
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "The learner profile could not be saved.",
      retryable: true,
    });
  }
}
