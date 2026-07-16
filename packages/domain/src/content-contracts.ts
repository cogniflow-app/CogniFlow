import type { CardAuthoringData, CardKind } from "./card-types";
import type { CardGenerationIdentityConflict, GeneratedCardBlueprint } from "./card-generation";
import { extractRichDocumentText, sanitizeRichDocument, type RichDocument } from "./rich-document";
import type { StudyRendererContract } from "./study-renderer";
import { DomainValidationError, type ValidationIssue } from "./validation";

export type DomainId = string;
export type DeckVisibility = "private" | "unlisted" | "public";
export type DeckStatus = "active" | "archived" | "deleted";
export type DeckLicense = "all_rights_reserved" | "cc_by" | "cc_by_sa" | "cc0";
export type DeckMemberRole = "owner" | "manager" | "editor" | "viewer";

export interface VersionedResource {
  readonly id: DomainId;
  readonly version: number;
}

export interface ContentActor {
  readonly accountId: DomainId;
  readonly activeLearnerProfileId?: DomainId;
}

export interface CommandEnvelope {
  readonly actor: ContentActor;
  readonly idempotencyKey: DomainId;
}

export interface VersionedCommandEnvelope extends CommandEnvelope {
  readonly expectedVersion: number;
}

export interface NoteFieldInput {
  readonly doc: RichDocument;
  readonly plainText: string;
  readonly normalizedText?: string;
  readonly position?: number;
}

export interface NoteFieldBuildResult {
  readonly field: NoteFieldInput;
  readonly warnings: readonly ValidationIssue[];
}

/** Derives searchable values from sanitized JSON instead of trusting client derivatives. */
export function buildNoteFieldInput(
  input: unknown,
  options: { readonly position?: number; readonly includeNormalizedText?: boolean } = {},
): NoteFieldBuildResult {
  if (
    options.position !== undefined &&
    (!Number.isSafeInteger(options.position) || options.position < 0 || options.position > 10_000)
  ) {
    throw new DomainValidationError("note field", [
      {
        path: "$.position",
        code: "invalid_position",
        message: "Field position must be an integer between 0 and 10,000",
      },
    ]);
  }
  const sanitized = sanitizeRichDocument(input);
  const plainText = extractRichDocumentText(sanitized.document);
  const normalizedText = plainText
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
  return Object.freeze({
    field: Object.freeze({
      doc: sanitized.document,
      plainText,
      ...(options.includeNormalizedText === false ? {} : { normalizedText }),
      ...(options.position === undefined ? {} : { position: options.position }),
    }),
    warnings: sanitized.warnings,
  });
}

export interface AuthorizationConflict {
  readonly code: "unauthorized";
  readonly requiredPermission: "view" | "edit" | "manage" | "publish";
  readonly message: string;
}

export interface NotFoundConflict {
  readonly code: "not_found";
  readonly resourceType: "deck" | "folder" | "note" | "version" | "media";
  readonly resourceId: DomainId;
  readonly message: string;
}

export interface VersionConflict {
  readonly code: "version_conflict";
  readonly resourceType: "deck" | "folder" | "note" | "note_type";
  readonly resourceId: DomainId;
  readonly expectedVersion: number;
  readonly actualVersion: number;
  readonly canRetry: true;
  readonly message: string;
}

export interface ValidationConflict {
  readonly code: "validation_failed";
  readonly issues: readonly ValidationIssue[];
  readonly message: string;
}

export interface DuplicateConflict {
  readonly code: "duplicate";
  readonly resourceType: "deck_slug" | "folder_name" | "note_content" | "semantic_key";
  readonly conflictingId?: DomainId;
  readonly message: string;
}

export interface FolderCycleConflict {
  readonly code: "folder_cycle";
  readonly folderId: DomainId;
  readonly attemptedParentId: DomainId;
  readonly message: string;
}

export interface PublicationConflict {
  readonly code: "publication_stale";
  readonly deckId: DomainId;
  readonly draftVersion: number;
  readonly publishedVersion?: number;
  readonly message: string;
}

