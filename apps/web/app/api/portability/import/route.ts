import {
  canonicalJson,
  isEncryptedArchive,
  portabilityFormatSchema,
  sha256Hex,
  type PortabilitySource,
} from "@lumen/import-export";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { portabilityImportOptionsSchema } from "@/lib/portability/inputs";
import { apiError, apiSuccess } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import {
  createPortabilityMutationContext,
  isPortabilityContext,
} from "@/lib/server/portability-route";
import {
  assertPortabilitySource,
  createImportedFolders,
  graphItemCount,
  mapPortabilitySource,
  mediaFilesForPortabilitySource,
  registerImportedMedia,
  restoreSafeAccountSettings,
  sourceBytes,
  sourceFingerprint,
  writeImportedGraph,
} from "@/lib/server/portability-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFERRED_IMPORT_THRESHOLD_BYTES = 1024 * 1024;

async function sourceAndOptions(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65 * 1024 * 1024) {
    throw new Error("PORTABILITY_SOURCE_TOO_LARGE");
  }
  const form = await request.formData();
  const optionsValue = form.get("options");
  if (typeof optionsValue !== "string") throw new Error("PORTABILITY_OPTIONS_MISSING");
  const options = portabilityImportOptionsSchema.parse(JSON.parse(optionsValue));
  const file = form.get("file");
  const text = form.get("text");
  let source: PortabilitySource;
  if (file instanceof File && file.size > 0) {
    source = {
      ...(options.archivePassphrase ? { archivePassphrase: options.archivePassphrase } : {}),
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredMimeType: file.type || undefined,
      fileName: file.name,
    };
  } else if (typeof text === "string" && text.length > 0) {
    source = { fileName: "pasted-cards.txt", text };
  } else {
    throw new Error("PORTABILITY_SOURCE_MISSING");
  }
  return { options, source: assertPortabilitySource(source) };
}

