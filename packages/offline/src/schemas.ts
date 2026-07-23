import { z } from "zod";

export const OFFLINE_PROTOCOL_VERSION = 1 as const;
export const LOCAL_SCHEMA_VERSION = 1 as const;
export const LUMEN_OFFLINE_DATABASE_NAME = "lumen-offline-v1" as const;

const uuid = z.uuid();
const isoDateTime = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const safeText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const localEntityReferenceSchema = z
  .object({
    entityId: safeText(180),
    entityType: z.enum([
      "deck",
      "card_entry",
      "study_card",
      "schedule",
      "review",
      "practice_attempt",
      "media",
      "study_session",
    ]),
    local: z.boolean(),
  })
  .strict();

export const privateNamespaceSchema = z
  .object({
    accountId: uuid,
    kind: z.literal("private"),
    learnerProfileId: uuid,
  })
  .strict();

export const publicNamespaceSchema = z.object({ kind: z.literal("public") }).strict();
export const profileCacheNamespaceSchema = z.discriminatedUnion("kind", [
  privateNamespaceSchema,
  publicNamespaceSchema,
]);

export const projectionMetadataSchema = z
  .object({
    contentHash: sha256.optional(),
    entity: localEntityReferenceSchema,
    namespace: profileCacheNamespaceSchema,
    serverUpdatedAt: isoDateTime.nullable(),
    serverVersion: z.number().int().nonnegative().nullable(),
    storedAt: isoDateTime,
  })
  .strict();

export const deviceIdentitySchema = z
  .object({
    conflictCount: z.number().int().nonnegative(),
    currentNamespaceKey: z.string().min(1).max(160).nullable(),
    deviceId: uuid,
    displayName: safeText(100),
    firstRegisteredAt: isoDateTime,
    lastSeenAt: isoDateTime,
    lastSuccessfulSyncAt: isoDateTime.nullable(),
    mediaDownloadPreference: z.enum(["all", "images_only", "none"]),
    meteredConnectionPreference: z.enum(["allow", "avoid_media", "pause"]),
    paused: z.boolean(),
    pendingOperationCount: z.number().int().nonnegative(),
    platformSummary: safeText(120),
    storageUsageBytes: z.number().int().nonnegative(),
  })
  .strict();

export const syncCursorSchema = z
  .object({
    sequence: z.string().regex(/^\d+$/u),
    stream: z.enum(["content", "media", "practice", "reviews", "permissions"]),
  })
  .strict();

export const reviewEventSchema = z
  .object({
    baseScheduleVersion: z.number().int().nonnegative(),
    beforeSchedule: z.record(z.string(), z.unknown()),
    cardId: uuid,
    durationMs: z.number().int().min(0).max(86_400_000),
    kind: z.literal("review"),
    priorReviewOperationId: uuid.nullable(),
    rating: z.enum(["again", "hard", "good", "easy"]),
    reviewId: uuid,
    reviewedAt: isoDateTime,
    source: z.enum(["today", "deck", "folder", "filtered", "review_ahead", "cram"]),
    studyDayStart: z.number().int().min(0).max(1_439),
    studySessionId: uuid,
    timezone: safeText(80),
  })
  .strict();

export const reviewUndoEventSchema = z
  .object({
    kind: z.literal("review_undo"),
    reason: z.string().trim().max(300).nullable(),
    reviewId: uuid,
    undoEventId: uuid,
  })
  .strict();

export const practiceAttemptEventSchema = z
  .object({
    answerRevealed: z.boolean(),
    attemptId: uuid,
    contentVersion: z.number().int().positive(),
    durationMs: z.number().int().min(0).max(86_400_000),
    hintsUsed: z.number().int().min(0).max(100),
    itemPosition: z.number().int().min(0).max(9_999),
    kind: z.literal("practice_attempt"),
    response: z.string().max(4_096),
    responseKind: safeText(80),
    retryCount: z.number().int().min(0).max(100),
    selfConfidence: z.number().min(0).max(1).nullable(),
    selfVerdict: z.enum(["correct", "partial", "incorrect", "needs_review"]).nullable(),
    sessionId: uuid,
  })
  .strict();

const richDocumentSchema = z
  .object({
    content: z.array(z.record(z.string(), z.unknown())).max(5_000),
    type: z.literal("doc"),
    version: z.number().int().positive(),
  })
  .strict();

const localOrCanonicalId = z
  .string()
  .min(1)
  .max(180)
  .refine(
    (value) => z.uuid().safeParse(value).success || /^local:[a-z_]+:[a-z0-9-]+$/u.test(value),
    {
      message: "Use a canonical UUID or a normalized local identifier.",
    },
  );

