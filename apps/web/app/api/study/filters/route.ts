import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";
import { studyFilterDefinitionSchema } from "@/lib/study/custom-filter";

const saveSchema = z
  .object({
    definition: studyFilterDefinitionSchema,
    expectedVersion: z.number().int().min(0),
    filterId: z.uuid(),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

const deleteSchema = z
  .object({ expectedVersion: z.number().int().positive(), filterId: z.uuid() })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = saveSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Review the saved study filter.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_save_study_filter", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_definition: toDatabaseJson(parsed.data.definition),
    p_device_id: context.deviceId,
    p_expected_version: parsed.data.expectedVersion,
    p_filter_id: parsed.data.filterId,
    p_learner_profile_id: context.learnerProfileId,
    p_name: parsed.data.name,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The study filter could not be saved."),
    );
  return context.applyCookies(apiSuccess({ data }));
}

export async function DELETE(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = deleteSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose a valid saved filter.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_delete_study_filter", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_device_id: context.deviceId,
    p_expected_version: parsed.data.expectedVersion,
    p_filter_id: parsed.data.filterId,
    p_learner_profile_id: context.learnerProfileId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The saved study filter could not be deleted."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
