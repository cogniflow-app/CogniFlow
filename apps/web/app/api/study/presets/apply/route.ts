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
  .object({ deckIds: z.array(z.uuid()).min(1).max(1_000), presetId: z.uuid() })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Choose at least one deck and a preset.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_apply_srs_preset_to_decks", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_deck_ids: parsed.data.deckIds,
    p_device_id: context.deviceId,
    p_learner_profile_id: context.learnerProfileId,
    p_preset_id: parsed.data.presetId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The preset could not be applied to those decks."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
