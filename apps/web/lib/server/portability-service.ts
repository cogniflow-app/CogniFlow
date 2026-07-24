import "server-only";

import {
  canonicalJson,
  countGraphItems,
  decryptArchive,
  detectImportAdapter,
  getExportAdapter,
  getImportAdapter,
  normalizedGraphSchema,
  portabilitySourceSchema,
  isEncryptedArchive,
  readAnkiMediaFiles,
  readMarkdownMediaFiles,
  readLumenArchiveBundle,
  safeFileName,
  sha256Hex,
  type ExportArtifact,
  type ImportPlan,
  type NormalizedGraph,
  type NormalizedNote,
  type NormalizedNoteType,
  type PortabilityDiagnostic,
  type PortabilityInspection,
  type PortabilitySource,
} from "@lumen/import-export";
import {
  CARD_SCHEMA_VERSION,
  CURRENT_RICH_DOCUMENT_VERSION,
  sanitizeTemplateMarkup,
  type CardAuthoringData,
  type RichDocument,
} from "@lumen/domain";
import { z } from "zod";

import { customNoteTypeDefinition, serializeNote } from "@/lib/content/note-serialization";
import type { DeckDetail } from "@/lib/content/view-models";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import type { NextRouteDatabaseContext } from "@/lib/supabase/server";

const ZIP_MAGIC = new Uint8Array([0x50, 0x4b]);
const ENCRYPTED_MAGIC = new TextEncoder().encode("LUMENENC1");

const archiveProfileRestoreSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    learning_goals: z.array(z.string().trim().min(1).max(120)).max(20),
    locale: z.string().trim().min(2).max(35),
    reduced_motion: z.boolean(),
    serious_mode: z.boolean(),
    study_day_start: z.number().int().min(0).max(1439),
    theme: z.enum(["system", "light", "dark"]),
    timezone: z.string().trim().min(1).max(80),
  })
  .passthrough();

const archivePrivacyRestoreSchema = z
  .object({
    allow_product_updates: z.boolean(),
    allow_social_interactions: z.boolean(),
    default_content_private: z.boolean(),
    first_party_analytics: z.boolean(),
  })
  .passthrough();

const safeLearnerSettingsSchema = z
  .object({
    reading_style: z.enum(["standard", "increased_spacing"]).optional(),
    reduced_motion: z.boolean().optional(),
    serious_mode: z.boolean().optional(),
    studyDayStart: z.number().int().min(0).max(1439).optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .strip();

const archiveSelfLearnerRestoreSchema = z
  .object({
    avatar_seed: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/u),
    display_name: z.string().trim().min(1).max(80),
    kind: z.literal("self"),
    pseudonym: z.string().trim().min(1).max(80),
    settings: safeLearnerSettingsSchema,
  })
  .passthrough();

export const MAX_PORTABILITY_UPLOAD_BYTES = 64 * 1024 * 1024;

function ownRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array) {
  return prefix.every((value, index) => bytes[index] === value);
}

function extension(fileName: string | undefined) {
  return fileName?.split(".").at(-1)?.toLowerCase() ?? "";
}

