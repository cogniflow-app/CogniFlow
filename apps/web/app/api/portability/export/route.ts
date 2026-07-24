import {
  encryptArchive,
  normalizedGraphSchema,
  sha256Hex,
  type ExportArtifact,
  type NormalizedGraph,
} from "@lumen/import-export";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { portabilityExportInputSchema } from "@/lib/portability/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { toDatabaseJson } from "@/lib/server/database-arguments";
import { readDeckDetail } from "@/lib/server/content-repository";
import {
  createPortabilityMutationContext,
  isPortabilityContext,
} from "@/lib/server/portability-route";
import { exportPortabilityGraph, graphFromDecks } from "@/lib/server/portability-service";
import type { NextRouteDatabaseContext } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function mediaExtension(mimeType: string) {
  return (
    {
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[mimeType] ?? "bin"
  );
}

function utcTimestamp(value: string): string;
function utcTimestamp(value: null): null;
function utcTimestamp(value: string | null): string | null;
function utcTimestamp(value: string | null) {
  if (value === null) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("PORTABILITY_TIMESTAMP_INVALID");
  return timestamp.toISOString();
}

async function enrichMedia(
  client: NextRouteDatabaseContext["client"],
  graph: NormalizedGraph,
  deckIds: readonly string[],
  includeMedia: boolean,
) {
  if (!includeMedia || deckIds.length === 0) {
    return { graph, mediaFiles: new Map<string, Uint8Array>() };
  }
  const referenceResults = await Promise.all(
    deckIds.map((deckId) => client.rpc("current_get_deck_media", { p_deck_id: deckId })),
  );
  if (referenceResults.some((result) => result.error)) {
    throw new Error("PORTABILITY_MEDIA_SCOPE_FAILED");
  }
  const references = referenceResults.flatMap((result) => result.data ?? []);
  const assetIds = [...new Set(references.map((row) => row.media_asset_id))];
  if (assetIds.length === 0) return { graph, mediaFiles: new Map<string, Uint8Array>() };
  const assets = await client
    .from("media_assets")
    .select(
      "id,alt_text,byte_size,kind,mime_type,sha256,status,storage_bucket,storage_path,owner_account_id",
    )
    .in("id", assetIds)
    .eq("status", "ready");
  if (assets.error || (assets.data ?? []).length !== assetIds.length) {
    throw new Error("PORTABILITY_MEDIA_SCOPE_FAILED");
  }
  const mediaFiles = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const asset of assets.data ?? []) {
    totalBytes += asset.byte_size;
    if (totalBytes > 64 * 1024 * 1024) throw new Error("PORTABILITY_MEDIA_TOO_LARGE");
    const download = await client.storage.from(asset.storage_bucket).download(asset.storage_path);
    if (download.error || !download.data) throw new Error("PORTABILITY_MEDIA_DOWNLOAD_FAILED");
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    if (bytes.byteLength !== asset.byte_size || (await sha256Hex(bytes)) !== asset.sha256) {
      throw new Error("PORTABILITY_MEDIA_CHECKSUM_FAILED");
    }
    mediaFiles.set(asset.sha256, bytes);
  }
  const mediaById = new Map((assets.data ?? []).map((asset) => [asset.id, asset]));
  const mediaIdsByReference = new Map<string, string[]>();
  for (const reference of references) {
    const current = mediaIdsByReference.get(reference.reference_id) ?? [];
    current.push(reference.media_asset_id);
    mediaIdsByReference.set(reference.reference_id, current);
  }
  const enriched: NormalizedGraph = {
    ...graph,
    decks: graph.decks.map((deck) => ({
      ...deck,
      notes: deck.notes.map((note) => ({
        ...note,
        mediaExternalIds: [
          ...new Set([
            ...note.mediaExternalIds,
            ...(note.externalId ? (mediaIdsByReference.get(note.externalId) ?? []) : []),
            ...(deck.externalId ? (mediaIdsByReference.get(deck.externalId) ?? []) : []),
          ]),
        ],
      })),
    })),
    media: [...mediaById.values()].map((asset) => ({
      altText: asset.alt_text ?? "",
      byteSize: asset.byte_size,
      externalId: asset.id,
      fileName: `media-${asset.id}.${mediaExtension(asset.mime_type)}`,
      kind: asset.kind,
      mimeType: asset.mime_type,
      sha256: asset.sha256,
    })),
  };
  return { graph: normalizedGraphSchema.parse(enriched), mediaFiles };
}