export interface GenerationConflict {
  readonly code: "generation_conflict";
  readonly conflicts: readonly CardGenerationIdentityConflict[];
  readonly message: string;
}

export type ContentConflict =
  | AuthorizationConflict
  | NotFoundConflict
  | VersionConflict
  | ValidationConflict
  | DuplicateConflict
  | FolderCycleConflict
  | PublicationConflict
  | GenerationConflict;

export interface MutationSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface MutationFailure {
  readonly ok: false;
  readonly conflict: ContentConflict;
}

export type MutationResult<T> = MutationSuccess<T> | MutationFailure;

export function mutationSuccess<T>(value: T): MutationSuccess<T> {
  return Object.freeze({ ok: true, value });
}

export function mutationFailure(conflict: ContentConflict): MutationFailure {
  return Object.freeze({ ok: false, conflict });
}

export function checkOptimisticVersion(input: {
  readonly resourceType: VersionConflict["resourceType"];
  readonly resourceId: DomainId;
  readonly expectedVersion: number;
  readonly actualVersion: number;
}): MutationResult<undefined> {
  if (input.expectedVersion === input.actualVersion) return mutationSuccess(undefined);
  return mutationFailure({
    code: "version_conflict",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    expectedVersion: input.expectedVersion,
    actualVersion: input.actualVersion,
    canRetry: true,
    message: "This content changed in another session. Reload or compare changes before retrying.",
  });
}

export interface FolderSummary extends VersionedResource {
  readonly name: string;
  readonly parentId?: DomainId;
  readonly deckCount: number;
  readonly updatedAt: string;
}

export interface DeckSummary extends VersionedResource {
  readonly title: string;
  readonly status: DeckStatus;
  readonly visibility: DeckVisibility;
  readonly role: DeckMemberRole;
  readonly noteCount: number;
  readonly cardCount: number;
  readonly folderId?: DomainId;
  readonly updatedAt: string;
}

export interface LibrarySnapshot {
  readonly folders: readonly FolderSummary[];
  readonly decks: readonly DeckSummary[];
}

export interface NoteMutationValue extends VersionedResource {
  readonly deckId: DomainId;
  readonly fields: Readonly<Record<string, NoteFieldInput>>;
  readonly cardData: CardAuthoringData;
  readonly generatedCards: readonly GeneratedCardBlueprint[];
  readonly contentHash: string;
}

export interface CreateFolderCommand extends CommandEnvelope {
  readonly name: string;
  readonly parentId?: DomainId;
}

export interface UpdateFolderCommand extends VersionedCommandEnvelope {
  readonly folderId: DomainId;
  readonly name?: string;
  readonly parentId?: DomainId | null;
}

export interface CreateDeckCommand extends CommandEnvelope {
  readonly title: string;
  readonly description: RichDocument;
  readonly folderId?: DomainId;
  readonly visibility: DeckVisibility;
}

export interface UpdateDeckCommand extends VersionedCommandEnvelope {
  readonly deckId: DomainId;
  readonly title?: string;
  readonly description?: RichDocument;
  readonly folderId?: DomainId | null;
  readonly visibility?: DeckVisibility;
  readonly license?: DeckLicense;
}

export interface DuplicateDeckCommand extends CommandEnvelope {
  readonly sourceDeckId: DomainId;
  readonly title: string;
  readonly folderId?: DomainId;
}

export interface UpsertNoteCommand extends CommandEnvelope {
  readonly deckId: DomainId;
  readonly noteId?: DomainId;
  readonly noteTypeCode: string;
  readonly expectedVersion?: number;
  readonly fields: Readonly<Record<string, NoteFieldInput>>;
  readonly cardPayload: CardAuthoringData;
  readonly tags: readonly string[];
}

export interface PublishDeckCommand extends VersionedCommandEnvelope {
  readonly deckId: DomainId;
  readonly visibility: "public" | "unlisted";
}

