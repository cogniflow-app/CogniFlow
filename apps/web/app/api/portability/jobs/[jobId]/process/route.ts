import {
  PortabilityError,
  isEncryptedArchive,
  normalizedGraphSchema,
  sha256Hex,
  type DuplicatePolicy,
  type NormalizedGraph,
  type PortabilityDiagnostic,
  type PortabilitySource,
} from "@lumen/import-export";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { portabilityImportOptionsSchema } from "@/lib/portability/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createPortabilityMutationContext,
  isPortabilityContext,
} from "@/lib/server/portability-route";
import {
  assertPortabilitySource,
  createImportedFolders,
  mapPortabilitySource,
  mediaFilesForPortabilitySource,
  registerImportedMedia,
  restoreSafeAccountSettings,
  writeImportedGraph,
} from "@/lib/server/portability-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z
  .object({
    archivePassphrase: z.string().min(12).max(1024).optional(),
  })
  .strict();

const NOTE_CHUNK_SIZE = 500;
const PROGRESS_CHUNK_SIZE = 500;

function ownRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function isOwnRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function sliceNotes(graph: NormalizedGraph, start: number, end: number): NormalizedGraph {
  let offset = 0;
  return normalizedGraphSchema.parse({
    ...graph,
    decks: graph.decks.map((deck) => {
      const deckStart = offset;
      const deckEnd = offset + deck.notes.length;
      offset = deckEnd;
      const localStart = Math.max(0, start - deckStart);
      const localEnd = Math.max(0, Math.min(deck.notes.length, end - deckStart));
      return {
        ...deck,
        notes: end <= deckStart || start >= deckEnd ? [] : deck.notes.slice(localStart, localEnd),
      };
    }),
  });
}

function effectiveDuplicatePolicy(policy: Readonly<Record<string, unknown>>): DuplicatePolicy {
  const value = policy.duplicatePolicy;
  return value === "create" ||
    value === "merge_safe_fields" ||
    value === "skip" ||
    value === "update_content_hash" ||
    value === "update_external_id"
    ? value
    : "skip";
}