export const contentMutationSchema = z
  .object({
    baseSnapshot: z.record(z.string(), z.unknown()).nullable(),
    changes: z
      .object({
        archived: z.boolean().optional(),
        authoringData: z.record(z.string(), z.unknown()).optional(),
        coverAssetId: localOrCanonicalId.nullable().optional(),
        deckId: localOrCanonicalId.optional(),
        description: richDocumentSchema.optional(),
        descriptionText: z.string().max(2_000).optional(),
        expectedVersion: z.number().int().nonnegative().nullable().optional(),
        fields: z.record(safeText(100), richDocumentSchema).optional(),
        folderId: uuid.nullable().optional(),
        languageBack: safeText(35).optional(),
        languageFront: safeText(35).optional(),
        license: z.enum(["all_rights_reserved", "cc0", "cc_by", "cc_by_sa"]).optional(),
        noteId: localOrCanonicalId.nullable().optional(),
        order: z.number().int().nonnegative().optional(),
        source: z.string().max(500).optional(),
        tags: z.array(safeText(100)).max(100).optional(),
        theme: z.enum(["neutral", "ocean", "forest", "contrast"]).optional(),
        title: z.string().trim().min(1).max(200).optional(),
        tombstone: z.boolean().optional(),
        visibility: z.enum(["private", "unlisted", "public"]).optional(),
      })
      .strict(),
    kind: z.literal("content_mutation"),
    mutationType: z.enum([
      "create_deck",
      "update_deck",
      "create_card_entry",
      "update_card_entry",
      "archive",
      "delete",
      "restore",
      "reorder",
    ]),
    temporaryId: z.string().min(1).max(180).nullable(),
  })
  .strict();

export const mediaMutationSchema = z
  .object({
    altText: z.string().trim().max(1_000),
    byteSize: z.number().int().positive().max(10_485_760),
    fileName: safeText(255),
    kind: z.literal("media_mutation"),
    mediaKind: z.enum(["image", "audio"]),
    mimeType: safeText(120),
    ownerEntity: localEntityReferenceSchema,
    sha256,
    temporaryMediaId: z.string().min(1).max(180),
    transcript: z.string().trim().max(4_000),
  })
  .strict();

export const outboxPayloadSchema = z.discriminatedUnion("kind", [
  reviewEventSchema,
  reviewUndoEventSchema,
  practiceAttemptEventSchema,
  contentMutationSchema,
  mediaMutationSchema,
]);

export const typedFailureSchema = z
  .object({
    code: z.enum([
      "network",
      "rate_limited",
      "server_unavailable",
      "unauthorized",
      "permission_removed",
      "device_revoked",
      "validation",
      "idempotency_conflict",
      "content_conflict",
      "review_conflict",
      "media_rejected",
      "protocol_unsupported",
      "storage_full",
      "unknown",
    ]),
    message: safeText(300),
    retryable: z.boolean(),
  })
  .strict();

export const outboxOperationSchema = z
  .object({
    accountId: uuid,
    attemptCount: z.number().int().min(0).max(100),
    baseVersion: z.number().int().nonnegative().nullable(),
    createdAt: isoDateTime,
    entityId: z.string().min(1).max(180),
    entityType: z.enum(["review", "review_undo", "practice_attempt", "content", "media"]),
    id: uuid,
    idempotencyKey: uuid,
    lastFailure: typedFailureSchema.nullable(),
    learnerProfileId: uuid,
    nextAttemptAt: isoDateTime.nullable(),
    occurredAt: isoDateTime,
    operation: safeText(80),
    payload: outboxPayloadSchema,
    payloadFingerprint: sha256,
    priorOperationId: uuid.nullable(),
    protocolVersion: z.literal(OFFLINE_PROTOCOL_VERSION),
    registeredDeviceId: uuid,
    status: z.enum([
      "pending",
      "syncing",
      "acknowledged",
      "conflict",
      "retryable",
      "rejected",
      "dead_letter",
      "abandoned",
    ]),
  })
  .strict();

export const acknowledgmentSchema = z
  .object({
    acknowledgedAt: isoDateTime,
    canonicalEntityId: z.string().min(1).max(180).nullable(),
    canonicalVersion: z.number().int().nonnegative().nullable(),
    operationId: uuid,
    receiptId: uuid,
  })
  .strict();

export const conflictSchema = z
  .object({
    conflictId: uuid,
    createdAt: isoDateTime,
    entity: localEntityReferenceSchema,
    kind: z.enum([
      "review_chain",
      "same_field",
      "rich_overlap",
      "delete_edit",
      "media",
      "permission",
    ]),
    localChangedAt: isoDateTime,
    localValue: z.unknown(),
    mergedFields: z.array(safeText(100)).max(100),
    namespace: privateNamespaceSchema,
    operationId: uuid,
    resolution: z
      .enum([
        "use_server",
        "keep_local_revision",
        "manual_merge",
        "duplicate_entity",
        "accept_canonical_replay",
        "retain_as_practice",
        "retry_media",
        "abandon",
      ])
      .nullable(),
    resolvedAt: isoDateTime.nullable(),
    serverChangedAt: isoDateTime.nullable(),
    serverValue: z.unknown(),
  })
  .strict();

export const conflictResolutionSchema = z
  .object({
    conflictId: uuid,
    mergedValue: z.unknown().optional(),
    resolution: z.enum([
      "use_server",
      "keep_local_revision",
      "manual_merge",
      "duplicate_entity",
      "accept_canonical_replay",
      "retain_as_practice",
      "retry_media",
      "abandon",
    ]),
  })
  .strict();