export interface RestoreDeckVersionCommand extends VersionedCommandEnvelope {
  readonly deckId: DomainId;
  readonly versionNumber: number;
}

export interface PublicCreatorProjection {
  readonly handle: string;
  readonly displayName: string;
}

export interface PublicMediaProjection {
  readonly publicId: string;
  readonly kind: "image" | "audio";
  readonly mimeType: string;
  readonly altText: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  /** Opaque route/signed-delivery reference, never a private bucket or storage path. */
  readonly deliveryRef: string;
}

export interface PublicCardProjection {
  readonly publicId: string;
  readonly ordinal: number;
  readonly kind: CardKind;
  readonly generationKey: string;
  readonly renderer: StudyRendererContract;
}

export interface PublicDeckProjection {
  readonly schemaVersion: 1;
  readonly publicId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: RichDocument;
  readonly descriptionPlain: string;
  readonly visibility: "public" | "unlisted";
  readonly noIndex: boolean;
  readonly license: DeckLicense;
  readonly creator: PublicCreatorProjection;
  readonly publishedAt: string;
  readonly publishedVersion: number;
  readonly cardCount: number;
  readonly cardTypes: readonly CardKind[];
  readonly cards: readonly PublicCardProjection[];
  readonly media: readonly PublicMediaProjection[];
}

export interface PublishedCardSource extends PublicCardProjection {
  readonly active: boolean;
  readonly contentVersion: number;
}

export interface PublishedMediaSource extends PublicMediaProjection {
  readonly published: boolean;
}

/** Input may carry private server fields; projection construction never copies them. */
export interface PublicDeckProjectionSource {
  readonly publicId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: RichDocument;
  readonly visibility: DeckVisibility;
  readonly license: DeckLicense;
  readonly creator: PublicCreatorProjection;
  readonly publishedAt?: string;
  readonly publishedVersion?: number;
  readonly cards: readonly PublishedCardSource[];
  readonly media: readonly PublishedMediaSource[];
  readonly ownerAccountId?: string;
  readonly memberAccountIds?: readonly string[];
  readonly revisions?: readonly unknown[];
  readonly draftMetadata?: unknown;
}

function unexpectedKey(
  input: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): string | undefined {
  const allowlist = new Set(allowed);
  return Object.keys(input).find((key) => !allowlist.has(key));
}

