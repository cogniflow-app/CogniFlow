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
  .object({
    attemptId: z.uuid(),
    overrideId: z.uuid(),
    reason: z.enum(["learner_correct", "learner_incorrect", "answer_key_issue"]),
    replacementVerdict: z.enum(["correct", "partial", "incorrect", "needs_review"]),
  })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The answer override is invalid.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_record_answer_override", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_device_id: context.deviceId,
    p_learner_profile_id: context.learnerProfileId,
    p_override_id: parsed.data.overrideId,
    p_practice_attempt_id: parsed.data.attemptId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_reason_code: parsed.data.reason,
    p_replacement_verdict: parsed.data.replacementVerdict,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The answer override could not be recorded."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
