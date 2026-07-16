import { dataExportRequestInputSchema } from "@lumen/auth/privacy";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = dataExportRequestInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose a supported export format.",
        retryable: false,
      });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to request an export.",
        retryable: false,
      });
    }
    await assertSelfLearnerMutation(request, userData.user.id);
    const { data, error } = await database.client.rpc("current_request_data_export", {
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error || !data) throw new Error("EXPORT_REQUEST_FAILED");
    return database.applyCookies(apiSuccess({ exportJobId: data, status: "queued" }, 202));
  } catch (error) {
    const rateLimited = error instanceof Error && error.message.includes("rate limit");
    return apiError(rateLimited ? 429 : 400, {
      code: rateLimited ? "RATE_LIMITED" : "INVALID_INPUT",
      message: rateLimited
        ? "Export requests are limited. Wait before requesting another archive."
        : "The export request could not be queued.",
      retryable: true,
    });
  }
}