/** Audits the deliberate projection envelope without interpreting user-authored field names. */
export function auditPublicDeckProjection(
  projection: PublicDeckProjection,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
  const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u;
  const rootKey = unexpectedKey(projection as unknown as Readonly<Record<string, unknown>>, [
    "schemaVersion",
    "publicId",
    "slug",
    "title",
    "description",
    "descriptionPlain",
    "visibility",
    "noIndex",
    "license",
    "creator",
    "publishedAt",
    "publishedVersion",
    "cardCount",
    "cardTypes",
    "cards",
    "media",
  ]);
  if (rootKey) {
    issues.push({
      path: `$.${rootKey}`,
      code: "private_projection_key",
      message: "Unexpected public deck field",
    });
  }
  const creatorKey = unexpectedKey(
    projection.creator as unknown as Readonly<Record<string, unknown>>,
    ["handle", "displayName"],
  );
  if (creatorKey) {
    issues.push({
      path: `$.creator.${creatorKey}`,
      code: "private_projection_key",
      message: "Unexpected creator field",
    });
  }
  if (!identifierPattern.test(projection.publicId) || !slugPattern.test(projection.slug)) {
    issues.push({
      path: "$.publicId",
      code: "invalid_public_identity",
      message: "Public identifiers must use a bounded safe format",
    });
  }
  if (
    !projection.title.trim() ||
    projection.title.length > 200 ||
    !projection.creator.handle.trim() ||
    !projection.creator.displayName.trim()
  ) {
    issues.push({
      path: "$.title",
      code: "invalid_public_metadata",
      message: "Public title and creator attribution are required",
    });
  }
  if (
    !Number.isSafeInteger(projection.publishedVersion) ||
    projection.publishedVersion < 1 ||
    !Number.isFinite(Date.parse(projection.publishedAt))
  ) {
    issues.push({
      path: "$.publishedVersion",
      code: "invalid_publication",
      message: "Publication timestamp and version are invalid",
    });
  }
  if (projection.noIndex !== (projection.visibility === "unlisted")) {
    issues.push({
      path: "$.noIndex",
      code: "indexing_mismatch",
      message: "Unlisted decks must be noindex and public decks must be indexable",
    });
  }
  const cardIds = new Set<string>();
  const ordinals = new Set<number>();
  for (const [index, card] of projection.cards.entries()) {
    const cardKey = unexpectedKey(card as unknown as Readonly<Record<string, unknown>>, [
      "publicId",
      "ordinal",
      "kind",
      "generationKey",
      "renderer",
    ]);
    if (cardKey) {
      issues.push({
        path: `$.cards[${index}].${cardKey}`,
        code: "private_projection_key",
        message: "Unexpected public card field",
      });
    }
    if (card.kind !== card.renderer.kind || card.generationKey !== card.renderer.generationKey) {
      issues.push({
        path: `$.cards[${index}]`,
        code: "renderer_mismatch",
        message: "Card and renderer identity must match",
      });
    }
    if (
      !identifierPattern.test(card.publicId) ||
      cardIds.has(card.publicId) ||
      !Number.isSafeInteger(card.ordinal) ||
      card.ordinal < 0 ||
      ordinals.has(card.ordinal)
    ) {
      issues.push({
        path: `$.cards[${index}]`,
        code: "invalid_public_card_identity",
        message: "Public card IDs and ordinals must be valid and unique",
      });
    }
    cardIds.add(card.publicId);
    ordinals.add(card.ordinal);
  }
  const mediaIds = new Set<string>();
  for (const [index, asset] of projection.media.entries()) {
    const mediaKey = unexpectedKey(asset as unknown as Readonly<Record<string, unknown>>, [
      "publicId",
      "kind",
      "mimeType",
      "altText",
      "width",
      "height",
      "durationMs",
      "deliveryRef",
    ]);
    if (mediaKey) {
      issues.push({
        path: `$.media[${index}].${mediaKey}`,
        code: "private_projection_key",
        message: "Unexpected public media field",
      });
    }
    if (
      !/^\/(?:api\/)?media\/[A-Za-z0-9/_-]+$/u.test(asset.deliveryRef) ||
      asset.deliveryRef.includes("..")
    ) {
      issues.push({
        path: `$.media[${index}].deliveryRef`,
        code: "unsafe_delivery_ref",
        message: "Public media must use an opaque application route",
      });
    }
    if (!identifierPattern.test(asset.publicId) || mediaIds.has(asset.publicId)) {
      issues.push({
        path: `$.media[${index}].publicId`,
        code: "invalid_public_media_identity",
        message: "Public media IDs must be valid and unique",
      });
    }
    mediaIds.add(asset.publicId);
  }
  if (projection.cardCount !== projection.cards.length) {
    issues.push({
      path: "$.cardCount",
      code: "count_mismatch",
      message: "Public card count does not match the projection",
    });
  }
  return Object.freeze(issues);
}

