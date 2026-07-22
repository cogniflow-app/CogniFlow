import { SRS_ENGINE_VERSION } from "@lumen/srs";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";

const schema = z
  .object({
    cardId: z.uuid(),
    idempotencyKey: z.uuid(),
    operation: z.enum(["star", "unstar"]),
    operationEventId: z.uuid(),
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
        message: "The star change could not be validated.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_set_srs_schedule_control", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_card_id: parsed.data.cardId,
    p_device_id: context.deviceId,
    p_effective_at: new Date().toISOString(),
    p_idempotency_key: parsed.data.idempotencyKey,
    p_learner_profile_id: context.learnerProfileId,
    p_operation: parsed.data.operation,
    p_operation_event_id: parsed.data.operationEventId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_scheduler_version: SRS_ENGINE_VERSION,
    p_study_session_id: nullableRpcArgument<string>(null),
    p_value: toDatabaseJson({}),
  });
  if (error || !data)
    return context.applyCookies(srsDatabaseError(error ?? {}, "The star could not be changed."));
  return context.applyCookies(apiSuccess({ data }));
}
