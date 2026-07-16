import { createProfileSessionInputSchema } from "@lumen/auth/profiles";
import { getServerEnvironment } from "@lumen/config/server-env";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { readVerifiedAuthSessionId } from "@/lib/server/auth-session";
import { applyProfileSessionCookie } from "@/lib/server/cookies";
import { createOpaqueToken, sha256PostgresBytea } from "@/lib/server/crypto";
import { applyDeviceCookie, registerRequestDevice } from "@/lib/server/device";
import { requireRequestRateLimit } from "@/lib/server/rate-limit";
import {
  createRateLimitSubject,
  assertTrustedMutationRequest,
} from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = createProfileSessionInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success)
      return apiError(422, {
        code: "INVALID_INPUT",
        message: "Enter the learner family code and PIN.",
        retryable: false,
      });
    const body = parsed.data;
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "A guardian account must be signed in to switch profiles.",
        retryable: false,
      });
    const environment = getServerEnvironment();
    await requireRequestRateLimit({
      accountId: userData.user.id,
      limit: environment.rateLimits.profilePinAttempts,
      request,
      scope: "profile_pin_switch",
      windowSeconds: environment.rateLimits.windowSeconds,
    });
    const learnerResult = await database.client
      .from("learner_profiles")
      .select("settings,kind,status")
      .eq("id", body.learnerProfileId)
      .single();
    if (
      learnerResult.error ||
      !learnerResult.data ||
      learnerResult.data.kind === "self" ||
      learnerResult.data.status !== "active"
    )
      throw new Error("LEARNER_UNAVAILABLE");
    const settings =
      typeof learnerResult.data.settings === "object" &&
      learnerResult.data.settings !== null &&
      !Array.isArray(learnerResult.data.settings)
        ? learnerResult.data.settings
        : {};
    const configuredLock =
      typeof settings.lock_after_minutes === "number" &&
      Number.isInteger(settings.lock_after_minutes)
        ? settings.lock_after_minutes
        : 15;
    const ttlMinutes = Math.min(
      30,
      environment.privacyRetention.profileSessionMinutes,
      configuredLock,
    );
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const token = createOpaqueToken(32);
    const authSessionId = await readVerifiedAuthSessionId(database.client, userData.user.id);
    const deviceId = await registerRequestDevice(request, userData.user.id, database.client);
    const subjectHash = await createRateLimitSubject(
      request,
      "profile_pin_database",
      userData.user.id,
    );
    const privileged = createPrivilegedDatabaseClient();
    const { data, error } = await privileged.rpc("admin_create_profile_session_with_credentials", {
      p_actor_account_id: userData.user.id,
      p_auth_session_id: authSessionId,
      p_device_id: deviceId,
      p_expires_at: expiresAt.toISOString(),
      p_family_code: body.familyCode,
      p_idempotency_key: crypto.randomUUID(),
      p_learner_profile_id: body.learnerProfileId,
      p_pin: body.pin,
      p_subject_hash: `\\x${subjectHash}`,
      p_token_hash: await sha256PostgresBytea(token),
    });
    const session = data?.[0];
    if (error || !session || session.account_id !== userData.user.id)
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Those learner profile credentials were not accepted.",
        retryable: false,
      });
    const response = database.applyCookies(
      apiSuccess({
        expiresAt: session.expires_at,
        learnerProfileId: session.learner_profile_id,
        status: "active",
      }),
    );
    return applyDeviceCookie(applyProfileSessionCookie(response, token, expiresAt), deviceId);
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === "RATE_LIMITED";
    return apiError(rateLimited ? 429 : 400, {
      code: rateLimited ? "RATE_LIMITED" : "INVALID_INPUT",
      message: rateLimited
        ? "Too many PIN attempts. Wait before trying again."
        : "The learner profile could not be opened.",
      retryable: !rateLimited,
    });
  }
}