export function detectPortabilityMime(source: PortabilitySource): string {
  if (source.bytes && hasPrefix(source.bytes, ENCRYPTED_MAGIC)) {
    return "application/octet-stream";
  }
  const suffix = extension(source.fileName);
  if (source.bytes && hasPrefix(source.bytes, ZIP_MAGIC) && suffix === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (source.bytes && hasPrefix(source.bytes, ZIP_MAGIC)) return "application/zip";
  if (suffix === "json") return "application/json";
  if (suffix === "csv") return "text/csv";
  if (suffix === "tsv") return "text/tab-separated-values";
  if (suffix === "md" || suffix === "markdown") return "text/markdown";
  return "text/plain";
}

export function assertPortabilitySource(source: PortabilitySource) {
  const parsed = portabilitySourceSchema.parse(source);
  const byteSize =
    parsed.bytes?.byteLength ?? new TextEncoder().encode(parsed.text ?? "").byteLength;
  if (byteSize > MAX_PORTABILITY_UPLOAD_BYTES) {
    throw new Error("PORTABILITY_SOURCE_TOO_LARGE");
  }
  const suffix = extension(parsed.fileName);
  if (
    parsed.bytes &&
    ["apkg", "colpkg", "lumen", "xlsx", "zip"].includes(suffix) &&
    !hasPrefix(parsed.bytes, ZIP_MAGIC) &&
    !hasPrefix(parsed.bytes, ENCRYPTED_MAGIC)
  ) {
    throw new Error("PORTABILITY_MAGIC_MISMATCH");
  }
  return { byteSize, detectedMimeType: detectPortabilityMime(parsed), source: parsed };
}

export async function inspectPortabilitySource(
  source: PortabilitySource,
  adapterCode?: string,
): Promise<PortabilityInspection> {
  const checked = assertPortabilitySource(source);
  const adapter = adapterCode
    ? getImportAdapter(adapterCode)
    : (await detectImportAdapter(checked.source))?.adapter;
  if (!adapter) throw new Error("PORTABILITY_FORMAT_UNSUPPORTED");
  return adapter.inspect(checked.source);
}

export async function mapPortabilitySource(
  source: PortabilitySource,
  input: {
    readonly adapterCode: string;
    readonly destinationDeckTitle?: string;
    readonly duplicatePolicy: ImportPlan["duplicatePolicy"];
    readonly mapping?: ImportPlan["mapping"];
    readonly progressPolicy: ImportPlan["progressPolicy"];
    readonly spreadsheetMapping?: ImportPlan["spreadsheetMapping"];
    readonly textMapping?: ImportPlan["textMapping"];
  },
) {
  const checked = assertPortabilitySource(source);
  const adapter = getImportAdapter(input.adapterCode);
  if (!adapter) throw new Error("PORTABILITY_FORMAT_UNSUPPORTED");
  return adapter.map(checked.source, {
    adapterCode: input.adapterCode,
    ...(input.destinationDeckTitle ? { destinationDeckTitle: input.destinationDeckTitle } : {}),
    duplicatePolicy: input.duplicatePolicy,
    ...(input.mapping ? { mapping: input.mapping } : {}),
    progressPolicy: input.progressPolicy,
    source: checked.source,
    ...(input.spreadsheetMapping ? { spreadsheetMapping: input.spreadsheetMapping } : {}),
    ...(input.textMapping ? { textMapping: input.textMapping } : {}),
  });
}

function richDocument(value: string): RichDocument {
  const normalized = value.normalize("NFKC").trim();
  return {
    attrs: { language: "en" },
    content: normalized
      ? [
          {
            content: [{ text: normalized, type: "text" }],
            type: "paragraph",
          },
        ]
      : [],
    schemaVersion: CURRENT_RICH_DOCUMENT_VERSION,
    type: "doc",
  };
}

function fieldKey(value: string, index: number) {
  const normalized = value
    .normalize("NFKD")
    .replaceAll(/[^\p{L}\p{N}_]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .slice(0, 60);
  return normalized || `Field_${String(index + 1)}`;
}

interface ImportedMediaAsset {
  readonly altText: string;
  readonly assetId: string;
  readonly kind: "audio" | "image";
}

function importedAuthoringData(
  note: NormalizedNote,
  mediaAssets: readonly ImportedMediaAsset[] = [],
  noteType?: NormalizedNoteType,
): CardAuthoringData {
  const front = note.fields[0]?.value ?? "";
  const back = note.fields[1]?.value ?? "";
  if (note.fields.length <= 2 && note.noteTypeCode === "basic" && mediaAssets.length === 0) {
    return {
      back: richDocument(back),
      front: richDocument(front),
      kind: "basic",
      schemaVersion: CARD_SCHEMA_VERSION,
    };
  }
  const keys = note.fields.map((field, index) => fieldKey(field.key || field.name, index));
  const uniqueKeys = keys.map((key, index) =>
    keys.indexOf(key) === index ? key : `${key}_${String(index + 1)}`,
  );
  const fields: Record<
    string,
    | RichDocument
    | {
        readonly alt: string;
        readonly assetId: string;
        readonly kind: "media";
        readonly mediaKind: "audio" | "image";
      }
  > = Object.fromEntries(
    note.fields.map((field, index) => [
      uniqueKeys[index] ?? `Field_${String(index + 1)}`,
      richDocument(field.value),
    ]),
  );
  for (const [index, media] of mediaAssets.entries()) {
    fields[`Media_${String(index + 1)}`] = {
      alt: media.altText || `Imported ${media.kind}`,
      assetId: media.assetId,
      kind: "media",
      mediaKind: media.kind,
    };
  }
  const first = uniqueKeys[0] ?? "Front";
  const second = uniqueKeys[1] ?? first;
  const mediaTemplate = mediaAssets
    .map((_, index) => `{{Media_${String(index + 1)}}}`)
    .join("<br>");
  const keyByImportedName = new Map(
    note.fields.flatMap((field, index) => {
      const key = uniqueKeys[index];
      return key
        ? [
            [field.key.normalize("NFKC"), key] as const,
            [field.name.normalize("NFKC"), key] as const,
          ]
        : [];
    }),
  );
  const normalizedTemplate = (value: string) =>
    String(sanitizeTemplateMarkup(value))
      .replaceAll(/\{\{FrontSide\}\}/giu, `{{${first}}}`)
      .replaceAll(
        /\{\{([#^/]?)(?:(?:type|cloze):)?([^{}:]+)(?::[^{}]+)?\}\}/giu,
        (_match, marker: string, importedName: string) => {
          const key = keyByImportedName.get(importedName.normalize("NFKC").trim());
          return key ? `{{${marker}${key}}}` : "";
        },
      );
  const importedTemplates = noteType?.templates.slice(0, 100).map((template, index) => {
    const semanticKey = template.templateKey
      .normalize("NFKD")
      .replaceAll(/[^A-Za-z0-9_.:-]+/gu, "-")
      .replaceAll(/^-+|-+$/gu, "")
      .slice(0, 80);
    return {
      backTemplate: normalizedTemplate(template.back),
      frontTemplate: normalizedTemplate(template.front),
      name: template.name,
      semanticKey: semanticKey || `imported-${String(index + 1)}`,
    };
  });
  return {
    fields,
    kind: "custom",
    schemaVersion: CARD_SCHEMA_VERSION,
    templates:
      importedTemplates && importedTemplates.length > 0
        ? importedTemplates
        : [
            {
              backTemplate: `{{${second}}}${mediaTemplate ? `<br>${mediaTemplate}` : ""}`,
              frontTemplate: `{{${first}}}`,
              name: "Imported card",
              semanticKey: "imported-forward",
            },
          ],
  };
}

export interface ImportWriteResult {
  readonly cardCount: number;
  readonly cardIdMap: Readonly<Record<string, string>>;
  readonly deckIds: readonly string[];
  readonly noteCount: number;
  readonly noteIdMap: Readonly<Record<string, string>>;
  readonly skippedCount: number;
  readonly updatedCount: number;
}

function mediaDetails(bytes: Uint8Array, declaredKind: "audio" | "image") {
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  if (
    declaredKind === "image" &&
    bytes.length >= 24 &&
    bytes
      .slice(0, 8)
      .every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { height: view.getUint32(20), mimeType: "image/png", width: view.getUint32(16) };
  }
  if (declaredKind === "image" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      const length = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb].includes(marker)) {
        return {
          height: ((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0),
          mimeType: "image/jpeg",
          width: ((bytes[offset + 7] ?? 0) << 8) + (bytes[offset + 8] ?? 0),
        };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (declaredKind === "image" && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    const kind = text(12, 16);
    if (kind === "VP8X" && bytes.length >= 30) {
      return {
        height: 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16),
        mimeType: "image/webp",
        width: 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16),
      };
    }
  }
  if (declaredKind === "audio") {
    if (text(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] ?? 0) >> 5 === 0b111)) {
      return { mimeType: "audio/mpeg" };
    }
    if (text(0, 4) === "OggS") return { mimeType: "audio/ogg" };
    if (text(0, 4) === "RIFF" && text(8, 12) === "WAVE") return { mimeType: "audio/wav" };
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return { mimeType: "audio/webm" };
    }
    if (text(4, 8) === "ftyp") return { mimeType: "audio/mp4" };
  }
  return null;
}

export async function registerImportedMedia(
  client: NextRouteDatabaseContext["client"],
  privileged: NextRouteDatabaseContext["client"],
  graph: NormalizedGraph,
  mediaFiles: ReadonlyMap<string, Uint8Array>,
  accountId: string,
  jobId: string,
) {
  const assets = new Map<string, ImportedMediaAsset>();
  const diagnostics: PortabilityDiagnostic[] = [];
  for (const media of graph.media) {
    if (media.kind === "other") {
      diagnostics.push({
        code: "media_omitted",
        item: media.fileName,
        message: "Only validated image and audio media can be imported.",
        severity: "warning",
      });
      continue;
    }
    const bytes = mediaFiles.get(media.sha256);
    const details = bytes ? mediaDetails(bytes, media.kind) : null;
    if (
      !bytes ||
      !details ||
      bytes.byteLength !== media.byteSize ||
      (await sha256Hex(bytes)) !== media.sha256 ||
      (media.kind === "image" &&
        (!("width" in details) ||
          !("height" in details) ||
          details.width < 1 ||
          details.height < 1 ||
          details.width > 32_768 ||
          details.height > 32_768))
    ) {
      diagnostics.push({
        code: "media_omitted",
        item: media.fileName,
        message: "The media bytes or file signature could not be verified and were omitted.",
        severity: "warning",
      });
      continue;
    }
    const idempotencyKey = await stableUuid(`${jobId}:media:${media.sha256}`);
    const registration = await client.rpc("current_register_media_asset", {
      p_alt_text: nullableRpcArgument(media.altText || `Imported ${media.kind}`),
      p_byte_size: bytes.byteLength,
      p_duration_ms: nullableRpcArgument<number>(null),
      p_height: nullableRpcArgument(
        media.kind === "image" && "height" in details ? details.height : null,
      ),
      p_idempotency_key: idempotencyKey,
      p_kind: media.kind,
      p_mime_type: details.mimeType,
      p_sha256: media.sha256,
      p_width: nullableRpcArgument(
        media.kind === "image" && "width" in details ? details.width : null,
      ),
    });
    if (registration.error || !registration.data) {
      throw new Error("PORTABILITY_MEDIA_REGISTER_FAILED");
    }
    let asset = registration.data;
    if (asset.status === "pending") {
      const upload = await privileged.storage
        .from(asset.storage_bucket)
        .upload(asset.storage_path, bytes, {
          cacheControl: "0",
          contentType: details.mimeType,
          upsert: true,
        });
      if (upload.error) throw new Error("PORTABILITY_MEDIA_UPLOAD_FAILED");
      const finalized = await privileged.rpc("admin_finalize_media_asset", {
        p_actor_account_id: accountId,
        p_detected_mime_type: details.mimeType,
        p_detected_sha256: media.sha256,
        p_idempotency_key: await stableUuid(`${jobId}:media-finalize:${media.sha256}`),
        p_magic_verified: true,
        p_media_asset_id: asset.id,
      });
      if (finalized.error || !finalized.data || finalized.data.status !== "ready") {
        throw new Error("PORTABILITY_MEDIA_FINALIZE_FAILED");
      }
      asset = finalized.data;
    }
    if (asset.status !== "ready") throw new Error("PORTABILITY_MEDIA_UNAVAILABLE");
    assets.set(media.externalId, {
      altText: media.altText || `Imported ${media.kind}`,
      assetId: asset.id,
      kind: media.kind,
    });
  }
  return { assets, diagnostics };
}

async function stableUuid(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function restoreSafeAccountSettings(
  client: NextRouteDatabaseContext["client"],
  graph: NormalizedGraph,
  accountId: string,
  jobId: string,
) {
  const diagnostics: PortabilityDiagnostic[] = [];
  const restored: string[] = [];
  const profile = archiveProfileRestoreSchema.safeParse(graph.settings.profile);
  const privacy = archivePrivacyRestoreSchema.safeParse(graph.settings.privacy);
  const learners = Array.isArray(graph.settings.learnerProfiles)
    ? graph.settings.learnerProfiles
    : [];
  const selfLearnerValue = learners.find((value) => ownRecord(value)?.kind === "self");
  const selfLearner = archiveSelfLearnerRestoreSchema.safeParse(selfLearnerValue);
  const currentProfile = await client
    .from("profiles")
    .select(
      "handle,display_name,locale,timezone,study_day_start,learning_goals,theme,reduced_motion,serious_mode",
    )
    .eq("id", accountId)
    .single();
  if (currentProfile.error || !currentProfile.data) {
    throw new Error("PORTABILITY_SETTINGS_BASELINE_UNAVAILABLE");
  }

  if (profile.success) {
    const profileResult = await client.rpc("current_update_profile", {
      p_display_name: profile.data.display_name,
      // Handles are global identity claims. Keep the destination account's handle.
      p_handle: nullableRpcArgument(currentProfile.data.handle),
      p_idempotency_key: await stableUuid(`${jobId}:restore-profile`),
      p_learning_goals: profile.data.learning_goals,
      p_locale: profile.data.locale,
      p_reading_style: selfLearner.success
        ? (selfLearner.data.settings.reading_style ?? "standard")
        : "standard",
      p_reduced_motion: profile.data.reduced_motion,
      p_serious_mode: profile.data.serious_mode,
      p_study_day_start: profile.data.study_day_start,
      p_theme: profile.data.theme,
      p_timezone: profile.data.timezone,
    });
    if (profileResult.error) throw new Error("PORTABILITY_PROFILE_RESTORE_FAILED");
    restored.push("profile");
    diagnostics.push({
      code: "identity_claims_preserved",
      message:
        "The destination account handle and authentication identity were preserved rather than restored.",
      severity: "warning",
    });
  } else if (graph.settings.profile !== undefined) {
    diagnostics.push({
      code: "profile_settings_invalid",
      message: "Profile settings did not match the supported archive schema and were skipped.",
      severity: "warning",
    });
  }

  if (privacy.success) {
    const privacyResult = await client.rpc("current_update_privacy_preferences", {
      p_allow_product_updates: privacy.data.allow_product_updates,
      p_allow_social_interactions: privacy.data.allow_social_interactions,
      p_default_content_private: privacy.data.default_content_private,
      p_first_party_analytics: privacy.data.first_party_analytics,
      p_idempotency_key: await stableUuid(`${jobId}:restore-privacy`),
    });
    if (privacyResult.error) throw new Error("PORTABILITY_PRIVACY_RESTORE_FAILED");
    restored.push("privacy");
  } else if (graph.settings.privacy !== undefined) {
    diagnostics.push({
      code: "privacy_settings_invalid",
      message: "Privacy preferences did not match the supported archive schema and were skipped.",
      severity: "warning",
    });
  }

  if (!selfLearner.success && selfLearnerValue !== undefined) {
    diagnostics.push({
      code: "learner_settings_invalid",
      message: "Self-learner preferences did not match the supported schema and were skipped.",
      severity: "warning",
    });
  }

  if (
    [
      "consent",
      "devices",
      "guardianRelationships",
      "learnerAccess",
      "safeManagedSessionMetadata",
    ].some((key) => graph.settings[key] !== undefined)
  ) {
    diagnostics.push({
      code: "security_relationships_not_restored",
      message:
        "Credentials, sessions, consent claims, device registrations, and access relationships were intentionally not restored.",
      severity: "warning",
    });
  }
  const unsupportedSections = [
    "acceptedAnswerRules",
    "answerOverrides",
    "auditEvents",
    "cardPublications",
    "examPlans",
    "guideProgress",
    "learningGoals",
    "personalBests",
    "safeOfflineMetadata",
    "srsPresets",
    "studySessions",
    "testDefinitions",
  ].filter((key) => graph.settings[key] !== undefined);
  if (graph.revisions.length > 0) unsupportedSections.push("contentRevisions");
  if ((graph.deckVersions?.length ?? 0) > 0) unsupportedSections.push("deckVersions");
  if (graph.publications.length > 0) unsupportedSections.push("publications");
  if (unsupportedSections.length > 0) {
    diagnostics.push({
      code: "unsupported_sections_not_restored",
      item: unsupportedSections.join(", "),
      message:
        "These sections remain safely preserved in the archive but are not replayed into a different account.",
      severity: "warning",
    });
  }
  return { diagnostics, restored };
}

async function importedContentHash(
  serialized: ReturnType<typeof serializeNote>,
  sourceReference: string,
) {
  return sha256Hex(
    new TextEncoder().encode(
      canonicalJson({
        cardPayload: serialized.transport.authoringData,
        fields: serialized.fields,
        sourceReference: sourceReference || null,
        sourceReferences: [],
      }),
    ),
  );
}

export async function createImportedFolders(
  client: NextRouteDatabaseContext["client"],
  graphInput: NormalizedGraph,
  jobId: string,
) {
  const graph = normalizedGraphSchema.parse(graphInput);
  const folderIdByExternal = new Map<string, string>();
  const folderIdByPath = new Map<string, string>();
  const folderPathByExternal = new Map<string, string>();
  const remaining = [...graph.folders];
  while (remaining.length > 0) {
    let createdInPass = 0;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const folder = remaining[index];
      if (!folder) continue;
      const parentId = folder.parentExternalId
        ? folderIdByExternal.get(folder.parentExternalId)
        : null;
      if (folder.parentExternalId && !parentId) continue;
      const created = await client.rpc("current_create_folder", {
        p_idempotency_key: await stableUuid(
          `${jobId}:folder:${folder.externalId ?? `${folder.name}:${String(folder.position)}`}`,
        ),
        p_name: folder.name,
        p_parent_id: nullableRpcArgument<string>(parentId ?? null),
      });
      if (created.error || !created.data) throw new Error("PORTABILITY_FOLDER_WRITE_FAILED");
      const parentPath = folder.parentExternalId
        ? folderPathByExternal.get(folder.parentExternalId)
        : undefined;
      const pathKey = parentPath ? `${parentPath}\u001f${folder.name}` : folder.name;
      folderIdByPath.set(pathKey, created.data.id);
      if (folder.externalId) {
        folderIdByExternal.set(folder.externalId, created.data.id);
        folderPathByExternal.set(folder.externalId, pathKey);
      }
      remaining.splice(index, 1);
      createdInPass += 1;
    }
    if (createdInPass === 0) {
      throw new Error("PORTABILITY_FOLDER_GRAPH_INVALID");
    }
  }

  for (const deck of graph.decks) {
    let parentId: string | null = null;
    const path: string[] = [];
    for (const [index, part] of deck.folderPath.entries()) {
      path.push(part);
      const pathKey = path.join("\u001f");
      const existing = folderIdByPath.get(pathKey);
      if (existing) {
        parentId = existing;
        continue;
      }
      const folderResult: {
        readonly data: { readonly id: string } | null;
        readonly error: { readonly message: string } | null;
      } = await client.rpc("current_create_folder", {
        p_idempotency_key: await stableUuid(`${jobId}:folder-path:${pathKey}`),
        p_name: part,
        p_parent_id: nullableRpcArgument<string>(parentId),
      });
      if (folderResult.error || !folderResult.data) {
        throw new Error("PORTABILITY_FOLDER_WRITE_FAILED");
      }
      const createdFolderId: string = folderResult.data.id;
      folderIdByPath.set(pathKey, createdFolderId);
      parentId = createdFolderId;
      if (index === deck.folderPath.length - 1) {
        folderIdByPath.set(deck.folderPath.join("\u001f"), createdFolderId);
      }
    }
  }
  return folderIdByPath;
}

export async function writeImportedGraph(
  client: NextRouteDatabaseContext["client"],
  graphInput: NormalizedGraph,
  isCancelled: () => Promise<boolean>,
  options: {
    readonly destinationDeckId?: string;
    readonly duplicatePolicy: ImportPlan["duplicatePolicy"];
    readonly folderIdsByPath?: ReadonlyMap<string, string>;
    readonly jobId: string;
    readonly mediaAssets?: ReadonlyMap<string, ImportedMediaAsset>;
    readonly recordItem?: (item: {
      readonly canonicalId: string | null;
      readonly fingerprint: string;
      readonly itemKey: string;
      readonly result: "created" | "failed" | "skipped" | "updated";
    }) => Promise<void>;
  },
): Promise<ImportWriteResult> {
  const graph = normalizedGraphSchema.parse(graphInput);
  const noteTypeByCode = new Map(graph.noteTypes.map((noteType) => [noteType.code, noteType]));
  const deckIds: string[] = [];
  const cardIdMap: Record<string, string> = {};
  const noteIdMap: Record<string, string> = {};
  let noteCount = 0;
  let cardCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  for (const [deckIndex, deck] of graph.decks.entries()) {
    if (await isCancelled()) throw new Error("PORTABILITY_CANCELLED");
    let deckId: string;
    if (deckIndex === 0 && options.destinationDeckId && graph.decks.length === 1) {
      const existingDeck = await client
        .from("decks")
        .select("id")
        .eq("id", options.destinationDeckId)
        .eq("status", "active")
        .single();
      if (existingDeck.error || !existingDeck.data) {
        throw new Error("PORTABILITY_DESTINATION_UNAVAILABLE");
      }
      deckId = existingDeck.data.id;
    } else {
      const deckFingerprint = await sha256Hex(
        new TextEncoder().encode(
          canonicalJson({
            description: deck.description,
            externalId: deck.externalId ?? null,
            folderPath: deck.folderPath,
            title: deck.title,
          }),
        ),
      );
      const { data: createdDeck, error: deckError } = await client.rpc("current_create_deck", {
        p_description_doc: toDatabaseJson({
          ...richDocument(deck.description),
          plainText: deck.description,
        }),
        p_folder_id: nullableRpcArgument(
          options.folderIdsByPath?.get(deck.folderPath.join("\u001f")) ?? null,
        ),
        p_idempotency_key: await stableUuid(
          `${options.jobId}:deck:${String(deckIndex)}:${deckFingerprint}`,
        ),
        p_title: deck.title,
        p_visibility: "private",
      });
      if (deckError || !createdDeck) throw new Error("PORTABILITY_DECK_WRITE_FAILED");
      deckId = createdDeck.id;
      await options.recordItem?.({
        canonicalId: deckId,
        fingerprint: deckFingerprint,
        itemKey: `deck:${deck.externalId ?? String(deckIndex)}`,
        result: "created",
      });
    }
    deckIds.push(deckId);
    const existingNotesResult = await client
      .from("notes")
      .select("id,content_hash,source_reference,version")
      .eq("deck_id", deckId)
      .is("deleted_at", null);
    if (existingNotesResult.error) throw new Error("PORTABILITY_DUPLICATE_CHECK_FAILED");
    const existingNotes = [...(existingNotesResult.data ?? [])];

    for (const [noteIndex, note] of deck.notes.entries()) {
      if (await isCancelled()) throw new Error("PORTABILITY_CANCELLED");
      const mediaAssets = note.mediaExternalIds.flatMap((externalId) => {
        const media = options.mediaAssets?.get(externalId);
        return media ? [media] : [];
      });
      const authoringData = importedAuthoringData(
        note,
        mediaAssets,
        noteTypeByCode.get(note.noteTypeCode),
      );
      const source = [
        note.source,
        `Imported via ${graph.provenance.adapter}`,
        note.externalId ? `source-id:${note.externalId}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 2_000);
      const serialized = serializeNote(authoringData, source);
      const customDefinition =
        authoringData.kind === "custom" ? customNoteTypeDefinition(authoringData) : null;
      const fingerprint = await importedContentHash(serialized, source);
      const exact = existingNotes.find((existing) => existing.content_hash === fingerprint);
      const externalMatch = note.externalId
        ? existingNotes.find((existing) =>
            (existing.source_reference ?? "").split(" · ").includes(`source-id:${note.externalId}`),
          )
        : undefined;
      if (options.duplicatePolicy === "skip" && exact) {
        skippedCount += 1;
        if (note.externalId) noteIdMap[note.externalId] = exact.id;
        const existingCardsResult = await client
          .from("cards")
          .select("id,generation_key,ordinal")
          .eq("note_id", exact.id)
          .is("deleted_at", null);
        if (existingCardsResult.error) throw new Error("PORTABILITY_CARD_MAP_FAILED");
        for (const generated of note.generatedCards) {
          if (!generated.externalId) continue;
          const existingCard = (existingCardsResult.data ?? []).find(
            (card) =>
              card.generation_key === generated.generationKey || card.ordinal === generated.ordinal,
          );
          if (!existingCard) continue;
          cardIdMap[generated.externalId] = existingCard.id;
          await options.recordItem?.({
            canonicalId: existingCard.id,
            fingerprint: await sha256Hex(
              new TextEncoder().encode(
                canonicalJson({
                  externalId: generated.externalId,
                  generationKey: generated.generationKey,
                  noteFingerprint: fingerprint,
                }),
              ),
            ),
            itemKey: `card:${generated.externalId}`,
            result: "skipped",
          });
        }
        await options.recordItem?.({
          canonicalId: exact.id,
          fingerprint,
          itemKey: `note:${note.externalId ?? `${String(deckIndex)}:${String(noteIndex)}`}`,
          result: "skipped",
        });
        continue;
      }
      const updateTarget =
        options.duplicatePolicy === "update_external_id"
          ? externalMatch
          : options.duplicatePolicy === "update_content_hash" ||
              options.duplicatePolicy === "merge_safe_fields"
            ? exact
            : undefined;
      const idempotencyKey = await stableUuid(
        `${options.jobId}:note:${note.externalId ?? `${String(deckIndex)}:${String(noteIndex)}`}:${fingerprint}`,
      );
      const { data, error } = await client.rpc("current_upsert_note_definition_with_media", {
        p_card_payload: toDatabaseJson(serialized.transport),
        p_custom_note_type_definition: customDefinition
          ? toDatabaseJson(customDefinition)
          : nullableRpcArgument(null),
        p_deck_id: deckId,
        p_expected_version: updateTarget?.version ?? 0,
        p_fields: toDatabaseJson(serialized.fields),
        p_idempotency_key: idempotencyKey,
        p_media_links: toDatabaseJson(
          mediaAssets.map((media, position) => ({
            altText: media.altText,
            assetId: media.assetId,
            position,
            purpose: "prompt",
          })),
        ),
        p_note_id: nullableRpcArgument<string>(updateTarget?.id ?? null),
        p_note_type_code: serialized.noteTypeCode,
        p_tags: note.tags,
      });
      if (error || !data) throw new Error("PORTABILITY_NOTE_WRITE_FAILED");
      const response =
        typeof data === "object" && data !== null && !Array.isArray(data)
          ? (data as Readonly<Record<string, unknown>>)
          : {};
      const responseNote =
        typeof response.note === "object" && response.note !== null && !Array.isArray(response.note)
          ? (response.note as Readonly<Record<string, unknown>>)
          : {};
      const canonicalNoteId =
        typeof responseNote.id === "string" ? responseNote.id : updateTarget?.id;
      if (!canonicalNoteId) throw new Error("PORTABILITY_NOTE_ID_UNAVAILABLE");
      if (note.externalId) noteIdMap[note.externalId] = canonicalNoteId;
      const responseCards = Array.isArray(response.cards)
        ? response.cards.flatMap((value) =>
            typeof value === "object" && value !== null && !Array.isArray(value)
              ? [value as Readonly<Record<string, unknown>>]
              : [],
          )
        : [];
      for (const generated of note.generatedCards) {
        if (!generated.externalId) continue;
        const matched = responseCards.find(
          (card) =>
            card.generationKey === generated.generationKey ||
            card.generation_key === generated.generationKey ||
            card.ordinal === generated.ordinal,
        );
        const canonicalCardId = matched?.id;
        if (typeof canonicalCardId === "string") {
          cardIdMap[generated.externalId] = canonicalCardId;
          await options.recordItem?.({
            canonicalId: canonicalCardId,
            fingerprint: await sha256Hex(
              new TextEncoder().encode(
                canonicalJson({
                  externalId: generated.externalId,
                  generationKey: generated.generationKey,
                  noteFingerprint: fingerprint,
                }),
              ),
            ),
            itemKey: `card:${generated.externalId}`,
            result: updateTarget ? "updated" : "created",
          });
        }
      }
      noteCount += 1;
      cardCount += responseCards.length || 1;
      if (updateTarget) updatedCount += 1;
      existingNotes.push({
        content_hash: fingerprint,
        id: canonicalNoteId,
        source_reference: source,
        version: updateTarget ? updateTarget.version + 1 : 1,
      });
      await options.recordItem?.({
        canonicalId: canonicalNoteId,
        fingerprint,
        itemKey: `note:${note.externalId ?? `${String(deckIndex)}:${String(noteIndex)}`}`,
        result: updateTarget ? "updated" : "created",
      });
    }
  }
  return {
    cardCount,
    cardIdMap,
    deckIds,
    noteCount,
    noteIdMap,
    skippedCount,
    updatedCount,
  };
}

function normalizedFields(detail: DeckDetail["notes"][number]) {
  const serialized = serializeNote(detail.authoringData, detail.source);
  return Object.entries(serialized.fields).map(([key, value]) => ({
    key,
    name: key,
    value: value.plainText,
  }));
}

function utcTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("PORTABILITY_TIMESTAMP_INVALID");
  return timestamp.toISOString();
}

export function graphFromDecks(
  decks: readonly DeckDetail[],
  options: {
    readonly adapter: string;
    readonly sourceFormat: NormalizedGraph["provenance"]["sourceFormat"];
  },
): NormalizedGraph {
  const graph: NormalizedGraph = {
    decks: decks.map((deck) => ({
      description: deck.descriptionPlain,
      externalId: deck.id,
      folderPath: [],
      lineageId: `lumen:${deck.id}`,
      notes: deck.notes.map((note) => ({
        externalId: note.id,
        fields: normalizedFields(note),
        generatedCards: deck.cards
          .filter((card) => card.noteId === note.id)
          .map((card) => ({
            active: card.active,
            externalId: card.id,
            generationKey: card.generationKey,
            kind: card.cardType,
            ordinal: card.ordinal,
            templateKey: card.generationKey,
          })),
        lineageId: `lumen:${note.id}`,
        mediaExternalIds: [],
        modifiedAt: utcTimestamp(note.updatedAt),
        noteTypeCode: note.cardType,
        source: note.source,
        tags: [...note.tags],
      })),
      sourceFormat: options.sourceFormat,
      tags: [],
      title: deck.title,
    })),
    folders: [],
    loss: [],
    mastery: [],
    media: [],
    noteTypes: [],
    practice: [],
    provenance: {
      adapter: options.adapter,
      createdAt: new Date().toISOString(),
      sourceFormat: options.sourceFormat,
    },
    publications: [],
    reviews: [],
    revisions: decks.flatMap((deck) =>
      deck.versions.map((version) => ({
        createdAt: utcTimestamp(version.createdAt),
        externalId: version.id,
        resourceExternalId: deck.id,
        snapshot: {
          changeKind: version.changeKind,
          deckVersion: version.deckVersion,
          summary: version.summary,
        },
      })),
    ),
    schedules: [],
    schemaVersion: 1,
    settings: {},
    warnings: [],
  };
  return normalizedGraphSchema.parse(graph);
}

export async function exportPortabilityGraph(
  graph: NormalizedGraph,
  input: {
    readonly adapterCode: string;
    readonly fileName: string;
    readonly format: Parameters<
      NonNullable<ReturnType<typeof getExportAdapter>>["export"]
    >[0]["format"];
    readonly includeHistory: boolean;
    readonly includeMedia: boolean;
    readonly includeProgress: boolean;
    readonly mediaFiles?: ReadonlyMap<string, Uint8Array>;
    readonly unsupportedCardPolicy?: "cancel" | "flatten" | "map_closest" | "omit";
  },
): Promise<ExportArtifact> {
  const adapter = getExportAdapter(input.adapterCode);
  if (!adapter) throw new Error("PORTABILITY_FORMAT_UNSUPPORTED");
  return adapter.export({
    adapterCode: input.adapterCode,
    fileName: safeFileName(input.fileName),
    format: input.format,
    graph,
    includeHistory: input.includeHistory,
    includeMedia: input.includeMedia,
    includeProgress: input.includeProgress,
    ...(input.mediaFiles ? { mediaFiles: new Map(input.mediaFiles) } : {}),
    ...(input.unsupportedCardPolicy ? { unsupportedCardPolicy: input.unsupportedCardPolicy } : {}),
  });
}

export async function mediaFilesForPortabilitySource(
  adapterCode: string,
  source: PortabilitySource,
) {
  if (adapterCode === "anki_package") return readAnkiMediaFiles(source);
  if (adapterCode === "markdown_bundle") return readMarkdownMediaFiles(source);
  if (adapterCode === "lumen_archive" && source.bytes) {
    const bytes = isEncryptedArchive(source.bytes)
      ? await decryptArchive(source.bytes, source.archivePassphrase ?? "")
      : source.bytes;
    return (await readLumenArchiveBundle(bytes)).mediaFiles;
  }
  return new Map<string, Uint8Array>();
}

export function sourceBytes(source: PortabilitySource): Uint8Array {
  if (source.bytes) return source.bytes;
  return new TextEncoder().encode(source.text ?? "");
}

export async function sourceFingerprint(source: PortabilitySource) {
  return sha256Hex(sourceBytes(source));
}

export function graphItemCount(graph: NormalizedGraph) {
  return countGraphItems(graph);
}
