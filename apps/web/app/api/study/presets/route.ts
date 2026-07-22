import { schedulerPresetSchema } from "@lumen/srs";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { presetToDatabase } from "@/lib/study/srs-mapping";

const saveSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    name: z.string().trim().min(1).max(80),
    preset: schedulerPresetSchema,
    presetId: z.uuid(),
  })
  .strict();

const deleteSchema = z
  .object({ expectedVersion: z.number().int().positive(), presetId: z.uuid() })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = saveSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Review the scheduling preset.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_save_srs_preset", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_configuration: toDatabaseJson(presetToDatabase(parsed.data.preset)),
    p_device_id: context.deviceId,
    p_expected_version: parsed.data.expectedVersion,
    p_learner_profile_id: context.learnerProfileId,
    p_name: parsed.data.name,
    p_preset_id: parsed.data.presetId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The scheduling preset could not be saved."),
    );
  return context.applyCookies(apiSuccess({ data }));
}

export async function DELETE(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = deleteSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, { code: "INVALID_INPUT", message: "Choose a valid preset.", retryable: false }),
    );
  const { data, error } = await context.privileged.rpc("admin_delete_srs_preset", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_device_id: context.deviceId,
    p_expected_version: parsed.data.expectedVersion,
    p_learner_profile_id: context.learnerProfileId,
    p_preset_id: parsed.data.presetId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The scheduling preset could not be deleted."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
