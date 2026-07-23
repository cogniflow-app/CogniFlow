import { z } from "zod";
import type { NextRequest } from "next/server";

import { guideByKey } from "@/lib/guides/definitions";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";

const schema = z
  .object({
    currentStep: z.number().int().min(0).max(1_000),
    guideKey: z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/u),
    guideVersion: z.number().int().positive(),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default({}),
    progressId: z.uuid(),
    status: z.enum(["not_started", "in_progress", "completed", "dismissed"]),
  })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request, 8_192).catch(() => null));
  const definition = parsed.success ? guideByKey(parsed.data.guideKey) : undefined;
  if (!parsed.success || !definition || definition.version !== parsed.data.guideVersion)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "That guide version is unavailable.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_upsert_product_guide_progress", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_context_learner_profile_id: context.learnerProfileId,
    p_current_step: parsed.data.currentStep,
    p_device_id: context.deviceId,
    p_guide_key: definition.key,
    p_guide_version: definition.version,
    p_learner_profile_id: nullableRpcArgument<string>(
      definition.learnerScoped ? context.learnerProfileId : null,
    ),
    p_metadata: toDatabaseJson(parsed.data.metadata),
    p_metadata_schema_version: 1,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_progress_id: parsed.data.progressId,
    p_seen_at: new Date().toISOString(),
    p_status: parsed.data.status,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "Guide progress could not be saved."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