export async function POST(request: NextRequest) {
  const context = await createPortabilityMutationContext(request);
  if (!isPortabilityContext(context)) return context;
  let jobId: string | null = null;
  let leaseToken: string | null = null;
  let workerId: string | null = null;
  let storagePath: string | null = null;
  let jobKind: "import" | "restore" = "import";
  try {
    const { options, source: checked } = await sourceAndOptions(request);
    jobKind = options.adapterCode === "lumen_archive" ? "restore" : "import";
    const [sourceSha256, learnerResult, existingDecks] = await Promise.all([
      sourceFingerprint(checked.source),
      context.database.client
        .from("learner_profiles")
        .select("id")
        .eq("owner_account_id", context.accountId)
        .eq("kind", "self")
        .neq("status", "deleted")
        .single(),
      context.database.client
        .from("decks")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "archived"]),
    ]);
    if (learnerResult.error || !learnerResult.data) throw new Error("SELF_LEARNER_UNAVAILABLE");
    if (existingDecks.error) throw new Error("PORTABILITY_CONFLICT_CHECK_FAILED");
    const wasCleanAccount = (existingDecks.count ?? 0) === 0;
    if (jobKind === "restore" && options.conflictPolicy === "abort" && !wasCleanAccount) {
      throw new Error("PORTABILITY_RESTORE_CONFLICT");
    }
    const effectiveDuplicatePolicy =
      jobKind !== "restore"
        ? options.duplicatePolicy
        : options.conflictPolicy === "skip_exact"
          ? "skip"
          : options.conflictPolicy === "update_trusted_lineage"
            ? "update_external_id"
            : "create";
    const payloadFingerprint = await sha256Hex(
      new TextEncoder().encode(
        canonicalJson({
          options,
          protocolVersion: 1,
          sourceSha256,
        }),
      ),
    );
    const sourceFormat = portabilityFormatSchema.parse(
      options.adapterCode === "delimited"
        ? options.mapping?.delimiter === "\t"
          ? "tsv"
          : "csv"
        : options.adapterCode === "anki_package"
          ? checked.source.fileName?.toLowerCase().endsWith(".colpkg")
            ? "anki_colpkg"
            : "anki_apkg"
          : options.adapterCode === "lumen_archive" &&
              checked.source.bytes &&
              isEncryptedArchive(checked.source.bytes)
            ? "encrypted_lumen_archive"
            : options.adapterCode,
    );
    const { data: job, error: jobError } = await context.database.client.rpc(
      "current_create_import_job",
      {
        p_adapter_code: options.adapterCode,
        p_idempotency_key: crypto.randomUUID(),
        p_kind: jobKind,
        p_learner_profile_id: learnerResult.data.id,
        p_payload_fingerprint: payloadFingerprint,
        p_requested_policy: {
          conflictPolicy: options.conflictPolicy,
          destinationDeckId: options.destinationDeckId ?? null,
          destinationDeckTitle: options.destinationDeckTitle ?? null,
          destinationWasClean: wasCleanAccount,
          duplicatePolicy: effectiveDuplicatePolicy,
          mapping: options.mapping ?? null,
          mediaPolicy: options.mediaPolicy,
          progressPolicy: options.progressPolicy,
          reviewHistoryPolicy: options.reviewHistoryPolicy,
          schedulePolicy: options.schedulePolicy,
          spreadsheetMapping: options.spreadsheetMapping ?? null,
          textMapping: options.textMapping ?? null,
        },
        p_source_byte_size: checked.byteSize,
        p_source_display_name: checked.source.fileName ?? "Pasted cards",
        p_source_format: sourceFormat,
        p_source_sha256: sourceSha256,
      },
    );
    if (jobError || !job) throw new Error("PORTABILITY_JOB_CREATE_FAILED");
    jobId = job.id;
    const privileged = createPrivilegedDatabaseClient();
    storagePath = `${context.accountId}/${job.id}/${crypto.randomUUID()}`;
    const bytes = sourceBytes(checked.source);
    const upload = await privileged.storage.from("lumen-portability").upload(storagePath, bytes, {
      cacheControl: "0",
      contentType: checked.detectedMimeType,
      upsert: false,
    });
    if (upload.error) throw new Error("PORTABILITY_UPLOAD_FAILED");
    const uploadRegistration = await privileged.rpc("admin_register_portability_upload", {
      p_account_id: context.accountId,
      p_byte_size: checked.byteSize,
      p_declared_mime_type: nullableRpcArgument(checked.source.declaredMimeType ?? null),
      p_detected_mime_type: checked.detectedMimeType,
      p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      p_import_job_id: job.id,
      p_sha256: sourceSha256,
      p_storage_path: storagePath,
    });
    if (uploadRegistration.error) throw new Error("PORTABILITY_UPLOAD_REGISTER_FAILED");
    if (checked.byteSize > DEFERRED_IMPORT_THRESHOLD_BYTES) {
      return context.database.applyCookies(
        apiSuccess(
          {
            jobId: job.id,
            processedCount: 0,
            processingRequired: true,
            status: "uploaded",
            totalCount: null,
          },
          202,
        ),
      );
    }
    workerId = crypto.randomUUID();
    const lease = await privileged.rpc("admin_begin_portability_job", {
      p_job_id: job.id,
      p_job_kind: jobKind,
      p_lease_seconds: 120,
      p_worker_id: workerId,
    });
    if (lease.error || !lease.data) throw new Error("PORTABILITY_LEASE_FAILED");
    const activeLeaseToken = lease.data;
    leaseToken = activeLeaseToken;
    let graph = await mapPortabilitySource(checked.source, {
      adapterCode: options.adapterCode,
      ...(options.destinationDeckTitle
        ? { destinationDeckTitle: options.destinationDeckTitle }
        : {}),
      duplicatePolicy: effectiveDuplicatePolicy,
      ...(options.mapping ? { mapping: options.mapping } : {}),
      ...(options.spreadsheetMapping ? { spreadsheetMapping: options.spreadsheetMapping } : {}),
      ...(options.textMapping ? { textMapping: options.textMapping } : {}),
      progressPolicy: options.progressPolicy,
    });
    if (jobKind === "restore" && options.conflictPolicy === "new_namespace") {
      const namespace = `Restored ${job.id.slice(0, 8)}`;
      graph = {
        ...graph,
        decks: graph.decks.map((deck) => ({
          ...deck,
          title: `${namespace} · ${deck.title}`.slice(0, 180),
        })),
      };
    }
    const mediaRegistration =
      options.mediaPolicy === "omit" || graph.media.length === 0
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
            await mediaFilesForPortabilitySource(options.adapterCode, checked.source),
            context.accountId,
            job.id,
          );
    const total = graphItemCount(graph);
    const inspectCheckpoint = await privileged.rpc("admin_checkpoint_portability_job", {
      p_checkpoint_key: "normalized-graph",
      p_checkpoint_ordinal: 0,
      p_error_count: 0,
      p_job_id: job.id,
      p_job_kind: jobKind,
      p_lease_token: activeLeaseToken,
      p_payload_fingerprint: payloadFingerprint,
      p_phase: "validate",
      p_processed_count: 0,
      p_result_summary: {
        decks: graph.decks.length,
        media: graph.media.length,
        notes: total,
      },
      p_total_count: total,
      p_warning_count: graph.warnings.length + graph.loss.length,
    });
    if (inspectCheckpoint.error) throw new Error("PORTABILITY_CHECKPOINT_FAILED");
    const folderIdsByPath = options.destinationDeckId
      ? new Map<string, string>()
      : await createImportedFolders(context.database.client, graph, job.id);
    const result = await writeImportedGraph(
      context.database.client,
      graph,
      async () => {
        const status = await context.database.client
          .from("import_jobs")
          .select("status")
          .eq("id", job.id)
          .single();
        return status.data?.status === "cancelling" || status.data?.status === "cancelled";
      },
      {
        ...(options.destinationDeckId ? { destinationDeckId: options.destinationDeckId } : {}),
        duplicatePolicy: effectiveDuplicatePolicy,
        folderIdsByPath,
        jobId: job.id,
        mediaAssets: mediaRegistration.assets,
        recordItem: async (item) => {
          const recorded = await privileged.rpc("admin_record_portability_job_item", {
            p_canonical_id: nullableRpcArgument(item.canonicalId),
            p_item_key: item.itemKey,
            p_job_id: job.id,
            p_job_kind: jobKind,
            p_lease_token: activeLeaseToken,
            p_result: item.result,
            p_safe_warning_codes: [],
            p_source_fingerprint: item.fingerprint,
          });
          if (recorded.error) throw new Error("PORTABILITY_ITEM_RECORD_FAILED");
        },
      },
    );
    let restoredSchedules = 0;
    let restoredReviews = 0;
    let restoredPractice = 0;
    let restoredMastery = 0;
    let progressSkipped = 0;
    if (options.progressPolicy !== "omit" && (graph.schedules.length || graph.reviews.length)) {
      const chunkCount = Math.max(
        Math.ceil(graph.schedules.length / 500),
        Math.ceil(graph.reviews.length / 500),
      );
      for (let index = 0; index < chunkCount; index += 1) {
        const progress = await privileged.rpc("admin_restore_portability_progress_chunk", {
          p_account_id: context.accountId,
          p_card_id_map: toDatabaseJson(result.cardIdMap),
          p_import_job_id: job.id,
          p_learner_profile_id: learnerResult.data.id,
          p_lease_token: activeLeaseToken,
          p_progress_policy: options.progressPolicy,
          p_reviews: toDatabaseJson(graph.reviews.slice(index * 500, (index + 1) * 500)),
          p_schedules: toDatabaseJson(graph.schedules.slice(index * 500, (index + 1) * 500)),
        });
        if (progress.error || typeof progress.data !== "object" || progress.data === null) {
          throw new Error("PORTABILITY_PROGRESS_RESTORE_FAILED");
        }
        const summary = progress.data as Readonly<Record<string, unknown>>;
        restoredSchedules +=
          typeof summary.schedulesRestored === "number" ? summary.schedulesRestored : 0;
        restoredReviews +=
          typeof summary.reviewsRestored === "number" ? summary.reviewsRestored : 0;
        progressSkipped += typeof summary.skipped === "number" ? summary.skipped : 0;
      }
    }
    if (options.progressPolicy !== "omit" && (graph.practice.length || graph.mastery.length)) {
      const chunkCount = Math.max(
        Math.ceil(graph.practice.length / 500),
        Math.ceil(graph.mastery.length / 500),
      );
      for (let index = 0; index < chunkCount; index += 1) {
        const evidence = await privileged.rpc("admin_restore_portability_evidence_chunk", {
          p_account_id: context.accountId,
          p_card_id_map: toDatabaseJson(result.cardIdMap),
          p_chunk_ordinal: index,
          p_import_job_id: job.id,
          p_learner_profile_id: learnerResult.data.id,
          p_lease_token: activeLeaseToken,
          p_mastery: toDatabaseJson(graph.mastery.slice(index * 500, (index + 1) * 500)),
          p_practice: toDatabaseJson(graph.practice.slice(index * 500, (index + 1) * 500)),
          p_progress_policy: options.progressPolicy,
        });
        if (evidence.error || typeof evidence.data !== "object" || evidence.data === null) {
          throw new Error("PORTABILITY_EVIDENCE_RESTORE_FAILED");
        }
        const summary = evidence.data as Readonly<Record<string, unknown>>;
        restoredPractice +=
          typeof summary.practiceRestored === "number" ? summary.practiceRestored : 0;
        restoredMastery +=
          typeof summary.masteryRestored === "number" ? summary.masteryRestored : 0;
        progressSkipped += typeof summary.skipped === "number" ? summary.skipped : 0;
      }
    }
    const settingsRestore =
      jobKind === "restore" && wasCleanAccount
        ? await restoreSafeAccountSettings(
            context.database.client,
            graph,
            context.accountId,
            job.id,
          )
        : {
            diagnostics:
              jobKind === "restore" && Object.keys(graph.settings).length > 0
                ? [
                    {
                      code: "account_settings_not_restored",
                      message:
                        "Account settings were not restored because the destination already contained decks.",
                      severity: "warning" as const,
                    },
                  ]
                : [],
            restored: [],
          };
    const warningCount =
      graph.warnings.length +
      graph.loss.length +
      mediaRegistration.diagnostics.length +
      settingsRestore.diagnostics.length +
      progressSkipped;
    const completion = await privileged.rpc("admin_complete_portability_job", {
      p_error_count: 0,
      p_job_id: job.id,
      p_job_kind: jobKind,
      p_lease_token: activeLeaseToken,
      p_result: warningCount > 0 ? "completed_with_warnings" : "completed",
      p_warning_count: warningCount,
    });
    if (completion.error) throw new Error("PORTABILITY_COMPLETE_FAILED");
    const removal = await privileged.storage.from("lumen-portability").remove([storagePath]);
    if (!removal.error) {
      await privileged.rpc("admin_mark_portability_upload_deleted", {
        p_account_id: context.accountId,
        p_import_job_id: job.id,
      });
    }
    return context.database.applyCookies(
      apiSuccess(
        {
          jobId: job.id,
          result: {
            ...result,
            losses: graph.loss,
            progressSkipped,
            restoredMastery,
            restoredPractice,
            restoredReviews,
            restoredSchedules,
            restoredSettings: settingsRestore.restored,
            warnings: [
              ...graph.warnings,
              ...mediaRegistration.diagnostics,
              ...settingsRestore.diagnostics,
            ],
          },
          status: warningCount > 0 ? "completed_with_warnings" : "completed",
        },
        201,
      ),
    );
  } catch (error) {
    if (jobId) {
      const privileged = createPrivilegedDatabaseClient();
      if (leaseToken) {
        await privileged.rpc("admin_complete_portability_job", {
          p_error_count: 1,
          p_job_id: jobId,
          p_job_kind: jobKind,
          p_lease_token: leaseToken,
          p_result:
            error instanceof Error && error.message === "PORTABILITY_CANCELLED"
              ? "cancelled"
              : "failed",
          p_safe_error_code: error instanceof Error ? error.message.slice(0, 80) : "IMPORT_FAILED",
          p_safe_error_summary:
            "The import stopped safely. Existing completed items were preserved.",
          p_warning_count: 0,
        });
      }
      if (storagePath) {
        const removal = await privileged.storage.from("lumen-portability").remove([storagePath]);
        if (!removal.error) {
          await privileged.rpc("admin_mark_portability_upload_deleted", {
            p_account_id: context.accountId,
            p_import_job_id: jobId,
          });
        }
      }
    }
    const errorCode = error instanceof Error ? error.message : "IMPORT_FAILED";
    const tooLarge = errorCode === "PORTABILITY_SOURCE_TOO_LARGE";
    const conflict = errorCode === "PORTABILITY_RESTORE_CONFLICT";
    return apiError(tooLarge ? 413 : conflict ? 409 : 422, {
      code: tooLarge ? "SOURCE_TOO_LARGE" : conflict ? "CONFLICT" : "IMPORT_FAILED",
      message: tooLarge
        ? "Choose a file smaller than 64 MB."
        : conflict
          ? "This restore policy requires an account with no existing decks."
          : "The import could not be completed. Review the source and try again.",
      retryable: !tooLarge && !conflict,
    });
  }
}