function encryptedArtifact(base: ExportArtifact, bytes: Uint8Array): Promise<ExportArtifact> {
  return sha256Hex(bytes).then((sha256) => ({
    ...base,
    bytes: new Uint8Array(bytes),
    fileName: `${base.fileName.replace(/\.lumen$/u, "")}.lumen.enc`,
    format: "encrypted_lumen_archive",
    mimeType: "application/octet-stream",
    sha256,
  }));
}

async function enrichProgress(
  client: NextRouteDatabaseContext["client"],
  graph: NormalizedGraph,
  learnerProfileId: string,
  includeProgress: boolean,
  includeHistory: boolean,
) {
  const cardIds = graph.decks.flatMap((deck) =>
    deck.notes.flatMap((note) =>
      note.generatedCards.flatMap((card) => (card.externalId ? [card.externalId] : [])),
    ),
  );
  if (cardIds.length === 0 || (!includeProgress && !includeHistory)) return graph;
  const [schedules, reviews, practice, mastery] = await Promise.all([
    includeProgress
      ? client
          .from("card_schedules")
          .select("*")
          .eq("learner_profile_id", learnerProfileId)
          .in("card_id", cardIds)
      : Promise.resolve({ data: [], error: null }),
    includeHistory
      ? client
          .from("review_logs")
          .select("*")
          .eq("learner_profile_id", learnerProfileId)
          .in("card_id", cardIds)
          .order("reviewed_at")
      : Promise.resolve({ data: [], error: null }),
    includeHistory
      ? client
          .from("practice_attempts")
          .select(
            "id,card_id,learner_profile_id,occurred_at,mode,verdict,correctness,confidence,duration_ms,hints_used",
          )
          .eq("learner_profile_id", learnerProfileId)
          .in("card_id", cardIds)
          .order("occurred_at")
      : Promise.resolve({ data: [], error: null }),
    includeProgress
      ? client
          .from("concept_mastery")
          .select("*")
          .eq("learner_profile_id", learnerProfileId)
          .in("card_id", cardIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (schedules.error || reviews.error || practice.error || mastery.error) {
    throw new Error("PORTABILITY_PROGRESS_SNAPSHOT_FAILED");
  }
  return {
    ...graph,
    mastery: (mastery.data ?? []).map((row) => ({
      cardExternalId: row.card_id,
      externalId: `mastery:${row.learner_profile_id}:${row.card_id}`,
      learnerExternalId: row.learner_profile_id,
      occurredAt: utcTimestamp(row.last_evidence_at ?? row.updated_at),
      values: {
        evidenceCount: row.evidence_count,
        overall: row.overall,
        recall: row.recall,
        recognition: row.recognition,
        spacedRecallSuccesses: row.spaced_recall_successes,
        stage: row.stage,
      },
    })),
    practice: (practice.data ?? []).map((row) => ({
      cardExternalId: row.card_id,
      externalId: row.id,
      learnerExternalId: row.learner_profile_id,
      occurredAt: utcTimestamp(row.occurred_at),
      values: {
        confidence: row.confidence,
        correctness: row.correctness,
        durationMs: row.duration_ms,
        hintsUsed: row.hints_used,
        mode: row.mode,
        verdict: row.verdict,
      },
    })),
    reviews: (reviews.data ?? []).map((row) => ({
      cardExternalId: row.card_id,
      durationMs: row.duration_ms,
      externalId: row.id,
      learnerExternalId: row.learner_profile_id,
      rating: row.rating,
      reviewedAt: utcTimestamp(row.reviewed_at),
      values: {
        contentVersion: row.content_version,
        presetVersion: row.preset_version,
        scheduleVersionAfter: row.schedule_version_after,
        scheduleVersionBefore: row.schedule_version_before,
        schedulerVersion: row.scheduler_version,
        source: row.source,
      },
    })),
    schedules: (schedules.data ?? []).map((row) => ({
      algorithm: row.algorithm,
      cardExternalId: row.card_id,
      dueAt: utcTimestamp(row.due),
      learnerExternalId: row.learner_profile_id,
      state: row.state,
      values: {
        contentVersion: row.content_version,
        difficulty: row.difficulty,
        elapsedDays: row.elapsed_days,
        lapses: row.lapses,
        learningStep: row.learning_step,
        legacyEaseFactor: row.legacy_ease_factor,
        presetVersion: row.preset_version,
        reps: row.reps,
        scheduledDays: row.scheduled_days,
        schedulerVersion: row.scheduler_version,
        stability: row.stability,
        version: row.version,
      },
    })),
  };
}

export async function POST(request: NextRequest) {
  const context = await createPortabilityMutationContext(request);
  if (!isPortabilityContext(context)) return context;
  let jobId: string | null = null;
  let leaseToken: string | null = null;
  let privacyExportJobId: string | null = null;
  let accountId: string | null = null;
  try {
    const parsed = portabilityExportInputSchema.parse(await readBoundedJson(request, 100_000));
    privacyExportJobId = parsed.privacyExportJobId ?? null;
    accountId = context.accountId;
    const [learner, ownedDecks] = await Promise.all([
      context.database.client
        .from("learner_profiles")
        .select("id")
        .eq("owner_account_id", context.accountId)
        .eq("kind", "self")
        .neq("status", "deleted")
        .single(),
      parsed.scope === "complete_account"
        ? context.database.client
            .from("decks")
            .select("id")
            .eq("owner_account_id", context.accountId)
            .in("status", ["active", "archived"])
            .order("created_at")
            .limit(100)
        : Promise.resolve({ data: parsed.deckIds.map((id) => ({ id })), error: null }),
    ]);
    if (learner.error || !learner.data || ownedDecks.error) {
      throw new Error("PORTABILITY_SCOPE_UNAVAILABLE");
    }
    const deckIds = (ownedDecks.data ?? []).map((row) => row.id);
    const details = await Promise.all(
      deckIds.map((deckId) => readDeckDetail(deckId, context.accountId)),
    );
    if (details.some((detail) => !detail || detail.role !== "owner")) {
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Only owned decks can be exported from this surface.",
        retryable: false,
      });
    }
    const graphBase = graphFromDecks(
      details.filter((detail) => detail !== null),
      {
        adapter: "lumen",
        sourceFormat: "lumen_json",
      },
    );
    let graph = await enrichProgress(
      context.database.client,
      graphBase,
      learner.data.id,
      parsed.includeProgress,
      parsed.includeHistory,
    );
    const mediaSnapshot = await enrichMedia(
      context.database.client,
      graph,
      deckIds,
      parsed.includeMedia,
    );
    graph = mediaSnapshot.graph;
    if (parsed.scope === "complete_account") {
      const snapshotClient = context.database.client;
      const [profile, learners, privacy, consent, guides, sync] = await Promise.all([
        snapshotClient
          .from("profiles")
          .select(
            "id,handle,display_name,locale,timezone,study_day_start,age_band,learning_goals,theme,reduced_motion,serious_mode,created_at,updated_at",
          )
          .eq("id", context.accountId)
          .single(),
        snapshotClient
          .from("learner_profiles")
          .select(
            "id,kind,display_name,pseudonym,age_band,avatar_seed,status,settings,created_at,updated_at",
          )
          .eq("owner_account_id", context.accountId),
        snapshotClient
          .from("privacy_preferences")
          .select(
            "default_content_private,first_party_analytics,allow_product_updates,allow_social_interactions,updated_at",
          )
          .eq("account_id", context.accountId)
          .single(),
        snapshotClient
          .from("consent_records")
          .select(
            "id,learner_profile_id,consent_type,action,policy_version,recorded_at,prior_consent_record_id,reason,scope,verification_method",
          )
          .eq("guardian_account_id", context.accountId),
        snapshotClient
          .from("product_guide_progress")
          .select(
            "id,learner_profile_id,guide_key,guide_version,status,current_step,started_at,completed_at,dismissed_at,last_seen_at",
          )
          .eq("account_id", context.accountId),
        snapshotClient
          .from("sync_device_state")
          .select(
            "learner_profile_id,protocol_version,last_cursor,last_successful_sync_at,media_download_preference,metered_connection_preference,synchronization_paused",
          )
          .eq("account_id", context.accountId),
      ]);
      if (
        profile.error ||
        learners.error ||
        privacy.error ||
        consent.error ||
        guides.error ||
        sync.error
      ) {
        throw new Error("PORTABILITY_ACCOUNT_SNAPSHOT_FAILED");
      }
      const learnerIds = (learners.data ?? []).map((row) => row.id);
      const noteIds = graph.decks.flatMap((deck) =>
        deck.notes.flatMap((note) => (note.externalId ? [note.externalId] : [])),
      );
      const cardIds = graph.decks.flatMap((deck) =>
        deck.notes.flatMap((note) =>
          note.generatedCards.flatMap((card) => (card.externalId ? [card.externalId] : [])),
        ),
      );
      const publicDeckIds = details.flatMap((detail) =>
        detail?.publicId ? [detail.publicId] : [],
      );
      const snapshotService = createPrivilegedDatabaseClient();
      const [
        guardianRelationships,
        learnerAccess,
        devices,
        managedSessions,
        folders,
        presets,
        studySessions,
        acceptedAnswers,
        answerOverrides,
        learningGoals,
        examPlans,
        tests,
        personalBests,
        auditEvents,
        notes,
        noteRevisions,
        deckVersions,
        deckPublications,
        cardPublications,
      ] = await Promise.all([
        snapshotClient
          .from("guardian_relationships")
          .select("id,learner_profile_id,status,activated_at,revoked_at,created_at")
          .eq("guardian_account_id", context.accountId),
        snapshotClient
          .from("learner_profile_access")
          .select("id,learner_profile_id,role,permissions,created_at,revoked_at")
          .eq("account_id", context.accountId),
        snapshotClient
          .from("devices")
          .select("id,display_name,platform,first_seen_at,last_seen_at,revoked_at")
          .eq("account_id", context.accountId),
        snapshotClient
          .from("profile_sessions")
          .select(
            "id,device_id,learner_profile_id,created_at,expires_at,last_used_at,revoked_at,revoke_reason",
          )
          .eq("account_id", context.accountId),
        snapshotClient
          .from("folders")
          .select("id,parent_id,name,position,version,status,created_at,updated_at,deleted_at")
          .eq("owner_account_id", context.accountId),
        snapshotClient.from("srs_presets").select("*").in("learner_profile_id", learnerIds),
        snapshotClient.from("study_sessions").select("*").in("learner_profile_id", learnerIds),
        snapshotClient.from("accepted_answer_rules").select("*").in("card_id", cardIds),
        snapshotClient.from("answer_overrides").select("*").in("learner_profile_id", learnerIds),
        snapshotClient.from("learning_goals").select("*").in("learner_profile_id", learnerIds),
        snapshotClient.from("exam_plans").select("*").in("learner_profile_id", learnerIds),
        snapshotClient
          .from("practice_test_definitions")
          .select("*")
          .in("learner_profile_id", learnerIds),
        snapshotClient.from("personal_bests").select("*").in("learner_profile_id", learnerIds),
        snapshotService.rpc("admin_get_portability_audit_events", {
          p_account_id: context.accountId,
        }),
        snapshotClient.from("notes").select("id,note_type_id").in("id", noteIds),
        snapshotClient.from("note_revisions").select("*").in("note_id", noteIds),
        snapshotClient.from("deck_versions").select("*").in("deck_id", deckIds),
        snapshotClient.from("deck_publications").select("*").in("public_id", publicDeckIds),
        snapshotClient.from("card_publications").select("*").in("deck_public_id", publicDeckIds),
      ]);
      const scopedResults = [
        guardianRelationships,
        learnerAccess,
        devices,
        managedSessions,
        folders,
        presets,
        studySessions,
        acceptedAnswers,
        answerOverrides,
        learningGoals,
        examPlans,
        tests,
        personalBests,
        auditEvents,
        notes,
        noteRevisions,
        deckVersions,
        deckPublications,
        cardPublications,
      ];
      if (scopedResults.some((result) => result.error)) {
        throw new Error("PORTABILITY_ACCOUNT_SNAPSHOT_FAILED");
      }
      const noteTypeIds = [...new Set((notes.data ?? []).map((row) => row.note_type_id))];
      const [noteTypes, noteTypeFields, cardTemplates] = await Promise.all([
        snapshotClient.from("note_types").select("*").in("id", noteTypeIds),
        snapshotClient.from("note_type_fields").select("*").in("note_type_id", noteTypeIds),
        snapshotClient.from("card_templates").select("*").in("note_type_id", noteTypeIds),
      ]);
      if (noteTypes.error || noteTypeFields.error || cardTemplates.error) {
        throw new Error("PORTABILITY_ACCOUNT_SNAPSHOT_FAILED");
      }
      const folderById = new Map((folders.data ?? []).map((folder) => [folder.id, folder]));
      const folderPath = (folderId: string | null) => {
        const names: string[] = [];
        const seen = new Set<string>();
        let currentId = folderId;
        while (currentId && names.length < 32 && !seen.has(currentId)) {
          seen.add(currentId);
          const folder = folderById.get(currentId);
          if (!folder || folder.status === "deleted") break;
          names.unshift(folder.name);
          currentId = folder.parent_id;
        }
        return names;
      };
      graph = {
        ...graph,
        decks: graph.decks.map((deck) => ({
          ...deck,
          folderPath: folderPath(
            details.find((detail) => detail?.id === deck.externalId)?.folderId ?? null,
          ),
        })),
        deckVersions: (deckVersions.data ?? []).map((version) => ({
          createdAt: utcTimestamp(version.created_at),
          deckExternalId: version.deck_id,
          externalId: version.id,
          snapshot: {
            changeKind: version.change_kind,
            contentHash: version.content_hash,
            contentSnapshot: version.content_snapshot,
            deckSnapshot: version.deck_snapshot,
            restoredFromVersion: version.restored_from_version,
            summary: version.summary,
            versionNumber: version.version_number,
          },
        })),
        folders: (folders.data ?? []).map((folder) => ({
          externalId: folder.id,
          name: folder.name,
          parentExternalId: folder.parent_id,
          position: folder.position,
        })),
        noteTypes: (noteTypes.data ?? []).map((noteType) => ({
          code: noteType.code,
          externalId: noteType.id,
          fieldNames: (noteTypeFields.data ?? [])
            .filter((field) => field.note_type_id === noteType.id && !field.deleted_at)
            .sort((left, right) => left.position - right.position)
            .map((field) => field.label),
          name: noteType.display_name,
          templates: (cardTemplates.data ?? [])
            .filter((template) => template.note_type_id === noteType.id && !template.deleted_at)
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((template) => ({
              ...(template.answer_field_key ? { answerFieldKey: template.answer_field_key } : {}),
              back: template.back_template,
              ...(template.styling_css ? { css: template.styling_css } : {}),
              externalId: template.id,
              front: template.front_template,
              name: template.name,
              ordinal: template.ordinal,
              templateKey: template.template_key,
            })),
        })),
        publications: (deckPublications.data ?? []).map((publication) => ({
          deckExternalId:
            details.find((detail) => detail?.publicId === publication.public_id)?.id ??
            publication.public_id,
          visibility:
            publication.visibility === "public" ? ("public" as const) : ("unlisted" as const),
        })),
        revisions: (noteRevisions.data ?? []).map((revision) => ({
          createdAt: utcTimestamp(revision.created_at),
          externalId: revision.id,
          resourceExternalId: revision.note_id,
          snapshot: {
            cardPayload: revision.card_payload_snapshot,
            changeKind: revision.change_kind,
            contentHash: revision.content_hash,
            fields: revision.fields_snapshot,
            noteSnapshot: revision.note_snapshot,
            noteVersion: revision.note_version,
          },
        })),
        sourceVersions: {
          application: "phase-06",
          grading: "phase-04",
          learningEngine: "phase-04",
          offlineProtocol: "1",
          scheduler: "ts-fsrs",
        },
        settings: {
          accountExportVersion: 1,
          acceptedAnswerRules: acceptedAnswers.data ?? [],
          answerOverrides: answerOverrides.data ?? [],
          auditEvents: auditEvents.data,
          cardPublications: cardPublications.data ?? [],
          consent: consent.data ?? [],
          devices: devices.data ?? [],
          examPlans: examPlans.data ?? [],
          guardianRelationships: guardianRelationships.data ?? [],
          guideProgress: guides.data ?? [],
          learnerAccess: learnerAccess.data ?? [],
          learnerProfiles: learners.data ?? [],
          learningGoals: learningGoals.data ?? [],
          personalBests: personalBests.data ?? [],
          privacy: privacy.data,
          profile: profile.data,
          safeManagedSessionMetadata: managedSessions.data ?? [],
          safeOfflineMetadata: sync.data ?? [],
          srsPresets: presets.data ?? [],
          studySessions: studySessions.data ?? [],
          testDefinitions: tests.data ?? [],
        },
      };
      graph = normalizedGraphSchema.parse(graph);
    }
    const payloadFingerprint = await sha256Hex(
      new TextEncoder().encode(
        JSON.stringify({
          deckIds,
          format: parsed.format,
          includeHistory: parsed.includeHistory,
          includeMedia: parsed.includeMedia,
          includeProgress: parsed.includeProgress,
          protocolVersion: 1,
          scope: parsed.scope,
          unsupportedCardPolicy: parsed.unsupportedCardPolicy,
        }),
      ),
    );
    const { data: job, error: jobError } = await context.database.client.rpc(
      "current_create_export_job",
      {
        p_adapter_code: parsed.adapterCode,
        p_export_format: parsed.format,
        p_export_scope: toDatabaseJson({ deckIds, scope: parsed.scope }),
        p_idempotency_key: crypto.randomUUID(),
        p_learner_profile_id: learner.data.id,
        p_payload_fingerprint: payloadFingerprint,
        p_requested_options: toDatabaseJson({
          encrypted: parsed.format === "encrypted_lumen_archive",
          includeHistory: parsed.includeHistory,
          includeMedia: parsed.includeMedia,
          includeProgress: parsed.includeProgress,
          unsupportedCardPolicy: parsed.unsupportedCardPolicy,
        }),
      },
    );
    if (jobError || !job) throw new Error("PORTABILITY_JOB_CREATE_FAILED");
    jobId = job.id;
    const privileged = createPrivilegedDatabaseClient();
    const workerId = crypto.randomUUID();
    const lease = await privileged.rpc("admin_begin_portability_job", {
      p_job_id: job.id,
      p_job_kind: "export",
      p_lease_seconds: 120,
      p_worker_id: workerId,
    });
    if (lease.error || !lease.data) throw new Error("PORTABILITY_LEASE_FAILED");
    leaseToken = lease.data;
    const total = graph.decks.reduce((count, deck) => count + deck.notes.length, 0);
    const checkpoint = await privileged.rpc("admin_checkpoint_portability_job", {
      p_checkpoint_key: "account-snapshot",
      p_checkpoint_ordinal: 0,
      p_error_count: 0,
      p_job_id: job.id,
      p_job_kind: "export",
      p_lease_token: leaseToken,
      p_payload_fingerprint: payloadFingerprint,
      p_phase: "serialize",
      p_processed_count: 0,
      p_result_summary: { decks: graph.decks.length, notes: total },
      p_total_count: total,
      p_warning_count: 0,
    });
    if (checkpoint.error) throw new Error("PORTABILITY_CHECKPOINT_FAILED");
    const baseFormat =
      parsed.format === "encrypted_lumen_archive" ? "lumen_archive" : parsed.format;
    const base = await exportPortabilityGraph(graph, {
      adapterCode: parsed.adapterCode,
      fileName: parsed.fileName,
      format: baseFormat,
      includeHistory: parsed.includeHistory,
      includeMedia: parsed.includeMedia,
      includeProgress: parsed.includeProgress,
      mediaFiles: mediaSnapshot.mediaFiles,
      unsupportedCardPolicy: parsed.unsupportedCardPolicy,
    });
    const artifact =
      parsed.format === "encrypted_lumen_archive"
        ? await encryptedArtifact(
            base,
            await encryptArchive(base.bytes, parsed.archivePassphrase ?? ""),
          )
        : base;
    const storagePath = `${context.accountId}/${job.id}/${crypto.randomUUID()}`;
    const upload = await privileged.storage
      .from("lumen-portability")
      .upload(storagePath, artifact.bytes, {
        cacheControl: "0",
        contentType: artifact.mimeType,
        upsert: false,
      });
    if (upload.error) throw new Error("PORTABILITY_ARTIFACT_UPLOAD_FAILED");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const registration = await privileged.rpc("admin_register_export_artifact", {
      p_account_id: context.accountId,
      p_byte_size: artifact.bytes.byteLength,
      p_display_name: artifact.fileName,
      p_expires_at: expiresAt,
      p_export_job_id: job.id,
      p_format: artifact.format,
      p_loss_summary: toDatabaseJson(artifact.loss),
      p_mime_type: artifact.mimeType,
      p_sha256: artifact.sha256,
      p_storage_path: storagePath,
      p_warning_count: artifact.diagnostics.length,
    });
    if (registration.error || !registration.data) {
      await privileged.storage.from("lumen-portability").remove([storagePath]);
      throw new Error("PORTABILITY_ARTIFACT_REGISTER_FAILED");
    }
    const warningCount = artifact.loss.length + artifact.diagnostics.length;
    const completion = await privileged.rpc("admin_complete_portability_job", {
      p_error_count: 0,
      p_job_id: job.id,
      p_job_kind: "export",
      p_lease_token: leaseToken,
      p_result: warningCount > 0 ? "completed_with_warnings" : "completed",
      p_warning_count: warningCount,
    });
    if (completion.error) throw new Error("PORTABILITY_COMPLETE_FAILED");
    leaseToken = null;
    if (parsed.privacyExportJobId) {
      const privacyJob = await privileged
        .from("data_export_jobs")
        .update({
          completed_at: new Date().toISOString(),
          expires_at: expiresAt,
          portability_export_job_id: job.id,
          result_available: true,
          status: "completed",
        })
        .eq("id", parsed.privacyExportJobId)
        .eq("account_id", context.accountId)
        .eq("status", "queued")
        .select("privacy_request_id")
        .single();
      if (privacyJob.error || !privacyJob.data) {
        throw new Error("PORTABILITY_PRIVACY_EXPORT_LINK_FAILED");
      }
      const privacyRequest = await privileged
        .from("privacy_requests")
        .update({ completed_at: new Date().toISOString(), status: "completed" })
        .eq("id", privacyJob.data.privacy_request_id)
        .eq("account_id", context.accountId);
      if (privacyRequest.error) throw new Error("PORTABILITY_PRIVACY_EXPORT_LINK_FAILED");
    }
    return context.database.applyCookies(
      apiSuccess(
        {
          artifact: {
            byteSize: artifact.bytes.byteLength,
            expiresAt,
            fileName: artifact.fileName,
            id: registration.data.id,
            loss: artifact.loss,
            sha256: artifact.sha256,
          },
          jobId: job.id,
          status: warningCount > 0 ? "completed_with_warnings" : "completed",
        },
        201,
      ),
    );
  } catch (error) {
    if (jobId && leaseToken) {
      const privileged = createPrivilegedDatabaseClient();
      await privileged.rpc("admin_complete_portability_job", {
        p_error_count: 1,
        p_job_id: jobId,
        p_job_kind: "export",
        p_lease_token: leaseToken,
        p_result: "failed",
        p_safe_error_code: error instanceof Error ? error.message.slice(0, 80) : "EXPORT_FAILED",
        p_safe_error_summary: "The export stopped safely. No partial artifact is available.",
        p_warning_count: 0,
      });
    }
    if (privacyExportJobId && accountId) {
      const privileged = createPrivilegedDatabaseClient();
      await privileged
        .from("data_export_jobs")
        .update({
          error_code: error instanceof Error ? error.message.slice(0, 80) : "EXPORT_FAILED",
          status: "failed",
        })
        .eq("id", privacyExportJobId)
        .eq("account_id", accountId)
        .eq("status", "queued");
    }
    return apiError(422, {
      code: "EXPORT_FAILED",
      message: "The export could not be generated. Review the format options and try again.",
      retryable: true,
    });
  }
}