function terminalFailure(error: unknown) {
  return (
    error instanceof PortabilityError ||
    (error instanceof Error &&
      [
        "PORTABILITY_MAGIC_MISMATCH",
        "PORTABILITY_RESTORE_CONFLICT",
        "PORTABILITY_SOURCE_TOO_LARGE",
      ].includes(error.message))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ jobId: string }> },
) {
  const context = await createPortabilityMutationContext(request);
  if (!isPortabilityContext(context)) return context;
  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return apiError(422, {
      code: "INVALID_JOB",
      message: "Choose a valid import job.",
      retryable: false,
    });
  }
  const body = requestSchema.safeParse(await readBoundedJson(request, 5_000).catch(() => ({})));
  if (!body.success) {
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The resume request is invalid.",
      retryable: false,
    });
  }

  const jobResult = await context.database.client
    .from("import_jobs")
    .select(
      "id,learner_profile_id,kind,status,adapter_code,source_display_name,source_byte_size,source_sha256,requested_policy,payload_fingerprint,processed_count",
    )
    .eq("id", jobId)
    .single();
  if (jobResult.error || !jobResult.data) {
    return apiError(404, {
      code: "NOT_FOUND",
      message: "The import job is unavailable.",
      retryable: false,
    });
  }
  const job = jobResult.data;
  if (!["uploaded", "queued", "retryable"].includes(job.status) || !job.learner_profile_id) {
    return apiError(409, {
      code: "CONFLICT",
      message: "This import job is not waiting for another chunk.",
      retryable: false,
    });
  }
  const policy = ownRecord(job.requested_policy);
  const options = portabilityImportOptionsSchema.safeParse({
    adapterCode: job.adapter_code,
    ...(body.data.archivePassphrase ? { archivePassphrase: body.data.archivePassphrase } : {}),
    conflictPolicy: policy.conflictPolicy ?? "create_independent",
    ...(optionalString(policy.destinationDeckId)
      ? { destinationDeckId: policy.destinationDeckId }
      : {}),
    ...(optionalString(policy.destinationDeckTitle)
      ? { destinationDeckTitle: policy.destinationDeckTitle }
      : {}),
    duplicatePolicy: effectiveDuplicatePolicy(policy),
    ...(ownRecord(policy.mapping).delimiter ? { mapping: policy.mapping } : {}),
    mediaPolicy: policy.mediaPolicy ?? "copy_verified",
    progressPolicy: policy.progressPolicy ?? "omit",
    reviewHistoryPolicy: policy.reviewHistoryPolicy ?? "omit",
    schedulePolicy: policy.schedulePolicy ?? "content_only",
    ...(ownRecord(policy.textMapping).fieldDelimiter ? { textMapping: policy.textMapping } : {}),
  });
  if (!options.success) {
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The saved import plan is no longer valid.",
      retryable: false,
    });
  }

  const privileged = createPrivilegedDatabaseClient();
  let leaseToken: string | null = null;
  let storageBucket: string | null = null;
  let storagePath: string | null = null;
  try {
    const objectResult = await privileged.rpc("admin_get_portability_upload_object", {
      p_account_id: context.accountId,
      p_import_job_id: job.id,
    });
    const object = objectResult.data?.[0];
    if (objectResult.error || !object) throw new Error("PORTABILITY_UPLOAD_UNAVAILABLE");
    storageBucket = object.storage_bucket;
    storagePath = object.storage_path;
    const download = await privileged.storage
      .from(object.storage_bucket)
      .download(object.storage_path);
    if (download.error || !download.data) throw new Error("PORTABILITY_UPLOAD_DOWNLOAD_FAILED");
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    if (
      bytes.byteLength !== job.source_byte_size ||
      bytes.byteLength !== object.byte_size ||
      (await sha256Hex(bytes)) !== job.source_sha256 ||
      object.sha256 !== job.source_sha256
    ) {
      throw new PortabilityError(
        "checksum_mismatch",
        "The saved import source no longer matches its job.",
      );
    }
    const source: PortabilitySource = {
      ...(options.data.archivePassphrase
        ? { archivePassphrase: options.data.archivePassphrase }
        : {}),
      bytes,
      ...(object.declared_mime_type ? { declaredMimeType: object.declared_mime_type } : {}),
      fileName: job.source_display_name,
    };
    const checked = assertPortabilitySource(source);
    if (
      job.adapter_code === "lumen_archive" &&
      isEncryptedArchive(bytes) &&
      !options.data.archivePassphrase
    ) {
      throw new PortabilityError(
        "encrypted_archive_invalid",
        "Enter the archive passphrase to resume this restore.",
      );
    }

    const lease = await privileged.rpc("admin_begin_portability_job", {
      p_job_id: job.id,
      p_job_kind: job.kind,
      p_lease_seconds: 900,
      p_worker_id: crypto.randomUUID(),
    });
    if (lease.error || !lease.data) throw new Error("PORTABILITY_LEASE_FAILED");
    const activeLeaseToken = lease.data;
    leaseToken = activeLeaseToken;

    let graph = await mapPortabilitySource(checked.source, {
      adapterCode: options.data.adapterCode,
      ...(options.data.destinationDeckTitle
        ? { destinationDeckTitle: options.data.destinationDeckTitle }
        : {}),
      duplicatePolicy: options.data.duplicatePolicy,
      ...(options.data.mapping ? { mapping: options.data.mapping } : {}),
      ...(options.data.textMapping ? { textMapping: options.data.textMapping } : {}),
      progressPolicy: options.data.progressPolicy,
    });
    if (job.kind === "restore" && options.data.conflictPolicy === "new_namespace") {
      const namespace = `Restored ${job.id.slice(0, 8)}`;
      graph = normalizedGraphSchema.parse({
        ...graph,
        decks: graph.decks.map((deck) => ({
          ...deck,
          title: `${namespace} · ${deck.title}`.slice(0, 180),
        })),
      });
    }
    const total = graph.decks.reduce((count, deck) => count + deck.notes.length, 0);
    const start = Math.min(Number(job.processed_count), total);
    const end = Math.min(total, start + NOTE_CHUNK_SIZE);
    const mediaRegistration =
      options.data.mediaPolicy === "omit" || graph.media.length === 0
        ? {
            assets: new Map(),
            diagnostics:
              graph.media.length > 0
                ? [
                    {
                      code: "media_omitted",
                      item: `${String(graph.media.length)} media file(s)`,
                      message: "Media was omitted by the selected import policy.",
                      severity: "warning" as const,
                    },
                  ]
                : [],
          }
        : await registerImportedMedia(
            context.database.client,
            privileged,
            graph,
            await mediaFilesForPortabilitySource(options.data.adapterCode, checked.source),
            context.accountId,
            job.id,
          );
    const chunkGraph = sliceNotes(graph, start, end);
    const folderIdsByPath = options.data.destinationDeckId
      ? new Map<string, string>()
      : await createImportedFolders(context.database.client, graph, job.id);
    const writeResult = await writeImportedGraph(
      context.database.client,
      chunkGraph,
      async () => {
        const status = await context.database.client
          .from("import_jobs")
          .select("status")
          .eq("id", job.id)
          .single();
        return status.data?.status === "cancelling" || status.data?.status === "cancelled";
      },
      {
        ...(options.data.destinationDeckId
          ? { destinationDeckId: options.data.destinationDeckId }
          : {}),
        duplicatePolicy: options.data.duplicatePolicy,
        folderIdsByPath,
        jobId: job.id,
        mediaAssets: mediaRegistration.assets,
        recordItem: async (item) => {
          const recorded = await privileged.rpc("admin_record_portability_job_item", {
            p_canonical_id: nullableRpcArgument(item.canonicalId),
            p_item_key: item.itemKey,
            p_job_id: job.id,
            p_job_kind: job.kind,
            p_lease_token: activeLeaseToken,
            p_result: item.result,
            p_safe_warning_codes: [],
            p_source_fingerprint: item.fingerprint,
          });
          if (recorded.error) throw new Error("PORTABILITY_ITEM_RECORD_FAILED");
        },
      },
    );
    const checkpoint = await privileged.rpc("admin_checkpoint_portability_job", {
      p_checkpoint_key: `notes:${String(start)}-${String(end)}`,
      p_checkpoint_ordinal: Math.floor(start / NOTE_CHUNK_SIZE),
      p_error_count: 0,
      p_job_id: job.id,
      p_job_kind: job.kind,
      p_lease_token: activeLeaseToken,
      p_payload_fingerprint: job.payload_fingerprint,
      p_phase: end < total ? "write" : "restore-progress",
      p_processed_count: end,
      p_result_summary: {
        chunkCards: writeResult.cardCount,
        chunkNotes: writeResult.noteCount,
        skipped: writeResult.skippedCount,
        updated: writeResult.updatedCount,
      },
      p_total_count: total,
      p_warning_count:
        graph.warnings.length + graph.loss.length + mediaRegistration.diagnostics.length,
    });
    if (checkpoint.error) throw new Error("PORTABILITY_CHECKPOINT_FAILED");
    if (end < total) {
      const yielded = await privileged.rpc("admin_yield_portability_job", {
        p_job_id: job.id,
        p_job_kind: job.kind,
        p_lease_token: activeLeaseToken,
        p_next_phase: "write",
      });
      if (yielded.error) throw new Error("PORTABILITY_YIELD_FAILED");
      leaseToken = null;
      return context.database.applyCookies(
        apiSuccess(
          {
            jobId: job.id,
            processedCount: end,
            status: "queued",
            totalCount: total,
          },
          202,
        ),
      );
    }

    const idMapResult = await privileged.rpc("admin_get_portability_card_id_map", {
      p_account_id: context.accountId,
      p_import_job_id: job.id,
    });
    if (idMapResult.error || typeof idMapResult.data !== "object" || !idMapResult.data) {
      throw new Error("PORTABILITY_CARD_MAP_FAILED");
    }
    const cardIdMap = idMapResult.data as Readonly<Record<string, string>>;
    let restoredSchedules = 0;
    let restoredReviews = 0;
    let restoredPractice = 0;
    let restoredMastery = 0;
    let progressSkipped = 0;
    if (options.data.progressPolicy !== "omit") {
      const progressChunks = Math.max(
        Math.ceil(graph.schedules.length / PROGRESS_CHUNK_SIZE),
        Math.ceil(graph.reviews.length / PROGRESS_CHUNK_SIZE),
      );
      for (let index = 0; index < progressChunks; index += 1) {
        const progress = await privileged.rpc("admin_restore_portability_progress_chunk", {
          p_account_id: context.accountId,
          p_card_id_map: toDatabaseJson(cardIdMap),
          p_import_job_id: job.id,
          p_learner_profile_id: job.learner_profile_id,
          p_lease_token: activeLeaseToken,
          p_progress_policy: options.data.progressPolicy,
          p_reviews: toDatabaseJson(
            graph.reviews.slice(index * PROGRESS_CHUNK_SIZE, (index + 1) * PROGRESS_CHUNK_SIZE),
          ),
          p_schedules: toDatabaseJson(
            graph.schedules.slice(index * PROGRESS_CHUNK_SIZE, (index + 1) * PROGRESS_CHUNK_SIZE),
          ),
        });
        if (progress.error || !isOwnRecord(progress.data)) {
          throw new Error("PORTABILITY_PROGRESS_RESTORE_FAILED");
        }
        const summary = ownRecord(progress.data);
        restoredSchedules +=
          typeof summary.schedulesRestored === "number" ? summary.schedulesRestored : 0;
        restoredReviews +=
          typeof summary.reviewsRestored === "number" ? summary.reviewsRestored : 0;
        progressSkipped += typeof summary.skipped === "number" ? summary.skipped : 0;
      }
      const evidenceChunks = Math.max(
        Math.ceil(graph.practice.length / PROGRESS_CHUNK_SIZE),
        Math.ceil(graph.mastery.length / PROGRESS_CHUNK_SIZE),
      );
      for (let index = 0; index < evidenceChunks; index += 1) {
        const evidence = await privileged.rpc("admin_restore_portability_evidence_chunk", {
          p_account_id: context.accountId,
          p_card_id_map: toDatabaseJson(cardIdMap),
          p_chunk_ordinal: index,
          p_import_job_id: job.id,
          p_learner_profile_id: job.learner_profile_id,
          p_lease_token: activeLeaseToken,
          p_mastery: toDatabaseJson(
            graph.mastery.slice(index * PROGRESS_CHUNK_SIZE, (index + 1) * PROGRESS_CHUNK_SIZE),
          ),
          p_practice: toDatabaseJson(
            graph.practice.slice(index * PROGRESS_CHUNK_SIZE, (index + 1) * PROGRESS_CHUNK_SIZE),
          ),
          p_progress_policy: options.data.progressPolicy,
        });
        if (evidence.error || !isOwnRecord(evidence.data)) {
          throw new Error("PORTABILITY_EVIDENCE_RESTORE_FAILED");
        }
        const summary = ownRecord(evidence.data);
        restoredPractice +=
          typeof summary.practiceRestored === "number" ? summary.practiceRestored : 0;
        restoredMastery +=
          typeof summary.masteryRestored === "number" ? summary.masteryRestored : 0;
        progressSkipped += typeof summary.skipped === "number" ? summary.skipped : 0;
      }
    }
    const restoreWasClean = policy.destinationWasClean === true;
    const settingsRestore =
      job.kind === "restore" && restoreWasClean
        ? await restoreSafeAccountSettings(
            context.database.client,
            graph,
            context.accountId,
            job.id,
          )
        : {
            diagnostics:
              job.kind === "restore" && Object.keys(graph.settings).length > 0
                ? [
                    {
                      code: "account_settings_not_restored",
                      message:
                        "Account settings were not restored because the destination was not clean when the restore began.",
                      severity: "warning" as const,
                    },
                  ]
                : [],
            restored: [],
          };
    const warnings: PortabilityDiagnostic[] = [
      ...graph.warnings,
      ...mediaRegistration.diagnostics,
      ...settingsRestore.diagnostics,
    ];
    const warningCount = warnings.length + graph.loss.length + progressSkipped;
    const completion = await privileged.rpc("admin_complete_portability_job", {
      p_error_count: 0,
      p_job_id: job.id,
      p_job_kind: job.kind,
      p_lease_token: activeLeaseToken,
      p_result: warningCount > 0 ? "completed_with_warnings" : "completed",
      p_warning_count: warningCount,
    });
    if (completion.error) throw new Error("PORTABILITY_COMPLETE_FAILED");
    leaseToken = null;
    const removal = await privileged.storage
      .from(object.storage_bucket)
      .remove([object.storage_path]);
    if (!removal.error) {
      await privileged.rpc("admin_mark_portability_upload_deleted", {
        p_account_id: context.accountId,
        p_import_job_id: job.id,
      });
    }
    const generatedCardCount = graph.decks.reduce(
      (count, deck) =>
        count +
        deck.notes.reduce(
          (noteCount, note) => noteCount + Math.max(1, note.generatedCards.length),
          0,
        ),
      0,
    );
    return context.database.applyCookies(
      apiSuccess({
        jobId: job.id,
        result: {
          cardCount: generatedCardCount,
          deckIds: writeResult.deckIds,
          losses: graph.loss,
          noteCount: total,
          progressSkipped,
          restoredMastery,
          restoredPractice,
          restoredReviews,
          restoredSchedules,
          restoredSettings: settingsRestore.restored,
          warnings,
        },
        status: warningCount > 0 ? "completed_with_warnings" : "completed",
      }),
    );
  } catch (error) {
    const cancelled = error instanceof Error && error.message === "PORTABILITY_CANCELLED";
    const failed = terminalFailure(error);
    if (leaseToken) {
      await privileged.rpc("admin_complete_portability_job", {
        p_error_count: 1,
        p_job_id: job.id,
        p_job_kind: job.kind,
        p_lease_token: leaseToken,
        p_result: cancelled ? "cancelled" : failed ? "failed" : "retryable",
        p_safe_error_code:
          error instanceof Error ? error.message.slice(0, 80) : "IMPORT_CHUNK_FAILED",
        p_safe_error_summary:
          "The import chunk stopped safely. Completed chunks remain available for an idempotent retry.",
        p_warning_count: 0,
      });
    }
    if ((cancelled || failed) && storageBucket && storagePath) {
      const removal = await privileged.storage.from(storageBucket).remove([storagePath]);
      if (!removal.error) {
        await privileged.rpc("admin_mark_portability_upload_deleted", {
          p_account_id: context.accountId,
          p_import_job_id: job.id,
        });
      }
    }
    return apiError(failed ? 422 : 409, {
      code: failed ? "IMPORT_FAILED" : "JOB_COMMAND_FAILED",
      message:
        error instanceof PortabilityError && error.code === "encrypted_archive_invalid"
          ? error.message
          : "The import chunk stopped safely. Retry the job to continue.",
      retryable: !failed,
    });
  }
}
