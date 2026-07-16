import { revokeDeviceProfileSessionsInputSchema } from "@lumen/auth/profiles";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { deviceCookieName } from "@/lib/server/cookies";
import { clearDeviceCookie } from "@/lib/server/device";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { verifyPasswordAndIssueGrant } from "@/lib/server/reauthentication";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = revokeDeviceProfileSessionsInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const body = parsed.data;
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    const user = userData.user;
    if (!user?.email) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to revoke a device.",
        retryable: false,
      });
    }
    await assertSelfLearnerMutation(request, user.id);
    const proofHash = await verifyPasswordAndIssueGrant({
      accountId: user.id,
      email: user.email,
      password: body.password,
      purpose: "security_change",
      request,
    });
    const { error } = await database.client.rpc("current_revoke_device", {
      p_device_id: body.deviceId,
      p_idempotency_key: crypto.randomUUID(),
      p_reauthentication_proof_hash: proofHash,
    });
    if (error) throw new Error("DEVICE_REVOKE_FAILED");

    const currentDevice = request.cookies.get(deviceCookieName)?.value === body.deviceId;
    if (currentDevice) {
      await database.client.auth.signOut({ scope: "local" });
    }
    const response = database.applyCookies(apiSuccess({ currentDevice, status: "revoked" }));
    return currentDevice ? clearDeviceCookie(response) : response;
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === "RATE_LIMITED";
    const invalidCredential = error instanceof Error && error.message === "REAUTHENTICATION_FAILED";
    return apiError(rateLimited ? 429 : invalidCredential ? 403 : 400, {
      code: rateLimited ? "RATE_LIMITED" : invalidCredential ? "FORBIDDEN" : "INVALID_INPUT",
      message: rateLimited
        ? "Too many attempts. Wait before trying again."
        : invalidCredential
          ? "The current password could not be verified."
          : "That device could not be revoked.",
      retryable: !invalidCredential,
    });
  }
}
