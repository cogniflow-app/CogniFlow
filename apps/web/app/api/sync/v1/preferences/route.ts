import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument } from "@/lib/server/database-arguments";
import { createSrsRuntimeContext, isSrsRuntimeContext } from "@/lib/server/srs-context";

const preferencesSchema = z
  .object({
    mediaDownloadPreference: z.enum(["all", "images_only", "none"]),
    meteredConnectionPreference: z.enum(["allow", "avoid_media", "pause"]),
    paused: z.boolean(),
  })
  .strict();

const defaults = {
  mediaDownloadPreference: "images_only" as const,
  meteredConnectionPreference: "avoid_media" as const,
  paused: false,
};

export async function GET(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const { data, error } = await context.database.client
    .from("sync_device_state")
    .select("synchronization_paused,metered_connection_preference,media_download_preference")
    .eq("account_id", context.accountId)
    .eq("learner_profile_id", context.learnerProfileId)
    .eq("device_id", context.deviceId)
    .maybeSingle();
  if (error)
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "Synchronization preferences are temporarily unavailable.",
        retryable: true,
      }),
    );
  return context.applyCookies(
    apiSuccess({
      data: data
        ? {
            mediaDownloadPreference: data.media_download_preference,
            meteredConnectionPreference: data.metered_connection_preference,
            paused: data.synchronization_paused,
          }
        : defaults,
    }),
  );
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = preferencesSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The synchronization preferences could not be validated.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_update_sync_device_preferences", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_device_id: context.deviceId,
    p_learner_profile_id: context.learnerProfileId,
    p_media_download_preference: parsed.data.mediaDownloadPreference,
    p_metered_connection_preference: parsed.data.meteredConnectionPreference,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_synchronization_paused: parsed.data.paused,
  });
  if (error || !data)
    return context.applyCookies(
      apiError(500, {
        code: "INTERNAL",
        message: "The synchronization preferences could not be saved.",
        retryable: true,
      }),
    );
  return context.applyCookies(apiSuccess({ data }));
}
