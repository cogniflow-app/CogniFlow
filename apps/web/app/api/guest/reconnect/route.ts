import { getServerEnvironment } from "@lumen/config/server-env";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { guestSessionCookieName } from "@/lib/server/cookies";
import { sha256PostgresBytea, verifyCompactPayload } from "@/lib/server/crypto";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

function validReconnectPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Readonly<Record<string, unknown>>;
  return (
    payload.version === 1 &&
    typeof payload.expiresAt === "string" &&
    Date.parse(payload.expiresAt) > Date.now() &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 20 &&
    typeof payload.roomId === "string" &&
    payload.roomId.length >= 3 &&
    payload.roomId.length <= 128
  );
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const body = await readBoundedJson(request, 128);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0
    ) {
      throw new Error("INVALID_INPUT");
    }
    const token = request.cookies.get(guestSessionCookieName)?.value;
    if (!token || token.length > 2_048) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "This guest session is no longer available.",
        retryable: false,
      });
    }
    const serialized = await verifyCompactPayload(
      token,
      getServerEnvironment().guestTokenSigningKey,
    );
    if (!serialized) throw new Error("INVALID_GUEST_TOKEN");
    let payload: unknown;
    try {
      payload = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("INVALID_GUEST_TOKEN");
    }
    if (!validReconnectPayload(payload)) throw new Error("INVALID_GUEST_TOKEN");

    const database = createNextRouteDatabaseContext(request);
    const { data, error } = await database.client.rpc("redeem_guest_session", {
      p_reconnect_token_hash: await sha256PostgresBytea(token),
    });
    const session = data?.[0];
    if (error || !session) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "This guest session is no longer available.",
        retryable: false,
      });
    }
    return database.applyCookies(
      apiSuccess({
        expiresAt: session.expires_at,
        guestSessionId: session.guest_session_id,
        nickname: session.nickname,
        status: "active",
      }),
    );
  } catch {
    return apiError(401, {
      code: "UNAUTHENTICATED",
      message: "This guest session is no longer available.",
      retryable: false,
    });
  }
}