export function projectPublicDeck(
  source: PublicDeckProjectionSource,
): MutationResult<PublicDeckProjection> {
  if (
    (source.visibility !== "public" && source.visibility !== "unlisted") ||
    !source.publishedAt ||
    source.publishedVersion === undefined
  ) {
    return mutationFailure({
      code: "not_found",
      resourceType: "deck",
      resourceId: source.publicId,
      message: "Published deck not found",
    });
  }
  const publishedVersion = source.publishedVersion;
  const sanitizedDescription = sanitizeRichDocument(source.description);
  if (sanitizedDescription.warnings.length > 0) {
    return mutationFailure({
      code: "validation_failed",
      issues: sanitizedDescription.warnings,
      message: "Published description failed rich-content validation",
    });
  }
  const cards = source.cards
    .filter((card) => card.active && card.contentVersion <= publishedVersion)
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((card): PublicCardProjection =>
      Object.freeze({
        publicId: card.publicId,
        ordinal: card.ordinal,
        kind: card.kind,
        generationKey: card.generationKey,
        renderer: card.renderer,
      }),
    );
  const media = source.media
    .filter((asset) => asset.published)
    .map((asset): PublicMediaProjection =>
      Object.freeze({
        publicId: asset.publicId,
        kind: asset.kind,
        mimeType: asset.mimeType,
        altText: asset.altText,
        ...(asset.width === undefined ? {} : { width: asset.width }),
        ...(asset.height === undefined ? {} : { height: asset.height }),
        ...(asset.durationMs === undefined ? {} : { durationMs: asset.durationMs }),
        deliveryRef: asset.deliveryRef,
      }),
    );
  const projection: PublicDeckProjection = Object.freeze({
    schemaVersion: 1,
    publicId: source.publicId,
    slug: source.slug,
    title: source.title,
    description: sanitizedDescription.document,
    descriptionPlain: extractRichDocumentText(sanitizedDescription.document),
    visibility: source.visibility,
    noIndex: source.visibility === "unlisted",
    license: source.license,
    creator: Object.freeze({
      handle: source.creator.handle,
      displayName: source.creator.displayName,
    }),
    publishedAt: source.publishedAt,
    publishedVersion: source.publishedVersion,
    cardCount: cards.length,
    cardTypes: Object.freeze([...new Set(cards.map((card) => card.kind))].sort()),
    cards: Object.freeze(cards),
    media: Object.freeze(media),
  });
  const projectionIssues = auditPublicDeckProjection(projection);
  if (projectionIssues.length > 0) {
    return mutationFailure({
      code: "validation_failed",
      issues: projectionIssues,
      message: "Public projection failed its privacy contract",
    });
  }
  return mutationSuccess(projection);
}

export interface ContentRepository {
  library(actor: ContentActor): Promise<LibrarySnapshot>;
  createFolder(command: CreateFolderCommand): Promise<MutationResult<FolderSummary>>;
  updateFolder(command: UpdateFolderCommand): Promise<MutationResult<FolderSummary>>;
  deleteFolder(
    command: VersionedCommandEnvelope & { readonly folderId: DomainId },
  ): Promise<MutationResult<VersionedResource>>;
  createDeck(command: CreateDeckCommand): Promise<MutationResult<DeckSummary>>;
  updateDeck(command: UpdateDeckCommand): Promise<MutationResult<DeckSummary>>;
  duplicateDeck(command: DuplicateDeckCommand): Promise<MutationResult<DeckSummary>>;
  archiveDeck(
    command: VersionedCommandEnvelope & { readonly deckId: DomainId },
  ): Promise<MutationResult<DeckSummary>>;
  restoreDeck(
    command: VersionedCommandEnvelope & { readonly deckId: DomainId },
  ): Promise<MutationResult<DeckSummary>>;
  deleteDeck(
    command: VersionedCommandEnvelope & { readonly deckId: DomainId },
  ): Promise<MutationResult<VersionedResource>>;
  upsertNote(command: UpsertNoteCommand): Promise<MutationResult<NoteMutationValue>>;
  deleteNote(
    command: VersionedCommandEnvelope & { readonly noteId: DomainId },
  ): Promise<MutationResult<VersionedResource>>;
  publishDeck(command: PublishDeckCommand): Promise<MutationResult<PublicDeckProjection>>;
  unpublishDeck(
    command: VersionedCommandEnvelope & { readonly deckId: DomainId },
  ): Promise<MutationResult<DeckSummary>>;
  restoreDeckVersion(command: RestoreDeckVersionCommand): Promise<MutationResult<DeckSummary>>;
  publicDeck(slug: string): Promise<MutationResult<PublicDeckProjection>>;
}
