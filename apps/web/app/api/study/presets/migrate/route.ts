import { migrateSchedule } from "@lumen/srs";
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
    deckIds: z.array(z.uuid()).min(1).max(100),
    expectedCount: z.number().int().positive().optional(),
    idempotencyKey: z.uuid().optional(),
    operationEventId: z.uuid().optional(),
    preview: z.boolean(),
    targetPresetId: z.uuid(),
  })
  .strict();

const contextSchema = z.object({
  preset: z.record(z.string(), z.unknown()),
  rows: z.array(
    z.object({
      cardId: z.uuid(),
      createdAt: z.iso.datetime({ offset: true }),
      expectedVersion: z.number().int().positive(),
      history: z.array(
        z.object({
          durationMs: z.number().int().min(0).max(86_400_000),
          rating: z.enum(["again", "hard", "good", "easy"]),
          reviewedAt: z.iso.datetime({ offset: true }),
        }),
      ),
    }),
  ),
});

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
        message: "Preview this scheduler migration before confirming it.",
        retryable: false,
      }),
    );
  const deckIds = [...new Set(parsed.data.deckIds)].sort();
  const runtime = {
    p_actor_account_id: context.accountId,
    p_auth_session_id: context.authSessionId,
    p_deck_ids: deckIds,
    p_device_id: context.deviceId,
    p_learner_profile_id: context.learnerProfileId,
    p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    p_target_preset_id: parsed.data.targetPresetId,
  };
  if (parsed.data.preview) {
    const { data, error } = await context.privileged.rpc(
      "admin_preview_srs_algorithm_migration",
      runtime,
    );
    if (error || !data)
      return context.applyCookies(
        srsDatabaseError(error ?? {}, "The scheduler migration preview is unavailable."),
      );
    return context.applyCookies(apiSuccess({ data }));
  }

  const { data: rawMigrationContext, error: migrationContextError } = await context.privileged.rpc(
    "admin_get_srs_algorithm_migration_context",
    runtime,
  );
  const migrationContext = contextSchema.safeParse(rawMigrationContext);
  if (migrationContextError || !migrationContext.success)
    return context.applyCookies(
      srsDatabaseError(
        migrationContextError ?? {},
        "The scheduler migration context is unavailable.",
      ),
    );
  if (migrationContext.data.rows.length !== parsed.data.expectedCount)
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message: "The migration preview changed. Preview it again.",
        retryable: false,
      }),
    );
  const preset = presetFromDatabase(migrationContext.data.preset);
  const transitions = migrationContext.data.rows.map((row) => ({
    cardId: row.cardId,
    expectedVersion: row.expectedVersion,
    scheduleAfter: migrateSchedule(row.history, preset, row.createdAt),
  }));
  const { data, error } = await context.privileged.rpc("admin_commit_srs_algorithm_migration", {
    ...runtime,
    p_expected_count: parsed.data.expectedCount ?? 0,
    p_idempotency_key: parsed.data.idempotencyKey ?? "",
    p_operation_event_id: parsed.data.operationEventId ?? "",
    p_transitions: toDatabaseJson(transitions),
  });
  if (error || !data)
    return context.applyCookies(
      srsDatabaseError(error ?? {}, "The scheduler migration could not be completed."),
    );
  return context.applyCookies(apiSuccess({ data }));
}
