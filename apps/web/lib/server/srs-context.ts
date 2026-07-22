import "server-only";

import type { DatabaseClient } from "@lumen/database";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/server/api";
import { readVerifiedAuthSessionId } from "@/lib/server/auth-session";
import { profileSessionCookieName } from "@/lib/server/cookies";
import { sha256PostgresBytea } from "@/lib/server/crypto";
import { applyDeviceCookie, registerRequestDevice } from "@/lib/server/device";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import {
  createNextRouteDatabaseContext,
  type NextRouteDatabaseContext,
} from "@/lib/supabase/server";

export interface SrsRuntimeContext {
  readonly accountId: string;
  readonly authSessionId: string;
  readonly database: NextRouteDatabaseContext;
  readonly deviceId: string;
  readonly learnerProfileId: string;
  readonly privileged: DatabaseClient;
  readonly profileSessionId: string | null;
  applyCookies(response: NextResponse): NextResponse;
}

export async function createSrsRuntimeContext(
  request: NextRequest,
): Promise<SrsRuntimeContext | Response> {
  try {
    assertTrustedMutationRequest(request);
    const database = createNextRouteDatabaseContext(request);
    const { data, error } = await database.client.auth.getUser();
    if (error || !data.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to study.",
        retryable: false,
      });
    }
    const accountId = data.user.id;
    const authSessionId = await readVerifiedAuthSessionId(database.client, accountId);
    const deviceId = await registerRequestDevice(request, accountId, database.client);
    const privileged = createPrivilegedDatabaseClient();
    const token = request.cookies.get(profileSessionCookieName)?.value;
    const tokenValid = token && token.length >= 20 && token.length <= 512 ? token : null;
    const { data: managedRows, error: managedError } = await privileged.rpc(
      "admin_get_managed_profile_session_context",
      {
        p_actor_account_id: accountId,
        p_auth_session_id: authSessionId,
        p_device_id: deviceId,
        p_token_hash: tokenValid ? await sha256PostgresBytea(tokenValid) : "\\x",
      },
    );
    if (managedError) throw new Error("PROFILE_SESSION_UNAVAILABLE");
    const managed = managedRows?.[0];
    if (token && (!managed || !managed.is_active || !managed.token_matches)) {
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Unlock this learner profile again.",
        retryable: false,
      });
    }
    let learnerProfileId: string;
    let profileSessionId: string | null = null;
    if (managed?.is_active && managed.token_matches) {
      learnerProfileId = managed.learner_profile_id;
      profileSessionId = managed.profile_session_id;
    } else {
      const { data: learner, error: learnerError } = await database.client
        .from("learner_profiles")
        .select("id")
        .eq("owner_account_id", accountId)
        .eq("kind", "self")
        .eq("status", "active")
        .single();
      if (learnerError || !learner) throw new Error("LEARNER_CONTEXT_UNAVAILABLE");
      learnerProfileId = learner.id;
    }
    return {
      accountId,
      authSessionId,
      database,
      deviceId,
      learnerProfileId,
      privileged,
      profileSessionId,
      applyCookies(response: NextResponse) {
        return applyDeviceCookie(database.applyCookies(response), deviceId);
      },
    };
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "The study request could not be verified.",
      retryable: false,
    });
  }
}

export function isSrsRuntimeContext(
  value: SrsRuntimeContext | Response,
): value is SrsRuntimeContext {
  return !(value instanceof Response);
}

export function srsDatabaseError(
  error: { readonly code?: string; readonly message?: string },
  fallback: string,
) {
  if (error.code === "40001") {
    return apiError(409, {
      code: "CONFLICT",
      message: error.message?.includes("PRESET")
        ? "Scheduling settings changed. Reload before continuing."
        : "This card was reviewed or changed elsewhere. Reload the canonical schedule.",
      retryable: false,
    });
  }
  if (error.code === "42501") {
    return apiError(403, {
      code: "FORBIDDEN",
      message: "This learner cannot study that card.",
      retryable: false,
    });
  }
  return apiError(error.code === "22023" || error.code === "23505" ? 422 : 500, {
    code: error.code === "22023" || error.code === "23505" ? "INVALID_INPUT" : "INTERNAL",
    message: error.code === "22023" ? "Review the study request and try again." : fallback,
    retryable: error.code !== "22023",
  });
}
