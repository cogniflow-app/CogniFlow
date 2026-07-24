import { z } from "zod";

export const PORTABILITY_SCHEMA_VERSION = 1 as const;
export const PORTABILITY_ARCHIVE_VERSION = 1 as const;
export const PORTABILITY_PROTOCOL_VERSION = 1 as const;

export const portabilityFormatSchema = z.enum([
  "plain_text",
  "quizlet_text",
  "csv",
  "tsv",
  "lumen_json",
  "markdown_bundle",
  "anki_apkg",
  "anki_colpkg",
  "lumen_archive",
  "encrypted_lumen_archive",
  "print_html",
]);
export type PortabilityFormat = z.infer<typeof portabilityFormatSchema>;

export const portabilityJobStateSchema = z.enum([
  "uploaded",
  "inspecting",
  "awaiting_mapping",
  "ready",
  "queued",
  "running",
  "pausing",
  "paused",
  "cancelling",
  "cancelled",
  "completed",
  "completed_with_warnings",
  "failed",
  "retryable",
  "expired",
]);
export type PortabilityJobState = z.infer<typeof portabilityJobStateSchema>;

export const portabilityDirectionSchema = z.enum(["import", "export", "restore"]);
export type PortabilityDirection = z.infer<typeof portabilityDirectionSchema>;

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"
  );
}

function isBinaryMap(value: unknown): value is Map<string, Uint8Array> {
  if (Object.prototype.toString.call(value) !== "[object Map]") return false;
  try {
    const entries = value as Map<unknown, unknown>;
    if (entries.size > 100_000) return false;
    for (const [key, bytes] of entries) {
      if (typeof key !== "string" || !isUint8Array(bytes)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const uint8ArraySchema = z.custom<Uint8Array>(isUint8Array, "Expected binary bytes.");
const binaryMapSchema = z.custom<Map<string, Uint8Array>>(
  isBinaryMap,
  "Expected a map of binary files.",
);

export const scheduleImportPolicySchema = z.enum([
  "content_only",
  "preserve_compatible",
  "rebuild_from_history",
  "preserve_legacy",
]);
export type ScheduleImportPolicy = z.infer<typeof scheduleImportPolicySchema>;

export const reviewHistoryPolicySchema = z.enum(["omit", "import_trusted", "import_and_rebuild"]);
export type ReviewHistoryPolicy = z.infer<typeof reviewHistoryPolicySchema>;

export const mediaImportPolicySchema = z.enum(["omit", "copy_verified", "link_existing_hash"]);
export type MediaImportPolicy = z.infer<typeof mediaImportPolicySchema>;

export const conflictPolicySchema = z.enum([
  "abort",
  "create_independent",
  "new_namespace",
  "skip_exact",
  "update_trusted_lineage",
]);
export type ConflictPolicy = z.infer<typeof conflictPolicySchema>;

export const cancellationSchema = z
  .object({
    cancelled: z.boolean(),
    requestedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PortabilityCancellation = z.infer<typeof cancellationSchema>;

export const portabilitySourceSchema = z
  .object({
    archivePassphrase: z.string().min(12).max(1024).optional(),
    bytes: uint8ArraySchema.optional(),
    declaredMimeType: z.string().max(200).optional(),
    fileName: z.string().min(1).max(255).optional(),
    text: z.string().max(20_000_000).optional(),
  })
  .strict()
  .refine((value) => value.bytes !== undefined || value.text !== undefined, {
    message: "A text or byte source is required.",
  });
export type PortabilitySource = z.infer<typeof portabilitySourceSchema>;

export const sourceMetadataSchema = z
  .object({
    application: z.string().min(1).max(120).optional(),
    collectionVersion: z.string().min(1).max(120).optional(),
    fileName: z.string().min(1).max(255).optional(),
    format: portabilityFormatSchema,
    importedAt: z.string().datetime(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    version: z.string().min(1).max(120).optional(),
  })
  .strict();
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;

export const lineageSchema = z
  .object({
    archiveFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    externalId: z.string().min(1).max(300).optional(),
    source: sourceMetadataSchema,
    trusted: z.boolean(),
  })
  .strict();
export type PortabilityLineage = z.infer<typeof lineageSchema>;

export const temporaryIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^tmp:[A-Za-z0-9._:-]+$/u);
export type TemporaryId = z.infer<typeof temporaryIdSchema>;

export const canonicalIdMappingSchema = z
  .record(temporaryIdSchema, z.string().uuid())
  .superRefine((value, context) => {
    if (Object.keys(value).length > 1_000_000) {
      context.addIssue({ code: "custom", message: "The canonical ID map is too large." });
    }
  });
export type CanonicalIdMapping = z.infer<typeof canonicalIdMappingSchema>;

export const adapterCapabilitySchema = z
  .object({
    customFields: z.boolean(),
    folders: z.boolean(),
    media: z.boolean(),
    noteTypes: z.boolean(),
    practice: z.boolean(),
    publications: z.boolean(),
    reviewHistory: z.boolean(),
    schedules: z.boolean(),
    settings: z.boolean(),
    tags: z.boolean(),
    templates: z.boolean(),
  })
  .strict();
export type AdapterCapability = z.infer<typeof adapterCapabilitySchema>;

export const portabilityDiagnosticSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_]+$/u),
    item: z.string().max(200).optional(),
    message: z.string().min(1).max(500),
    path: z.string().max(500).optional(),
    severity: z.enum(["info", "warning", "error"]),
  })
  .strict();
export type PortabilityDiagnostic = z.infer<typeof portabilityDiagnosticSchema>;

export const portabilityLossSchema = z
  .object({
    count: z.number().int().nonnegative(),
    feature: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
    policy: z.enum(["omitted", "approximated", "reset", "unsupported"]),
  })
  .strict();
export type PortabilityLoss = z.infer<typeof portabilityLossSchema>;

export const portabilityErrorSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9_]+$/u),
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  })
  .strict();
