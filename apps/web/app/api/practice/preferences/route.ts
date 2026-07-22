import { z } from "zod";
import type { NextRequest } from "next/server";

import { practiceModes } from "@/lib/practice/models";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  srsDatabaseError,
} from "@/lib/server/srs-context";

const schema = z
  .object({
    config: z
      .object({
        answerDirection: z.enum(["prompt_answer", "answer_prompt", "mixed"]),
        audio: z.boolean(),
        autoplay: z.boolean(),
        gradingMode: z.enum(["strict", "moderate", "relaxed"]),
        goal: z.object({
          examAt: z.string().max(80).nullable(),
          kind: z.enum([
            "recommended",
            "time",
            "count",
            "mastery",
            "new",
            "due",
            "weak",
            "starred",
            "exam",
          ]),
          masteryTarget: z.number().min(0.5).max(1).nullable(),
          timeMinutes: z.number().int().min(1).max(240).nullable(),
        }),
        hints: z.enum(["off", "on_request"]),
        language: z.string().trim().min(2).max(35),
        questionTypes: z.array(z.string().trim().min(1).max(80)).max(20),
        retypeCorrect: z.boolean(),
        tags: z.array(z.string().trim().min(1).max(80)).max(50),
        targetCount: z.number().int().min(1).max(500),
        testOptions: z
          .object({
            layout: z.enum(["one_at_a_time", "one_page"]),
            partialCredit: z.boolean(),
            pauseAllowed: z.boolean(),
            reviewPolicy: z.enum(["after_each", "end"]),
          })
          .strict(),
        timerSeconds: z.number().int().min(30).max(14_400).nullable(),
      })
      .strict(),
    expectedVersion: z.number().int().min(0),
    mode: z.enum(practiceModes),
  })
  .strict();

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const parsed = schema.safeParse(await readBoundedJson(request, 32_768).catch(() => null));
  if (!parsed.success)
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "Those practice preferences could not be saved.",
        retryable: false,
      }),
    );
  const { data, error } = await context.privileged.rpc("admin_upsert_practice_mode_preference", {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_config: toDatabaseJson(parsed.data.config),
    p_config_schema_version: 1,
    p_device_id: context.deviceId,
    p_expected_version: parsed.data.expectedVersion,
    p_learner_profile_id: context.learnerProfileId,
    p_mode: parsed.data.mode,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "Practice preferences could not be saved."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
