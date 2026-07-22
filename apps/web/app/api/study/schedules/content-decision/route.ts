import { preserveOrRelearnAfterContentChange, scheduleSchema } from "@lumen/srs";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { presetFromDatabase } from "@/lib/study/srs-mapping";

const schema = z
  .object({
    cardId: z.uuid(),
    choice: z.enum(["preserve", "relearn", "reset"]),
    expectedScheduleVersion: z.number().int().positive(),
    idempotencyKey: z.uuid(),
    operationEventId: z.uuid(),
    studySessionId: z.uuid(),
  })
  .strict();

function object(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose a valid content-change decision.",
        retryable: false,
      }),
    );
  const { data: rawContext, error: contextError } = await context.privileged.rpc(
    "admin_get_srs_review_context",
    {
      p_actor_account_id: context.accountId,
      p_auth_session_id: context.authSessionId,
      p_card_id: parsed.data.cardId,
      p_device_id: context.deviceId,
      p_learner_profile_id: context.learnerProfileId,
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      p_study_session_id: parsed.data.studySessionId,
    },
  );
  if (contextError || !rawContext)
    return context.applyCookies(
      srsDatabaseError(contextError ?? {}, "The content-change decision is unavailable."),
    );
  const reviewContext = object(rawContext);
  if (reviewContext.scheduleVersion !== parsed.data.expectedScheduleVersion) {
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "The schedule changed. Reload before choosing.",
        retryable: false,
      }),
    );
  }
  const stored = scheduleSchema.safeParse(reviewContext.schedule);
  if (!stored.success) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "A New card has no prior schedule to preserve.",
        retryable: false,
      }),
    );
  }
  const preset = presetFromDatabase(object(reviewContext.preset));
  const after = preserveOrRelearnAfterContentChange(
    parsed.data.choice,
    stored.data,
    preset,
    new Date(),
  );
  const { data, error } = await context.privileged.rpc(
    "admin_apply_content_change_schedule_decision",
    {
      p_actor_account_id: context.accountId,
      p_auth_session_id: context.authSessionId,
      p_card_id: parsed.data.cardId,
      p_choice: parsed.data.choice,
      p_device_id: context.deviceId,
      p_expected_schedule_version: parsed.data.expectedScheduleVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_learner_profile_id: context.learnerProfileId,
      p_operation_event_id: parsed.data.operationEventId,
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
      p_schedule_after: toDatabaseJson(after),
      p_scheduler_version: after.schedulerVersion,
    },
  );
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The content-change decision could not be applied."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
