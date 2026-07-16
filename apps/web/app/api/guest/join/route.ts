import { getServerEnvironment } from "@lumen/config/server-env";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { issueGuestIdentity } from "@/lib/guest/guest-join";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { createOpaqueToken, sha256Bytes, signCompactPayload } from "@/lib/server/crypto";
import { guestSessionCookieName } from "@/lib/server/cookies";
import { productionGuestRoomAdapter } from "@/lib/server/guest-room-adapter";
import { createDatabaseGuestSessionWriter, digestHexToBytes } from "@/lib/server/guest-sessions";
import { consumeRequestRateLimit } from "@/lib/server/rate-limit";
import {
  assertTrustedMutationRequest,
  createRateLimitSubject,
  RequestSecurityError,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const untrusted = await readBoundedJson(request, 4_096);
    const environment = getServerEnvironment();
    const database = createPrivilegedDatabaseClient();
    const now = new Date();
    const subjectHash = digestHexToBytes(await createRateLimitSubject(request, "guest.join"));
    const rateLimit = await consumeRequestRateLimit({
      limit: environment.rateLimits.guestCreationAttempts,
      request,
      scope: "guest_join_attempt",
      windowSeconds: environment.rateLimits.windowSeconds,
    });

    if (!rateLimit.allowed) {
      return apiError(429, {
        code: "RATE_LIMITED",
        message: "Too many room checks. Wait a moment and try again.",
        retryable: true,
        retryAfterMs: rateLimit.retryAfterSeconds * 1_000,
      });
    }

    const result = await issueGuestIdentity(
      untrusted,
      { rateLimitSubjectHash: subjectHash },
      {
        createIdempotencyKey: () => crypto.randomUUID(),
        async createReconnectToken(context) {
          return signCompactPayload(
            JSON.stringify({
              expiresAt: context.expiresAt.toISOString(),
              nonce: createOpaqueToken(),
              roomId: context.roomId,
              version: 1,
            }),
            environment.guestTokenSigningKey,
          );
        },
        hashReconnectToken: sha256Bytes,
        maxSessionLifetimeMs: environment.privacyRetention.guestSessionHours * 60 * 60 * 1_000,
        now: () => now,
        roomAdapter: productionGuestRoomAdapter,
        sessionWriter: createDatabaseGuestSessionWriter(database),
      },
    );

    if (result.kind === "invalid_input") {
      return apiError(422, {
        code: "INVALID_INPUT",
        message: "Enter a valid six-character room code and a safe nickname.",
        retryable: false,
      });
    }
    if (result.kind === "unavailable") {
      return apiError(404, {
        code: "INVALID_INPUT",
        message: "That room is not available. Check the code or ask the host for a new one.",
        retryable: false,
      });
    }

    const response = apiSuccess({
      expiresAt: result.expiresAt.toISOString(),
      next: `/join/${result.joinCode}`,
      nickname: result.nickname,
      status: "guest_ready",
    });
    response.cookies.set(guestSessionCookieName, result.reconnectToken, {
      expires: result.expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: environment.nodeEnvironment === "production",
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return apiError(429, {
        code: "RATE_LIMITED",
        message: "Too many guest sessions were requested. Wait a moment and try again.",
        retryable: true,
      });
    }
    if (
      error instanceof RequestSecurityError ||
      (error instanceof Error &&
        ["INVALID_CONTENT_TYPE", "INVALID_JSON", "PAYLOAD_TOO_LARGE"].includes(error.message))
    ) {
      return apiError(400, {
        code: "INVALID_INPUT",
        message: "The room request was not accepted.",
        retryable: false,
      });
    }
    return apiError(503, {
      code: "INTERNAL",
      message: "Room access could not be checked right now. Try again shortly.",
      retryable: true,
    });
  }
}