export type PortabilitySafeError = z.infer<typeof portabilityErrorSchema>;

export const normalizedFieldSchema = z
  .object({
    key: z.string().min(1).max(80),
    language: z.string().min(2).max(35).optional(),
    name: z.string().min(1).max(120),
    value: z.string().max(1_000_000),
  })
  .strict();
export type NormalizedField = z.infer<typeof normalizedFieldSchema>;

export const normalizedTemplateSchema = z
  .object({
    answerFieldKey: z.string().min(1).max(80).optional(),
    back: z.string().max(50_000),
    css: z.string().max(20_000).optional(),
    externalId: z.string().max(200).optional(),
    front: z.string().max(50_000),
    name: z.string().min(1).max(120),
    ordinal: z.number().int().min(0).max(1000),
    templateKey: z.string().min(1).max(128),
  })
  .strict();
export type NormalizedTemplate = z.infer<typeof normalizedTemplateSchema>;

export const normalizedNoteTypeSchema = z
  .object({
    code: z.string().min(1).max(120),
    externalId: z.string().max(200).optional(),
    fieldNames: z.array(z.string().min(1).max(120)).max(200),
    name: z.string().min(1).max(180),
    templates: z.array(normalizedTemplateSchema).max(100),
  })
  .strict();
export type NormalizedNoteType = z.infer<typeof normalizedNoteTypeSchema>;

export const normalizedGeneratedCardSchema = z
  .object({
    active: z.boolean(),
    externalId: z.string().max(200).optional(),
    generationKey: z.string().min(1).max(128),
    kind: z.string().min(1).max(80),
    ordinal: z.number().int().min(0).max(10_000),
    templateKey: z.string().min(1).max(128),
  })
  .strict();
export type NormalizedGeneratedCard = z.infer<typeof normalizedGeneratedCardSchema>;

export const normalizedNoteSchema = z
  .object({
    externalId: z.string().max(200).optional(),
    fields: z.array(normalizedFieldSchema).min(1).max(200),
    generatedCards: z.array(normalizedGeneratedCardSchema).max(1000).default([]),
    lineageId: z.string().max(200).optional(),
    mediaExternalIds: z.array(z.string().min(1).max(300)).max(1000).default([]),
    modifiedAt: z.string().datetime().optional(),
    noteTypeCode: z.string().min(1).max(120),
    source: z.string().max(2000).default(""),
    tags: z.array(z.string().min(1).max(100)).max(100).default([]),
  })
  .strict();
