import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";

const schema = z
  .object({ idempotencyKey: z.uuid(), reviewLogId: z.uuid(), undoEventId: z.uuid() })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The undo request is invalid.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_undo_srs_review", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_device_id: context.deviceId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_learner_profile_id: context.learnerProfileId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_reason: "learner requested undo",
    p_review_log_id: parsed.data.reviewLogId,
    p_undo_event_id: parsed.data.undoEventId,
  });
  if (error || !data)
    return context.applyCookies(srsDatabaseError(error ?? {}, "The review could not be undone."));
  return context.applyCookies(apiSuccess({ data }));
}
