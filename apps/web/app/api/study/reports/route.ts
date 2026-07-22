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
    cardId: z.uuid(),
    details: z.string().trim().min(1).max(1000).optional(),
    idempotencyKey: z.uuid(),
    reason: z.enum(["incorrect", "outdated", "unclear", "unsafe", "accessibility", "other"]),
    reportId: z.uuid(),
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
        message: "Choose a report reason and keep details under 1,000 characters.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_report_study_content", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_card_id: parsed.data.cardId,
    p_details: parsed.data.details ?? "",
    p_device_id: context.deviceId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_learner_profile_id: context.learnerProfileId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_reason: parsed.data.reason,
    p_report_id: parsed.data.reportId,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The content report could not be saved."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