export type NormalizedNote = z.infer<typeof normalizedNoteSchema>;

export const normalizedDeckSchema = z
  .object({
    description: z.string().max(20_000).default(""),
    externalId: z.string().max(200).optional(),
    folderPath: z.array(z.string().min(1).max(120)).max(32).default([]),
    lineageId: z.string().max(200).optional(),
    notes: z.array(normalizedNoteSchema).max(100_000),
    sourceFormat: portabilityFormatSchema,
    tags: z.array(z.string().min(1).max(100)).max(100).default([]),
    title: z.string().min(1).max(180),
  })
  .strict();
export type NormalizedDeck = z.infer<typeof normalizedDeckSchema>;

export const normalizedFolderSchema = z
  .object({
    externalId: z.string().max(200).optional(),
    name: z.string().min(1).max(120),
    parentExternalId: z.string().max(200).nullable().default(null),
    position: z.number().int().min(0).max(100_000).default(0),
  })
  .strict();

export const normalizedMediaSchema = z
  .object({
    altText: z.string().max(2000).default(""),
    byteSize: z.number().int().nonnegative().max(100_000_000),
    externalId: z.string().min(1).max(300),
    fileName: z.string().min(1).max(255),
    kind: z.enum(["audio", "image", "other"]),
    mimeType: z.string().min(1).max(200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type NormalizedMedia = z.infer<typeof normalizedMediaSchema>;

export const normalizedScheduleSchema = z
  .object({
    algorithm: z.string().min(1).max(80),
    cardExternalId: z.string().min(1).max(200),
    dueAt: z.string().datetime().nullable(),
    learnerExternalId: z.string().min(1).max(200),
    state: z.string().min(1).max(80),
    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

export const normalizedReviewSchema = z
  .object({
    cardExternalId: z.string().min(1).max(200),
    durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
    externalId: z.string().min(1).max(200),
    learnerExternalId: z.string().min(1).max(200),
    rating: z.string().min(1).max(80),
    reviewedAt: z.string().datetime(),
    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

const normalizedEvidenceSchema = z
  .object({
    cardExternalId: z.string().min(1).max(200),
    externalId: z.string().min(1).max(200),
    learnerExternalId: z.string().min(1).max(200),
    occurredAt: z.string().datetime(),
    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

export const portabilityProvenanceSchema = z
  .object({
    adapter: z.string().min(1).max(100),
    createdAt: z.string().datetime(),
    sourceFormat: portabilityFormatSchema,
    sourceName: z.string().max(255).optional(),
    sourceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict();

export const normalizedGraphSchema = z
  .object({
    decks: z.array(normalizedDeckSchema).max(10_000),
    folders: z.array(normalizedFolderSchema).max(100_000).default([]),
    loss: z.array(portabilityLossSchema).max(10_000).default([]),
    mastery: z.array(normalizedEvidenceSchema).max(1_000_000).default([]),
    media: z.array(normalizedMediaSchema).max(100_000).default([]),
    noteTypes: z.array(normalizedNoteTypeSchema).max(10_000).default([]),
    practice: z.array(normalizedEvidenceSchema).max(1_000_000).default([]),
    provenance: portabilityProvenanceSchema,
    publications: z
      .array(
        z
          .object({
            deckExternalId: z.string().min(1).max(200),
            visibility: z.enum(["public", "unlisted"]),
          })
          .strict(),
      )
      .max(10_000)
      .default([]),
    reviews: z.array(normalizedReviewSchema).max(2_000_000).default([]),
    revisions: z
      .array(
        z
          .object({
            createdAt: z.string().datetime(),
            externalId: z.string().min(1).max(200),
            resourceExternalId: z.string().min(1).max(200),
            snapshot: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(1_000_000)
      .default([]),
    deckVersions: z
      .array(
        z
          .object({
            createdAt: z.string().datetime(),
            deckExternalId: z.string().min(1).max(200),
            externalId: z.string().min(1).max(200),
            snapshot: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(1_000_000)
      .optional(),
    schedules: z.array(normalizedScheduleSchema).max(1_000_000).default([]),
    schemaVersion: z.literal(PORTABILITY_SCHEMA_VERSION),
    settings: z.record(z.string(), z.unknown()).default({}),
    sourceVersions: z.record(z.string(), z.string().max(120)).optional(),
    warnings: z.array(portabilityDiagnosticSchema).max(10_000).default([]),
  })
  .strict();
export type NormalizedGraph = z.infer<typeof normalizedGraphSchema>;

export const delimiterMappingSchema = z
  .object({
    backColumn: z.number().int().min(0).max(500),
    customFieldColumns: z
      .record(z.string().min(1).max(120), z.number().int().min(0).max(500))
      .refine((value) => Object.keys(value).length <= 100, "Too many custom field mappings")
      .optional(),
    deckColumn: z.number().int().min(0).max(500).optional(),
    delimiter: z.enum([",", "\t", ";", "|"]),
    externalIdColumn: z.number().int().min(0).max(500).optional(),
    frontColumn: z.number().int().min(0).max(500),
    hasHeader: z.boolean(),
    sourceColumn: z.number().int().min(0).max(500).optional(),
    tagsColumn: z.number().int().min(0).max(500).optional(),
  })
  .strict();
export type DelimiterMapping = z.infer<typeof delimiterMappingSchema>;

export const textMappingSchema = z
  .object({
    backLanguage: z.string().min(2).max(35).optional(),
    cardDelimiter: z.string().min(1).max(32).default("\n"),
    fieldDelimiter: z.string().min(1).max(16),
    frontBackSwapped: z.boolean().default(false),
    frontLanguage: z.string().min(2).max(35).optional(),
    hasHeader: z.boolean().default(false),
    tags: z.array(z.string().min(1).max(100)).max(100).default([]),
  })
  .strict();
export type TextMapping = z.infer<typeof textMappingSchema>;

export const duplicatePolicySchema = z.enum([
  "create",
  "merge_safe_fields",
  "skip",
  "update_content_hash",
  "update_external_id",
]);
export type DuplicatePolicy = z.infer<typeof duplicatePolicySchema>;

export const progressImportPolicySchema = z.enum(["omit", "import_if_empty", "merge_explicit"]);
export type ProgressImportPolicy = z.infer<typeof progressImportPolicySchema>;

export const importPlanSchema = z
  .object({
    adapterCode: z.string().min(1).max(100),
    archivePassphrase: z.string().min(12).max(1024).optional(),
    destinationDeckTitle: z.string().min(1).max(180).optional(),
    duplicatePolicy: duplicatePolicySchema.default("skip"),
    conflictPolicy: conflictPolicySchema.optional(),
    mapping: delimiterMappingSchema.optional(),
    mediaPolicy: mediaImportPolicySchema.optional(),
    progressPolicy: progressImportPolicySchema.default("omit"),
    reviewHistoryPolicy: reviewHistoryPolicySchema.optional(),
    schedulePolicy: scheduleImportPolicySchema.optional(),
    source: portabilitySourceSchema,
    textMapping: textMappingSchema.optional(),
  })
  .strict();
export type ImportPlan = z.infer<typeof importPlanSchema>;

export const exportRequestSchema = z
  .object({
    adapterCode: z.string().min(1).max(100),
    deckExternalIds: z.array(z.string().min(1).max(200)).max(10_000).default([]),
    format: portabilityFormatSchema,
    includeHistory: z.boolean().default(false),
    includeMedia: z.boolean().default(false),
    includeProgress: z.boolean().default(false),
    scope: z.enum(["complete_account", "owned_content", "selected_decks"]),
  })
  .strict();
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const exportPlanSchema = z
  .object({
    adapterCode: z.string().min(1).max(100),
    fileName: z.string().min(1).max(255),
    format: portabilityFormatSchema,
    graph: normalizedGraphSchema,
    includeHistory: z.boolean().default(false),
    includeMedia: z.boolean().default(false),
    includeProgress: z.boolean().default(false),
    mediaFiles: binaryMapSchema.optional(),
    unsupportedCardPolicy: z.enum(["cancel", "flatten", "map_closest", "omit"]).optional(),
  })
  .strict();
export type ExportPlan = z.infer<typeof exportPlanSchema>;

export const importProgressSchema = z
  .object({
    completedItems: z.number().int().nonnegative(),
    diagnostics: z.array(portabilityDiagnosticSchema).max(1000),
    phase: z.enum(["detect", "inspect", "map", "validate", "write", "finalize"]),
    totalItems: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ImportProgress = z.infer<typeof importProgressSchema>;

export const exportProgressSchema = z
  .object({
    completedItems: z.number().int().nonnegative(),
    diagnostics: z.array(portabilityDiagnosticSchema).max(1000),
    phase: z.enum(["inspect", "read", "serialize", "package", "encrypt", "store", "finalize"]),
    totalItems: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ExportProgress = z.infer<typeof exportProgressSchema>;

export const portabilityInspectionSchema = z
  .object({
    adapterCode: z.string().min(1).max(100),
    capabilities: adapterCapabilitySchema,
    detectionConfidence: z.number().min(0).max(1).optional(),
    detectedFormat: portabilityFormatSchema,
    diagnostics: z.array(portabilityDiagnosticSchema).max(1000),
    estimatedItems: z.number().int().nonnegative(),
    loss: z.array(portabilityLossSchema).max(1000),
    mapping: delimiterMappingSchema.optional(),
    sourceApplication: z.string().min(1).max(120).optional(),
    sourceVersion: z.string().min(1).max(120).optional(),
    sample: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .max(100),
    textMapping: textMappingSchema.optional(),
  })
  .strict();
export type PortabilityInspection = z.infer<typeof portabilityInspectionSchema>;

export const exportArtifactSchema = z
  .object({
    bytes: uint8ArraySchema,
    diagnostics: z.array(portabilityDiagnosticSchema).max(1000),
    fileName: z.string().min(1).max(255),
    format: portabilityFormatSchema,
    loss: z.array(portabilityLossSchema).max(1000),
    mimeType: z.string().min(1).max(200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type ExportArtifact = z.infer<typeof exportArtifactSchema>;

export const chunkCheckpointSchema = z
  .object({
    checkpointKey: z.string().min(1).max(200),
    ordinal: z.number().int().nonnegative(),
    payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    processedCount: z.number().int().nonnegative(),
    resultSummary: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ChunkCheckpoint = z.infer<typeof chunkCheckpointSchema>;

export const jobReceiptSchema = z
  .object({
    canonicalIdMap: canonicalIdMappingSchema,
    completedAt: z.string().datetime(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    jobId: z.string().uuid(),
    payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    result: z.enum(["cancelled", "completed", "completed_with_warnings", "failed"]),
    sourceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    warningCodes: z.array(z.string().min(1).max(80)).max(10_000),
  })
  .strict();
export type PortabilityJobReceipt = z.infer<typeof jobReceiptSchema>;

export interface ImportSink {
  isCancelled(): boolean | Promise<boolean>;
  writeGraph(graph: NormalizedGraph): Promise<Readonly<Record<string, string>>>;
}

export interface ImportAdapter {
  readonly capabilities: AdapterCapability;
  readonly code: string;
  readonly formats: readonly PortabilityFormat[];
  detect(source: PortabilitySource): Promise<number>;
  execute(plan: ImportPlan, sink: ImportSink): AsyncIterable<ImportProgress>;
  inspect(source: PortabilitySource): Promise<PortabilityInspection>;
  map(source: PortabilitySource, plan: ImportPlan): Promise<NormalizedGraph>;
}

export interface ExportAdapter {
  readonly capabilities: AdapterCapability;
  readonly code: string;
  readonly formats: readonly PortabilityFormat[];
  export(plan: ExportPlan): Promise<ExportArtifact>;
}
