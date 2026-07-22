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
    deckIds: z.array(z.uuid()).min(1).max(100),
    expectedCount: z.number().int().positive().optional(),
    idempotencyKey: z.uuid().optional(),
    operation: z.enum(["bury", "mark_leech", "suspend", "unsuspend"]),
    operationEventId: z.uuid().optional(),
    preview: z.boolean(),
    value: z.record(z.string(), z.unknown()),
  })
  .strict();

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (
    !parsed.success ||
    (!parsed.data.preview &&
      (!parsed.data.expectedCount || !parsed.data.idempotencyKey || !parsed.data.operationEventId))
  )
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Preview the selected bulk operation before confirming it.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_bulk_srs_schedule_control", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_deck_ids: [...new Set(parsed.data.deckIds)],
    p_device_id: context.deviceId,
    p_effective_at: new Date().toISOString(),
    p_expected_count: parsed.data.expectedCount ?? 0,
    p_idempotency_key: parsed.data.idempotencyKey ?? NIL_UUID,
    p_learner_profile_id: context.learnerProfileId,
    p_operation: parsed.data.operation,
    p_operation_event_id: parsed.data.operationEventId ?? NIL_UUID,
    p_preview: parsed.data.preview,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_value: toDatabaseJson(parsed.data.value),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The bulk schedule operation could not be completed."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
