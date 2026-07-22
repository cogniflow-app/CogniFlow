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
    action: z.enum(["pause", "preview_next", "resume"]),
    cardId: z.uuid().optional(),
    eventId: z.uuid(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ sessionId: string }> },
) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const { sessionId } = await params;
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!z.uuid().safeParse(sessionId).success || !parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The session control is invalid.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_control_study_session", {
    p_action: parsed.data.action,
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    ...(parsed.data.cardId ? { p_card_id: parsed.data.cardId } : {}),
    p_device_id: context.deviceId,
    p_event_id: parsed.data.eventId,
    p_learner_profile_id: context.learnerProfileId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_study_session_id: sessionId,
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The study session could not be changed."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