export const outboxResultStatusSchema = z.enum([
  "acknowledged",
  "duplicate",
  "applied_after_replay",
  "conflict",
  "retryable",
  "rejected",
  "unauthorized",
  "unsupported_protocol",
  "dead_letter",
]);

export const outboxOperationResultSchema = z
  .object({
    acknowledgment: acknowledgmentSchema.nullable(),
    authoritativeProjection: z.record(z.string(), z.unknown()).nullable(),
    conflict: conflictSchema.nullable(),
    failure: typedFailureSchema.nullable(),
    operationId: uuid,
    status: outboxResultStatusSchema,
  })
  .strict();

export const syncChangeSchema = z
  .object({
    changedAt: isoDateTime,
    deviceId: uuid,
    entityId: z.string().min(1).max(180),
    entityType: z.enum(["review", "review_undo", "practice_attempt", "content", "media"]),
    entityVersion: z.number().int().nonnegative().nullable(),
    sequence: z.string().regex(/^\d+$/u),
    tombstone: z.boolean(),
  })
  .strict();

export const syncRequestSchema = z
  .object({
    cursors: z.array(syncCursorSchema).max(5),
    deviceId: uuid,
    learnerProfileId: uuid,
    operations: z.array(outboxOperationSchema).max(100),
    protocolVersion: z.literal(OFFLINE_PROTOCOL_VERSION),
  })
  .strict();

export const syncResponseSchema = z
  .object({
    capabilities: z
      .object({
        maximumBatchOperations: z.number().int().positive(),
        protocolVersion: z.literal(OFFLINE_PROTOCOL_VERSION),
      })
      .strict(),
    changes: z.array(syncChangeSchema).max(1_000),
    nextCursors: z.array(syncCursorSchema).max(5),
    protocolVersion: z.literal(OFFLINE_PROTOCOL_VERSION),
    results: z.array(outboxOperationResultSchema).max(100),
    serverTime: isoDateTime,
  })
  .strict();

export const retryPolicySchema = z
  .object({
    baseDelayMs: z.number().int().min(250).max(60_000),
    jitterRatio: z.number().min(0).max(0.5),
    maximumAttempts: z.number().int().min(1).max(20),
    maximumDelayMs: z.number().int().min(1_000).max(86_400_000),
  })
  .strict();

export const deadLetterStateSchema = z
  .object({
    failure: typedFailureSchema,
    operationId: uuid,
    transitionedAt: isoDateTime,
  })
  .strict();

export const protocolMigrationSchema = z
  .object({
    fromVersion: z.number().int().positive(),
    migratedAt: isoDateTime,
    toVersion: z.number().int().positive(),
  })
  .strict();

export const cacheMetadataSchema = z
  .object({
    byteSize: z.number().int().nonnegative(),
    lastAccessedAt: isoDateTime,
    namespace: profileCacheNamespaceSchema,
    pinned: z.boolean(),
    recordKey: safeText(240),
  })
  .strict();

export const pinManifestSchema = z
  .object({
    cardCount: z.number().int().nonnegative().max(10_000),
    contentHash: sha256,
    deckId: uuid,
    deckTitle: safeText(200),
    estimatedBytes: z.number().int().nonnegative(),
    includeAudio: z.boolean(),
    includeImages: z.boolean(),
    lastSynchronizedAt: isoDateTime.nullable().optional(),
    mediaBytes: z.number().int().nonnegative(),
    pinnedAt: isoDateTime,
    status: z.enum(["preparing", "downloading", "verifying", "ready", "partial", "failed"]),
    updateAvailable: z.boolean().optional(),
    updatedAt: isoDateTime,
  })
  .strict();

export const storageEstimateSchema = z
  .object({
    availableBytes: z.number().int().nonnegative().nullable(),
    persistent: z.boolean().nullable(),
    quotaBytes: z.number().int().nonnegative().nullable(),
    usageBytes: z.number().int().nonnegative(),
  })
  .strict();

export const synchronizationStatusSchema = z
  .object({
    lastSuccessfulSyncAt: isoDateTime.nullable(),
    pendingCriticalCount: z.number().int().nonnegative(),
    state: z.enum([
      "offline",
      "saving_locally",
      "waiting_to_sync",
      "syncing",
      "synced",
      "needs_attention",
      "storage_full",
      "update_available",
    ]),
  })
  .strict();

export type ProfileCacheNamespace = z.infer<typeof profileCacheNamespaceSchema>;
export type PrivateNamespace = z.infer<typeof privateNamespaceSchema>;
export type OutboxOperation = z.infer<typeof outboxOperationSchema>;
export type OutboxOperationResult = z.infer<typeof outboxOperationResultSchema>;
export type SyncCursor = z.infer<typeof syncCursorSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type RetryPolicy = z.infer<typeof retryPolicySchema>;
export type TypedFailure = z.infer<typeof typedFailureSchema>;
export type Conflict = z.infer<typeof conflictSchema>;
export type PinManifest = z.infer<typeof pinManifestSchema>;
export type SynchronizationStatus = z.infer<typeof synchronizationStatusSchema>;
