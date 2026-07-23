import Dexie, { type EntityTable } from "dexie";
import { z } from "zod";

import {
  LUMEN_OFFLINE_DATABASE_NAME,
  LOCAL_SCHEMA_VERSION,
  cacheMetadataSchema,
  conflictSchema,
  conflictResolutionSchema,
  outboxOperationSchema,
  outboxOperationResultSchema,
  pinManifestSchema,
  profileCacheNamespaceSchema,
  syncChangeSchema,
  syncCursorSchema,
  type Conflict,
  type OutboxOperation,
  type OutboxOperationResult,
  type PinManifest,
  type ProfileCacheNamespace,
  type SyncCursor,
  type SyncChange,
  type RetryPolicy,
} from "./schemas";
import { namespaceKey, retryDelayMs, sealOutboxOperation, shouldDeadLetter } from "./protocol";

const storedRowSchema = z
  .object({
    id: z.string().min(1).max(240),
    namespaceKey: z.string().min(1).max(160),
    storedAt: z.iso.datetime({ offset: true }),
    value: z.unknown(),
  })
  .strict();

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export interface StoredRow {
  readonly id: string;
  readonly namespaceKey: string;
  readonly storedAt: string;
  readonly value: unknown;
}

export interface NamespaceMetadataRow {
  readonly id: string;
  readonly namespaceKey: string;
  readonly protocolVersion: number;
  readonly schemaVersion: number;
  readonly storedAt: string;
  readonly value: ProfileCacheNamespace;
}

export interface OutboxRow extends StoredRow {
  readonly entityId: string;
  readonly nextAttemptAt: string | null;
  readonly status: OutboxOperation["status"];
  readonly value: OutboxOperation;
}

export interface CursorRow extends StoredRow {
  readonly stream: SyncCursor["stream"];
  readonly value: SyncCursor;
}

export interface ConflictRow extends StoredRow {
  readonly resolvedAt: string | null;
  readonly value: Conflict;
}

export interface CacheMetadataRow extends StoredRow {
  readonly byteSize: number;
  readonly lastAccessedAt: string;
  readonly pinned: 0 | 1;
}

export interface OperationBreakdown {
  readonly content: number;
  readonly deadLetters: number;
  readonly media: number;
  readonly practice: number;
  readonly reviewUndos: number;
  readonly reviews: number;
}

export interface FailedOperationSummary {
  readonly failure: OutboxOperation["lastFailure"];
  readonly occurredAt: string;
  readonly operationId: string;
  readonly operationLabel: string;
  readonly status: OutboxOperation["status"];
}

export type ProjectionTableName =
  | "deckProjections"
  | "cardEntryProjections"
  | "studyCardProjections"
  | "scheduleProjections"
  | "mediaManifests";

export interface PinnedMediaInput {
  readonly assetId: string;
  readonly blob: Blob;
  readonly byteSize: number;
  readonly deckId: string;
  readonly kind: "audio" | "image";
  readonly mimeType: string;
  readonly sha256: string;
}

export interface PendingMediaUpload {
  readonly blob: Blob;
  readonly operation: OutboxOperation;
}

export interface SyncHistoryEntry {
  readonly acknowledgedAt: string;
  readonly mergedFields: readonly string[];
  readonly operationId: string;
  readonly status: "acknowledged" | "applied_after_replay" | "duplicate";
}

export interface PinnedDeckProjectionInput {
  readonly cards: readonly Readonly<Record<string, unknown>>[];
  readonly deck: Readonly<Record<string, unknown>>;
  readonly media: readonly PinnedMediaInput[];
  readonly notes: readonly Readonly<Record<string, unknown>>[];
  readonly pin: PinManifest;
  readonly schedules: readonly Readonly<Record<string, unknown>>[];
}

function replaceIdentifier(value: unknown, temporaryId: string, canonicalId: string): unknown {
  if (value === temporaryId) return canonicalId;
  if (Array.isArray(value))
    return value.map((item) => replaceIdentifier(item, temporaryId, canonicalId));
  const candidate = recordValue(value);
  if (!candidate) return value;
  return Object.fromEntries(
    Object.entries(candidate).map(([key, item]) => [
      key,
      replaceIdentifier(item, temporaryId, canonicalId),
    ]),
  );
}

export class LumenOfflineDatabase extends Dexie {
  namespaceMetadata!: EntityTable<NamespaceMetadataRow, "id">;
  pinnedDecks!: EntityTable<StoredRow, "id">;
  deckProjections!: EntityTable<StoredRow, "id">;
  cardEntryProjections!: EntityTable<StoredRow, "id">;
  studyCardProjections!: EntityTable<StoredRow, "id">;
  mediaManifests!: EntityTable<StoredRow, "id">;
  mediaBlobs!: EntityTable<StoredRow, "id">;
  scheduleProjections!: EntityTable<StoredRow, "id">;
  reviewOutbox!: EntityTable<OutboxRow, "id">;
  reviewUndoOutbox!: EntityTable<OutboxRow, "id">;
  practiceOutbox!: EntityTable<OutboxRow, "id">;
  contentOutbox!: EntityTable<OutboxRow, "id">;
  mediaOutbox!: EntityTable<OutboxRow, "id">;
  localSessions!: EntityTable<StoredRow, "id">;
  localSessionItems!: EntityTable<StoredRow, "id">;
  syncCursors!: EntityTable<CursorRow, "id">;
  deviceState!: EntityTable<StoredRow, "id">;
  operationReceipts!: EntityTable<StoredRow, "id">;
  conflicts!: EntityTable<ConflictRow, "id">;
  cachedCapabilities!: EntityTable<StoredRow, "id">;
  featureFlags!: EntityTable<StoredRow, "id">;
  cacheMetadata!: EntityTable<CacheMetadataRow, "id">;
  lruMetadata!: EntityTable<CacheMetadataRow, "id">;
  temporaryIdMappings!: EntityTable<StoredRow, "id">;
  workerUpdateState!: EntityTable<StoredRow, "id">;

  constructor(name: string = LUMEN_OFFLINE_DATABASE_NAME) {
    super(name);
    this.version(LOCAL_SCHEMA_VERSION).stores({
      namespaceMetadata: "&id,namespaceKey,schemaVersion,protocolVersion",
      pinnedDecks: "&id,namespaceKey,storedAt",
      deckProjections: "&id,namespaceKey,storedAt",
      cardEntryProjections: "&id,namespaceKey,storedAt",
      studyCardProjections: "&id,namespaceKey,storedAt",
      mediaManifests: "&id,namespaceKey,storedAt",
      mediaBlobs: "&id,namespaceKey,storedAt",
      scheduleProjections: "&id,namespaceKey,storedAt",
      reviewOutbox: "&id,namespaceKey,status,nextAttemptAt,entityId",
      reviewUndoOutbox: "&id,namespaceKey,status,nextAttemptAt,entityId",
      practiceOutbox: "&id,namespaceKey,status,nextAttemptAt,entityId",
      contentOutbox: "&id,namespaceKey,status,nextAttemptAt,entityId",
      mediaOutbox: "&id,namespaceKey,status,nextAttemptAt,entityId",
      localSessions: "&id,namespaceKey,storedAt",
      localSessionItems: "&id,namespaceKey,storedAt",
      syncCursors: "&id,namespaceKey,stream",
      deviceState: "&id,namespaceKey,storedAt",
      operationReceipts: "&id,namespaceKey,storedAt",
      conflicts: "&id,namespaceKey,resolvedAt",
      cachedCapabilities: "&id,namespaceKey,storedAt",
      featureFlags: "&id,namespaceKey,storedAt",
      cacheMetadata: "&id,namespaceKey,pinned,lastAccessedAt",
      lruMetadata: "&id,namespaceKey,pinned,lastAccessedAt",
      temporaryIdMappings: "&id,namespaceKey,storedAt",
      workerUpdateState: "&id,namespaceKey,storedAt",
    });
  }
}

const privateTables = [
  "pinnedDecks",
  "deckProjections",
  "cardEntryProjections",
  "studyCardProjections",
  "mediaManifests",
  "mediaBlobs",
  "scheduleProjections",
  "reviewOutbox",
  "reviewUndoOutbox",
  "practiceOutbox",
  "contentOutbox",
  "mediaOutbox",
  "localSessions",
  "localSessionItems",
  "syncCursors",
  "deviceState",
  "operationReceipts",
  "conflicts",
  "cachedCapabilities",
  "featureFlags",
  "cacheMetadata",
  "lruMetadata",
  "temporaryIdMappings",
  "workerUpdateState",
] as const;

export class OfflineRepository {
  private activeNamespace: ProfileCacheNamespace | null = null;

  constructor(readonly database = new LumenOfflineDatabase()) {}

  async open(): Promise<void> {
    await this.database.open();
    if (this.database.verno > LOCAL_SCHEMA_VERSION) {
      this.database.close();
      throw new Error("UNSUPPORTED_LOCAL_SCHEMA");
    }
  }

  activeNamespaceKey(): string | null {
    return this.activeNamespace ? namespaceKey(this.activeNamespace) : null;
  }

  async activateNamespace(input: ProfileCacheNamespace): Promise<string> {
    const namespace = profileCacheNamespaceSchema.parse(input);
    const key = namespaceKey(namespace);
    const now = new Date().toISOString();
    await this.database.namespaceMetadata.put({
      id: key,
      namespaceKey: key,
      protocolVersion: 1,
      schemaVersion: LOCAL_SCHEMA_VERSION,
      storedAt: now,
      value: namespace,
    });
    this.activeNamespace = namespace;
    return key;
  }

  deactivateNamespace(): void {
    this.activeNamespace = null;
  }

  private requirePrivateNamespace(): string {
    if (!this.activeNamespace || this.activeNamespace.kind !== "private") {
      throw new Error("PRIVATE_NAMESPACE_REQUIRED");
    }
    return namespaceKey(this.activeNamespace);
  }

  async putPin(pin: PinManifest): Promise<void> {
    const key = this.requirePrivateNamespace();
    const value = pinManifestSchema.parse(pin);
    await this.database.pinnedDecks.put({
      id: `${key}:${value.deckId}`,
      namespaceKey: key,
      storedAt: new Date().toISOString(),
      value,
    });
  }

  async putProjection(
    tableName: ProjectionTableName,
    id: string,
    value: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const key = this.requirePrivateNamespace();
    z.string().min(1).max(240).parse(id);
    z.record(z.string(), z.unknown()).parse(value);
    await this.database[tableName].put({
      id: `${key}:${id}`,
      namespaceKey: key,
      storedAt: new Date().toISOString(),
      value,
    });
  }

  async putPinnedMedia(input: PinnedMediaInput): Promise<void> {
    const value = z
      .object({
        assetId: z.uuid(),
        blob: z.instanceof(Blob),
        byteSize: z.number().int().positive().max(10_485_760),
        deckId: z.uuid(),
        kind: z.enum(["audio", "image"]),
        mimeType: z.string().min(1).max(120),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict()
      .parse(input);
    if (value.blob.size !== value.byteSize) throw new Error("MEDIA_SIZE_MISMATCH");
    const key = this.requirePrivateNamespace();
    const now = new Date().toISOString();
    const blobId = `${key}:${value.sha256}`;
    await this.database.transaction(
      "rw",
      [this.database.mediaBlobs, this.database.mediaManifests, this.database.cacheMetadata],
      async () => {
        const existing = await this.database.mediaBlobs.get(blobId);
        const existingValue = recordValue(existing?.value);
        const deckIds = new Set(
          Array.isArray(existingValue?.deckIds)
            ? existingValue.deckIds.filter((item): item is string => typeof item === "string")
            : [],
        );
        deckIds.add(value.deckId);
        await this.database.mediaBlobs.put({
          id: blobId,
          namespaceKey: key,
          storedAt: now,
          value: {
            blob: existingValue?.blob instanceof Blob ? existingValue.blob : value.blob,
            byteSize: value.byteSize,
            deckIds: [...deckIds],
            kind: value.kind,
            mimeType: value.mimeType,
            referenceCount: deckIds.size,
            sha256: value.sha256,
          },
        });
        await this.database.mediaManifests.put({
          id: `${key}:${value.deckId}:${value.assetId}`,
          namespaceKey: key,
          storedAt: now,
          value: {
            assetId: value.assetId,
            byteSize: value.byteSize,
            deckId: value.deckId,
            kind: value.kind,
            mimeType: value.mimeType,
            sha256: value.sha256,
          },
        });
        await this.database.cacheMetadata.put({
          byteSize: value.byteSize,
          id: `${key}:media:${value.sha256}`,
          lastAccessedAt: now,
          namespaceKey: key,
          pinned: 1,
          storedAt: now,
          value: {
            byteSize: value.byteSize,
            lastAccessedAt: now,
            namespace: this.activeNamespace,
            pinned: true,
            recordKey: `media:${value.sha256}`,
          },
        });
      },
    );
  }

  async replacePinnedDeck(input: PinnedDeckProjectionInput): Promise<void> {
    const key = this.requirePrivateNamespace();
    const pin = pinManifestSchema.parse(input.pin);
    const deck = z.record(z.string(), z.unknown()).parse(input.deck);
    const notes = z.array(z.record(z.string(), z.unknown())).max(10_000).parse(input.notes);
    const cards = z.array(z.record(z.string(), z.unknown())).max(10_000).parse(input.cards);
    const schedules = z.array(z.record(z.string(), z.unknown())).max(10_000).parse(input.schedules);
    const media = input.media.map((candidate) =>
      z
        .object({
          assetId: z.uuid(),
          blob: z.instanceof(Blob),
          byteSize: z.number().int().positive().max(10_485_760),
          deckId: z.literal(pin.deckId),
          kind: z.enum(["audio", "image"]),
          mimeType: z.string().min(1).max(120),
          sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        })
        .strict()
        .parse(candidate),
    );
    if (media.some((asset) => asset.blob.size !== asset.byteSize))
      throw new Error("MEDIA_SIZE_MISMATCH");
    const now = new Date().toISOString();
    await this.database.transaction(
      "rw",
      [
        this.database.pinnedDecks,
        this.database.deckProjections,
        this.database.cardEntryProjections,
        this.database.studyCardProjections,
        this.database.scheduleProjections,
        this.database.mediaManifests,
        this.database.mediaBlobs,
        this.database.cacheMetadata,
      ],
      async () => {
        const existingBlobs = await this.database.mediaBlobs
          .where("namespaceKey")
          .equals(key)
          .toArray();
        for (const row of existingBlobs) {
          const value = recordValue(row.value);
          const deckIds = Array.isArray(value?.deckIds)
            ? value.deckIds.filter((item): item is string => typeof item === "string")
            : [];
          if (!deckIds.includes(pin.deckId)) continue;
          const remaining = deckIds.filter((deckId) => deckId !== pin.deckId);
          if (remaining.length === 0) {
            await this.database.mediaBlobs.delete(row.id);
            if (typeof value?.sha256 === "string")
              await this.database.cacheMetadata.delete(`${key}:media:${value.sha256}`);
          } else {
            await this.database.mediaBlobs.put({
              ...row,
              storedAt: now,
              value: { ...value, deckIds: remaining, referenceCount: remaining.length },
            });
          }
        }
        for (const table of [
          this.database.deckProjections,
          this.database.cardEntryProjections,
          this.database.studyCardProjections,
          this.database.scheduleProjections,
          this.database.mediaManifests,
        ]) {
          await table
            .where("namespaceKey")
            .equals(key)
            .filter((row) => {
              const value = recordValue(row.value);
              return value?.deckId === pin.deckId || value?.id === pin.deckId;
            })
            .delete();
        }
        await this.database.deckProjections.put({
          id: `${key}:${pin.deckId}`,
          namespaceKey: key,
          storedAt: now,
          value: deck,
        });
        await this.database.cardEntryProjections.bulkPut(
          notes.flatMap((note) =>
            typeof note.id === "string"
              ? [
                  {
                    id: `${key}:${note.id}`,
                    namespaceKey: key,
                    storedAt: now,
                    value: { ...note, deckId: pin.deckId },
                  },
                ]
              : [],
          ),
        );
        await this.database.studyCardProjections.bulkPut(
          cards.flatMap((card) =>
            typeof card.id === "string"
              ? [
                  {
                    id: `${key}:${card.id}`,
                    namespaceKey: key,
                    storedAt: now,
                    value: { ...card, deckId: pin.deckId },
                  },
                ]
              : [],
          ),
        );
        await this.database.scheduleProjections.bulkPut(
          schedules.flatMap((schedule) =>
            typeof schedule.card_id === "string"
              ? [
                  {
                    id: `${key}:${schedule.card_id}`,
                    namespaceKey: key,
                    storedAt: now,
                    value: { ...schedule, deckId: pin.deckId },
                  },
                ]
              : [],
          ),
        );
        for (const asset of media) {
          const blobId = `${key}:${asset.sha256}`;
          const existing = await this.database.mediaBlobs.get(blobId);
          const existingValue = recordValue(existing?.value);
          const deckIds = new Set(
            Array.isArray(existingValue?.deckIds)
              ? existingValue.deckIds.filter((item): item is string => typeof item === "string")
              : [],
          );
          deckIds.add(pin.deckId);
          await this.database.mediaBlobs.put({
            id: blobId,
            namespaceKey: key,
            storedAt: now,
            value: {
              blob: existingValue?.blob instanceof Blob ? existingValue.blob : asset.blob,
              byteSize: asset.byteSize,
              deckIds: [...deckIds],
              kind: asset.kind,
              mimeType: asset.mimeType,
              referenceCount: deckIds.size,
              sha256: asset.sha256,
            },
          });
          await this.database.mediaManifests.put({
            id: `${key}:${pin.deckId}:${asset.assetId}`,
            namespaceKey: key,
            storedAt: now,
            value: {
              assetId: asset.assetId,
              byteSize: asset.byteSize,
              deckId: pin.deckId,
              kind: asset.kind,
              mimeType: asset.mimeType,
              sha256: asset.sha256,
            },
          });
          await this.database.cacheMetadata.put({
            byteSize: asset.byteSize,
            id: `${key}:media:${asset.sha256}`,
            lastAccessedAt: now,
            namespaceKey: key,
            pinned: 1,
            storedAt: now,
            value: {
              byteSize: asset.byteSize,
              lastAccessedAt: now,
              namespace: this.activeNamespace,
              pinned: true,
              recordKey: `media:${asset.sha256}`,
            },
          });
        }
        await this.database.pinnedDecks.put({
          id: `${key}:${pin.deckId}`,
          namespaceKey: key,
          storedAt: now,
          value: {
            ...pin,
            lastSynchronizedAt: now,
            status: "ready",
            updateAvailable: false,
          },
        });
      },
    );
  }

  async putPendingMedia(operation: OutboxOperation, blob: Blob): Promise<void> {
    const value = outboxOperationSchema.parse(operation);
    if (value.entityType !== "media" || value.payload.kind !== "media_mutation")
      throw new Error("MEDIA_OPERATION_REQUIRED");
    const payload = value.payload;
    if (blob.size !== payload.byteSize) throw new Error("MEDIA_SIZE_MISMATCH");
    const key = this.requirePrivateNamespace();
    if (
      key !==
      namespaceKey({
        accountId: value.accountId,
        kind: "private",
        learnerProfileId: value.learnerProfileId,
      })
    )
      throw new Error("NAMESPACE_MISMATCH");
    const now = new Date().toISOString();
    const bytes = await blob.arrayBuffer();
    await this.database.transaction(
      "rw",
      [this.database.mediaBlobs, this.database.mediaOutbox],
      async () => {
        await this.database.mediaBlobs.put({
          id: `${key}:pending:${value.id}`,
          namespaceKey: key,
          storedAt: now,
          value: {
            byteSize: blob.size,
            bytes,
            mimeType: payload.mimeType,
            operationId: value.id,
            sha256: payload.sha256,
            temporaryMediaId: payload.temporaryMediaId,
          },
        });
        await this.database.mediaOutbox.put({
          entityId: value.entityId,
          id: value.id,
          namespaceKey: key,
          nextAttemptAt: value.nextAttemptAt,
          status: value.status,
          storedAt: now,
          value,
        });
      },
    );
  }

  async pendingMediaUploads(): Promise<readonly PendingMediaUpload[]> {
    const key = this.requirePrivateNamespace();
    const rows = await this.database.mediaOutbox.where("namespaceKey").equals(key).toArray();
    const uploads: PendingMediaUpload[] = [];
    for (const row of rows) {
      const operation = outboxOperationSchema.parse(row.value);
      if (operation.payload.kind !== "media_mutation") throw new Error("MEDIA_OPERATION_REQUIRED");
      const payload = operation.payload;
      if (
        !["pending", "retryable", "syncing"].includes(operation.status) ||
        (operation.nextAttemptAt !== null && operation.nextAttemptAt > new Date().toISOString())
      )
        continue;
      const blobRow = await this.database.mediaBlobs.get(`${key}:pending:${operation.id}`);
      const blobValue = recordValue(blobRow?.value);
      const storedBytes = blobValue?.bytes as ArrayBuffer | undefined;
      const mimeType = typeof blobValue?.mimeType === "string" ? blobValue.mimeType : null;
      if (
        !storedBytes ||
        typeof storedBytes.byteLength !== "number" ||
        !mimeType ||
        storedBytes.byteLength !== payload.byteSize
      )
        throw new Error("PENDING_MEDIA_BLOB_MISSING");
      uploads.push({
        blob: new Blob([storedBytes], { type: mimeType }),
        operation,
      });
    }
    return Object.freeze(uploads);
  }

  async unresolvedMediaTemporaryIds(): Promise<ReadonlySet<string>> {
    const key = this.requirePrivateNamespace();
    const rows = await this.database.mediaOutbox.where("namespaceKey").equals(key).toArray();
    return new Set(
      rows.flatMap((row) => {
        const operation = outboxOperationSchema.parse(row.value);
        return operation.payload.kind === "media_mutation" &&
          !["acknowledged", "abandoned"].includes(operation.status)
          ? [operation.payload.temporaryMediaId]
          : [];
      }),
    );
  }

  async completePendingMediaUpload(
    operationId: string,
    canonicalMediaId: string,
    policy: RetryPolicy,
  ): Promise<void> {
    z.uuid().parse(operationId);
    z.uuid().parse(canonicalMediaId);
    const key = this.requirePrivateNamespace();
    const row = await this.database.mediaOutbox.get(operationId);
    if (!row || row.namespaceKey !== key) throw new Error("OUTBOX_OPERATION_NOT_FOUND");
    const operation = outboxOperationSchema.parse(row.value);
    if (operation.payload.kind !== "media_mutation") throw new Error("MEDIA_OPERATION_REQUIRED");
    await this.applyOperationResult(
      {
        acknowledgment: {
          acknowledgedAt: new Date().toISOString(),
          canonicalEntityId: canonicalMediaId,
          canonicalVersion: 1,
          operationId,
          receiptId: crypto.randomUUID(),
        },
        authoritativeProjection: { id: canonicalMediaId },
        conflict: null,
        failure: null,
        operationId,
        status: "acknowledged",
      },
      policy,
    );
    const temporaryMediaId = operation.payload.temporaryMediaId;
    for (const table of [this.database.contentOutbox]) {
      const contentRows = await table.where("namespaceKey").equals(key).toArray();
      for (const contentRow of contentRows) {
        const contentOperation = outboxOperationSchema.parse(contentRow.value);
        const replaced = replaceIdentifier(
          contentOperation.payload,
          temporaryMediaId,
          canonicalMediaId,
        );
        if (replaced === contentOperation.payload) continue;
        const resealed = await sealOutboxOperation({
          ...contentOperation,
          payload: outboxOperationSchema.shape.payload.parse(replaced),
        });
        await table.put({ ...contentRow, value: resealed });
      }
    }
    for (const table of [
      this.database.deckProjections,
      this.database.cardEntryProjections,
      this.database.studyCardProjections,
    ]) {
      const projections = await table.where("namespaceKey").equals(key).toArray();
      for (const projection of projections) {
        const replaced = replaceIdentifier(projection.value, temporaryMediaId, canonicalMediaId);
        if (replaced !== projection.value) await table.put({ ...projection, value: replaced });
      }
    }
    await this.database.temporaryIdMappings.put({
      id: `${key}:${temporaryMediaId}`,
      namespaceKey: key,
      storedAt: new Date().toISOString(),
      value: { canonicalId: canonicalMediaId, temporaryId: temporaryMediaId },
    });
    await this.database.mediaBlobs.delete(`${key}:pending:${operationId}`);
  }

  async removePin(deckId: string): Promise<void> {
    const key = this.requirePrivateNamespace();
    await this.database.transaction(
      "rw",
      [
        this.database.pinnedDecks,
        this.database.deckProjections,
        this.database.cardEntryProjections,
        this.database.studyCardProjections,
        this.database.scheduleProjections,
        this.database.mediaManifests,
        this.database.mediaBlobs,
        this.database.cacheMetadata,
      ],
      async () => {
        await this.database.pinnedDecks.delete(`${key}:${deckId}`);
        const mediaBlobs = await this.database.mediaBlobs
          .where("namespaceKey")
          .equals(key)
          .toArray();
        for (const row of mediaBlobs) {
          const value = recordValue(row.value);
          const deckIds = Array.isArray(value?.deckIds)
            ? value.deckIds.filter((item): item is string => typeof item === "string")
            : [];
          if (!deckIds.includes(deckId)) continue;
          const remaining = deckIds.filter((id) => id !== deckId);
          if (remaining.length === 0) {
            await this.database.mediaBlobs.delete(row.id);
            if (typeof value?.sha256 === "string")
              await this.database.cacheMetadata.delete(`${key}:media:${value.sha256}`);
          } else {
            await this.database.mediaBlobs.put({
              ...row,
              storedAt: new Date().toISOString(),
              value: { ...value, deckIds: remaining, referenceCount: remaining.length },
            });
          }
        }
        for (const table of [
          this.database.deckProjections,
          this.database.cardEntryProjections,
          this.database.studyCardProjections,
          this.database.scheduleProjections,
          this.database.mediaManifests,
        ]) {
          await table
            .where("namespaceKey")
            .equals(key)
            .filter((row) => {
              const value = recordValue(row.value);
              return value?.deckId === deckId || value?.id === deckId;
            })
            .delete();
        }
      },
    );
  }

  async listPins(): Promise<readonly PinManifest[]> {
    const key = this.requirePrivateNamespace();
    const rows = await this.database.pinnedDecks.where("namespaceKey").equals(key).toArray();
    return Object.freeze(
      rows.map((row) => pinManifestSchema.parse(storedRowSchema.parse(row).value)),
    );
  }

  async deckProjectionRows(
    tableName: ProjectionTableName,
    deckId: string,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const key = this.requirePrivateNamespace();
    z.uuid().parse(deckId);
    const rows = await this.database[tableName].where("namespaceKey").equals(key).toArray();
    return Object.freeze(
      rows.flatMap((row) => {
        const value = recordValue(storedRowSchema.parse(row).value);
        if (!value) return [];
        if (value.deckId !== deckId && value.id !== deckId) return [];
        return [Object.freeze({ ...value })];
      }),
    );
  }

  async latestPendingOperation(
    entityType: OutboxOperation["entityType"],
    entityId: string,
  ): Promise<OutboxOperation | null> {
    const key = this.requirePrivateNamespace();
    const candidates: OutboxOperation[] = [];
    for (const table of [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ]) {
      const rows = await table
        .where("namespaceKey")
        .equals(key)
        .filter(
          (row) =>
            row.entityId === entityId && ["pending", "retryable", "syncing"].includes(row.status),
        )
        .toArray();
      for (const row of rows) {
        const operation = outboxOperationSchema.parse(row.value);
        if (operation.entityType === entityType) candidates.push(operation);
      }
    }
    return (
      candidates.sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
      )[0] ?? null
    );
  }

  async enqueue(operation: OutboxOperation): Promise<void> {
    const value = outboxOperationSchema.parse(operation);
    const key = this.requirePrivateNamespace();
    if (
      key !==
      namespaceKey({
        accountId: value.accountId,
        kind: "private",
        learnerProfileId: value.learnerProfileId,
      })
    ) {
      throw new Error("NAMESPACE_MISMATCH");
    }
    const table =
      value.entityType === "review"
        ? this.database.reviewOutbox
        : value.entityType === "review_undo"
          ? this.database.reviewUndoOutbox
          : value.entityType === "practice_attempt"
            ? this.database.practiceOutbox
            : value.entityType === "content"
              ? this.database.contentOutbox
              : this.database.mediaOutbox;
    await table.put({
      entityId: value.entityId,
      id: value.id,
      namespaceKey: key,
      nextAttemptAt: value.nextAttemptAt,
      status: value.status,
      storedAt: new Date().toISOString(),
      value,
    });
  }

  async pendingOperations(limit = 100): Promise<readonly OutboxOperation[]> {
    const key = this.requirePrivateNamespace();
    const values: OutboxOperation[] = [];
    const now = new Date().toISOString();
    for (const table of [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ]) {
      const rows = await table.where("namespaceKey").equals(key).toArray();
      for (const row of rows) {
        const operation = outboxOperationSchema.parse(row.value);
        if (
          ["pending", "retryable", "syncing"].includes(operation.status) &&
          (operation.nextAttemptAt === null || operation.nextAttemptAt <= now)
        )
          values.push(operation);
      }
    }
    return Object.freeze(
      values
        .sort(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
        )
        .slice(0, Math.max(1, Math.min(100, limit))),
    );
  }

  async applyOperationResult(
    input: OutboxOperationResult,
    policy: RetryPolicy,
    now = new Date(),
  ): Promise<void> {
    const result = outboxOperationResultSchema.parse(input);
    const key = this.requirePrivateNamespace();
    for (const table of [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ]) {
      const row = await table.get(result.operationId);
      if (!row || row.namespaceKey !== key) continue;
      const operation = outboxOperationSchema.parse(row.value);
      const attemptCount = operation.attemptCount + 1;
      const retryable = result.status === "retryable" && result.failure?.retryable === true;
      const deadLetter = shouldDeadLetter(attemptCount, policy, retryable);
      const status: OutboxOperation["status"] =
        result.status === "acknowledged" ||
        result.status === "duplicate" ||
        result.status === "applied_after_replay"
          ? "acknowledged"
          : result.status === "conflict"
            ? "conflict"
            : retryable && !deadLetter
              ? "retryable"
              : result.status === "unauthorized"
                ? "rejected"
                : "dead_letter";
      const updated: OutboxOperation = {
        ...operation,
        attemptCount,
        lastFailure: result.failure,
        nextAttemptAt:
          status === "retryable"
            ? new Date(
                now.getTime() + retryDelayMs(operation.id, attemptCount, policy),
              ).toISOString()
            : null,
        status,
      };
      await table.put({ ...row, nextAttemptAt: updated.nextAttemptAt, status, value: updated });
      if (result.conflict) await this.putConflict(result.conflict);
      if (result.acknowledgment) {
        await this.database.operationReceipts.put({
          id: result.acknowledgment.receiptId,
          namespaceKey: key,
          storedAt: result.acknowledgment.acknowledgedAt,
          value: result,
        });
        if (
          result.acknowledgment.canonicalEntityId &&
          result.acknowledgment.canonicalEntityId !== operation.entityId
        ) {
          const canonicalId = result.acknowledgment.canonicalEntityId;
          await this.database.temporaryIdMappings.put({
            id: `${key}:${operation.entityId}`,
            namespaceKey: key,
            storedAt: result.acknowledgment.acknowledgedAt,
            value: {
              canonicalId,
              temporaryId: operation.entityId,
            },
          });
          const contentRows = await this.database.contentOutbox
            .where("namespaceKey")
            .equals(key)
            .toArray();
          for (const dependentRow of contentRows) {
            if (dependentRow.id === operation.id) continue;
            const dependent = outboxOperationSchema.parse(dependentRow.value);
            const replacedPayload = replaceIdentifier(
              dependent.payload,
              operation.entityId,
              canonicalId,
            );
            const replacedEntityId =
              dependent.entityId === operation.entityId ? canonicalId : dependent.entityId;
            if (
              replacedEntityId === dependent.entityId &&
              JSON.stringify(replacedPayload) === JSON.stringify(dependent.payload)
            )
              continue;
            const resealed = await sealOutboxOperation({
              ...dependent,
              entityId: replacedEntityId,
              payload: outboxOperationSchema.shape.payload.parse(replacedPayload),
            });
            await this.database.contentOutbox.put({
              ...dependentRow,
              entityId: replacedEntityId,
              value: resealed,
            });
          }
          for (const projectionTable of [
            this.database.deckProjections,
            this.database.cardEntryProjections,
            this.database.studyCardProjections,
            this.database.scheduleProjections,
          ]) {
            const projectionRows = await projectionTable
              .where("namespaceKey")
              .equals(key)
              .toArray();
            for (const projectionRow of projectionRows) {
              const replaced = replaceIdentifier(
                projectionRow.value,
                operation.entityId,
                canonicalId,
              );
              if (JSON.stringify(replaced) !== JSON.stringify(projectionRow.value))
                await projectionTable.put({ ...projectionRow, value: replaced });
            }
          }
        }
      }
      const authoritative = recordValue(result.authoritativeProjection);
      if (
        authoritative &&
        operation.payload.kind === "review" &&
        recordValue(authoritative.schedule)
      ) {
        await this.putProjection("scheduleProjections", operation.payload.cardId, {
          ...recordValue(authoritative.schedule),
          baseVersion:
            result.acknowledgment?.canonicalVersion ?? operation.payload.baseScheduleVersion,
          card_id: operation.payload.cardId,
          pendingOperationId: null,
        });
      }
      if (authoritative && operation.payload.kind === "content_mutation") {
        const canonicalId =
          result.acknowledgment?.canonicalEntityId &&
          result.acknowledgment.canonicalEntityId !== operation.entityId
            ? result.acknowledgment.canonicalEntityId
            : operation.entityId;
        const projectionTable =
          operation.payload.mutationType === "create_deck" ||
          operation.payload.mutationType === "update_deck" ||
          operation.operation.startsWith("content.deck.")
            ? this.database.deckProjections
            : this.database.cardEntryProjections;
        if (operation.payload.changes.tombstone === true) {
          await projectionTable.delete(`${key}:${operation.entityId}`);
        } else {
          await projectionTable.put({
            id: `${key}:${canonicalId}`,
            namespaceKey: key,
            storedAt: new Date().toISOString(),
            value: {
              ...authoritative,
              ...(typeof operation.payload.changes.deckId === "string"
                ? { deckId: operation.payload.changes.deckId }
                : {}),
              id: canonicalId,
              local: false,
              pendingOperationId: null,
            },
          });
          if (canonicalId !== operation.entityId)
            await projectionTable.delete(`${key}:${operation.entityId}`);
        }
      }
      return;
    }
    throw new Error("OUTBOX_OPERATION_NOT_FOUND");
  }

  async recentSyncHistory(limit = 10): Promise<readonly SyncHistoryEntry[]> {
    const key = this.requirePrivateNamespace();
    const receiptRows = await this.database.operationReceipts
      .where("namespaceKey")
      .equals(key)
      .reverse()
      .sortBy("storedAt");
    const entries: SyncHistoryEntry[] = [];
    for (const row of receiptRows.reverse()) {
      const parsed = outboxOperationResultSchema.safeParse(row.value);
      if (
        !parsed.success ||
        !parsed.data.acknowledgment ||
        !["acknowledged", "applied_after_replay", "duplicate"].includes(parsed.data.status)
      ) {
        continue;
      }
      const synchronization = recordValue(parsed.data.authoritativeProjection?.synchronization);
      const mergedFields = Array.isArray(synchronization?.mergedFields)
        ? synchronization.mergedFields
            .filter((field): field is string => typeof field === "string")
            .slice(0, 100)
        : [];
      entries.push({
        acknowledgedAt: parsed.data.acknowledgment.acknowledgedAt,
        mergedFields,
        operationId: parsed.data.operationId,
        status: parsed.data.status as SyncHistoryEntry["status"],
      });
      if (entries.length >= Math.max(1, Math.min(50, limit))) break;
    }
    return Object.freeze(entries);
  }

  async operationCounts(): Promise<{
    readonly conflicts: number;
    readonly deadLetters: number;
    readonly pending: number;
  }> {
    const breakdown = await this.operationBreakdown();
    const pending =
      breakdown.content +
      breakdown.media +
      breakdown.practice +
      breakdown.reviewUndos +
      breakdown.reviews;
    const key = this.requirePrivateNamespace();
    const conflicts = await this.database.conflicts
      .where("namespaceKey")
      .equals(key)
      .filter((row) => row.resolvedAt === null)
      .count();
    return { conflicts, deadLetters: breakdown.deadLetters, pending };
  }

  async operationBreakdown(): Promise<OperationBreakdown> {
    const key = this.requirePrivateNamespace();
    const pendingCount = async (table: EntityTable<OutboxRow, "id">) => {
      const rows = await table.where("namespaceKey").equals(key).toArray();
      return {
        deadLetters: rows.filter((row) => row.status === "dead_letter").length,
        pending: rows.filter((row) => ["pending", "retryable", "syncing"].includes(row.status))
          .length,
      };
    };
    const [reviews, reviewUndos, practice, content, media] = await Promise.all([
      pendingCount(this.database.reviewOutbox),
      pendingCount(this.database.reviewUndoOutbox),
      pendingCount(this.database.practiceOutbox),
      pendingCount(this.database.contentOutbox),
      pendingCount(this.database.mediaOutbox),
    ]);
    return {
      content: content.pending,
      deadLetters:
        reviews.deadLetters +
        reviewUndos.deadLetters +
        practice.deadLetters +
        content.deadLetters +
        media.deadLetters,
      media: media.pending,
      practice: practice.pending,
      reviewUndos: reviewUndos.pending,
      reviews: reviews.pending,
    };
  }

  async failedOperations(): Promise<readonly FailedOperationSummary[]> {
    const key = this.requirePrivateNamespace();
    const failed: FailedOperationSummary[] = [];
    for (const table of [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ]) {
      const rows = await table.where("namespaceKey").equals(key).toArray();
      for (const row of rows) {
        const operation = outboxOperationSchema.parse(row.value);
        if (!["conflict", "dead_letter", "rejected"].includes(operation.status)) continue;
        failed.push({
          failure: operation.lastFailure,
          occurredAt: operation.occurredAt,
          operationId: operation.id,
          operationLabel: operation.operation,
          status: operation.status,
        });
      }
    }
    return Object.freeze(
      failed.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    );
  }

  async retryOperation(operationId: string): Promise<void> {
    z.uuid().parse(operationId);
    const key = this.requirePrivateNamespace();
    for (const table of [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ]) {
      const row = await table.get(operationId);
      if (!row || row.namespaceKey !== key) continue;
      const operation = outboxOperationSchema.parse(row.value);
      const value = outboxOperationSchema.parse({
        ...operation,
        attemptCount: 0,
        lastFailure: null,
        nextAttemptAt: null,
        status: "pending",
      });
      await table.put({ ...row, nextAttemptAt: null, status: "pending", value });
      return;
    }
    throw new Error("OUTBOX_OPERATION_NOT_FOUND");
  }

  async abandonOperation(operationId: string): Promise<void> {
    z.uuid().parse(operationId);
    const key = this.requirePrivateNamespace();
    for (const table of [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ]) {
      const row = await table.get(operationId);
      if (!row || row.namespaceKey !== key) continue;
      const operation = outboxOperationSchema.parse(row.value);
      const value = outboxOperationSchema.parse({
        ...operation,
        nextAttemptAt: null,
        status: "abandoned",
      });
      await table.put({ ...row, nextAttemptAt: null, status: "abandoned", value });
      return;
    }
    throw new Error("OUTBOX_OPERATION_NOT_FOUND");
  }

  async putCursor(cursor: SyncCursor): Promise<void> {
    const value = syncCursorSchema.parse(cursor);
    const key = this.requirePrivateNamespace();
    await this.database.syncCursors.put({
      id: `${key}:${value.stream}`,
      namespaceKey: key,
      storedAt: new Date().toISOString(),
      stream: value.stream,
      value,
    });
  }

  async putDeviceState(id: string, value: Readonly<Record<string, unknown>>): Promise<void> {
    const key = this.requirePrivateNamespace();
    z.uuid().parse(id);
    z.record(z.string(), z.unknown()).parse(value);
    await this.database.deviceState.put({
      id: `${key}:${id}`,
      namespaceKey: key,
      storedAt: new Date().toISOString(),
      value,
    });
  }

  async listCursors(): Promise<readonly SyncCursor[]> {
    const key = this.requirePrivateNamespace();
    const rows = await this.database.syncCursors.where("namespaceKey").equals(key).toArray();
    return Object.freeze(rows.map((row) => syncCursorSchema.parse(row.value)));
  }

  async applyPulledChanges(changes: readonly SyncChange[], currentDeviceId: string): Promise<void> {
    z.uuid().parse(currentDeviceId);
    const parsed = z.array(syncChangeSchema).max(1_000).parse(changes);
    const key = this.requirePrivateNamespace();
    for (const change of parsed) {
      if (change.deviceId === currentDeviceId) continue;
      const deckIds = new Set<string>();
      if (change.entityType === "content") {
        const deck = await this.database.deckProjections.get(`${key}:${change.entityId}`);
        const cardEntry = await this.database.cardEntryProjections.get(`${key}:${change.entityId}`);
        const cardValue = recordValue(cardEntry?.value);
        if (deck) deckIds.add(change.entityId);
        if (typeof cardValue?.deckId === "string") deckIds.add(cardValue.deckId);
        if (change.tombstone) {
          await this.database.cardEntryProjections.delete(`${key}:${change.entityId}`);
          await this.database.deckProjections.delete(`${key}:${change.entityId}`);
        }
      } else if (change.entityType === "review") {
        const schedule = await this.database.scheduleProjections.get(`${key}:${change.entityId}`);
        const scheduleValue = recordValue(schedule?.value);
        if (typeof scheduleValue?.deckId === "string") deckIds.add(scheduleValue.deckId);
      }
      for (const deckId of deckIds) {
        const pinRow = await this.database.pinnedDecks.get(`${key}:${deckId}`);
        if (!pinRow) continue;
        if (change.tombstone && change.entityType === "content" && change.entityId === deckId) {
          await this.removePin(deckId);
          continue;
        }
        const pin = pinManifestSchema.parse(pinRow.value);
        await this.database.pinnedDecks.put({
          ...pinRow,
          storedAt: change.changedAt,
          value: {
            ...pin,
            lastSynchronizedAt: change.changedAt,
            updateAvailable: true,
          },
        });
      }
    }
  }

  async putConflict(conflict: Conflict): Promise<void> {
    const value = conflictSchema.parse(conflict);
    const key = this.requirePrivateNamespace();
    if (namespaceKey(value.namespace) !== key) throw new Error("NAMESPACE_MISMATCH");
    await this.database.conflicts.put({
      id: value.conflictId,
      namespaceKey: key,
      resolvedAt: value.resolvedAt,
      storedAt: new Date().toISOString(),
      value,
    });
  }

  async unresolvedConflicts(): Promise<readonly Conflict[]> {
    const key = this.requirePrivateNamespace();
    const rows = await this.database.conflicts.where("namespaceKey").equals(key).toArray();
    return Object.freeze(
      rows
        .map((row) => conflictSchema.parse(row.value))
        .filter((conflict) => conflict.resolvedAt === null),
    );
  }

  async resolveConflict(input: unknown): Promise<void> {
    const resolution = conflictResolutionSchema.parse(input);
    const key = this.requirePrivateNamespace();
    const row = await this.database.conflicts.get(resolution.conflictId);
    if (!row || row.namespaceKey !== key) throw new Error("CONFLICT_NOT_FOUND");
    const conflict = conflictSchema.parse(row.value);
    if (conflict.resolvedAt) return;
    const outboxTables = [
      this.database.reviewOutbox,
      this.database.reviewUndoOutbox,
      this.database.practiceOutbox,
      this.database.contentOutbox,
      this.database.mediaOutbox,
    ] as const;
    const operationRow = (
      await Promise.all(
        outboxTables.map(async (table) => ({ row: await table.get(conflict.operationId), table })),
      )
    ).find((candidate) => candidate.row?.namespaceKey === key);
    if (operationRow?.row) {
      const operation = outboxOperationSchema.parse(operationRow.row.value);
      if (resolution.resolution === "retry_media" && operation.entityType === "media") {
        const retry = outboxOperationSchema.parse({
          ...operation,
          attemptCount: 0,
          lastFailure: null,
          nextAttemptAt: null,
          status: "pending",
        });
        await operationRow.table.put({
          ...operationRow.row,
          nextAttemptAt: null,
          status: "pending",
          value: retry,
        });
      } else if (
        ["keep_local_revision", "manual_merge", "duplicate_entity"].includes(
          resolution.resolution,
        ) &&
        operation.payload.kind === "content_mutation"
      ) {
        const server = recordValue(conflict.serverValue);
        const merged = recordValue(resolution.mergedValue);
        const currentVersion =
          typeof server?.currentVersion === "number" &&
          Number.isSafeInteger(server.currentVersion) &&
          server.currentVersion >= 0
            ? server.currentVersion
            : operation.baseVersion;
        const duplicated = resolution.resolution === "duplicate_entity";
        const nextId = crypto.randomUUID();
        const duplicatesDeck = duplicated && conflict.entity.entityType === "deck";
        const nextEntityId = duplicated
          ? `local:${duplicatesDeck ? "deck" : "card_entry"}:${nextId}`
          : operation.entityId;
        const duplicateChanges =
          duplicatesDeck && operation.payload.baseSnapshot
            ? {
                ...operation.payload.changes,
                ...(typeof operation.payload.changes.title === "string"
                  ? {}
                  : typeof operation.payload.baseSnapshot.title === "string"
                    ? { title: operation.payload.baseSnapshot.title }
                    : {}),
                ...(typeof operation.payload.changes.descriptionText === "string"
                  ? {}
                  : typeof operation.payload.baseSnapshot.descriptionPlain === "string"
                    ? { descriptionText: operation.payload.baseSnapshot.descriptionPlain }
                    : {}),
              }
            : operation.payload.changes;
        const next = await sealOutboxOperation({
          ...operation,
          attemptCount: 0,
          baseVersion: duplicated ? null : currentVersion,
          createdAt: new Date().toISOString(),
          entityId: nextEntityId,
          id: nextId,
          idempotencyKey: crypto.randomUUID(),
          lastFailure: null,
          nextAttemptAt: null,
          operation: duplicated
            ? duplicatesDeck
              ? "content.create_deck"
              : "content.create_card_entry"
            : operation.operation,
          payload: {
            ...operation.payload,
            changes: resolution.resolution === "manual_merge" && merged ? merged : duplicateChanges,
            mutationType: duplicated
              ? duplicatesDeck
                ? "create_deck"
                : "create_card_entry"
              : operation.payload.mutationType,
            temporaryId: duplicated ? nextEntityId : operation.payload.temporaryId,
          },
          priorOperationId: null,
          status: "pending",
        });
        await this.enqueue(next);
        const abandoned = outboxOperationSchema.parse({
          ...operation,
          nextAttemptAt: null,
          status: "abandoned",
        });
        await operationRow.table.put({
          ...operationRow.row,
          nextAttemptAt: null,
          status: "abandoned",
          value: abandoned,
        });
      } else {
        const abandoned = outboxOperationSchema.parse({
          ...operation,
          nextAttemptAt: null,
          status: "abandoned",
        });
        await operationRow.table.put({
          ...operationRow.row,
          nextAttemptAt: null,
          status: "abandoned",
          value: abandoned,
        });
      }
    }
    const resolvedAt = new Date().toISOString();
    const value = conflictSchema.parse({
      ...conflict,
      localValue:
        resolution.resolution === "manual_merge" && "mergedValue" in resolution
          ? resolution.mergedValue
          : conflict.localValue,
      resolution: resolution.resolution,
      resolvedAt,
    });
    await this.database.conflicts.put({ ...row, resolvedAt, value });
  }

  async currentNamespaceUsageBytes(): Promise<number> {
    const key = this.requirePrivateNamespace();
    const [pinRows, cacheRows, mediaRows] = await Promise.all([
      this.database.pinnedDecks.where("namespaceKey").equals(key).toArray(),
      this.database.cacheMetadata.where("namespaceKey").equals(key).toArray(),
      this.database.mediaBlobs.where("namespaceKey").equals(key).toArray(),
    ]);
    const pinnedBytes = pinRows.reduce(
      (total, row) =>
        total + pinManifestSchema.parse(storedRowSchema.parse(row).value).estimatedBytes,
      0,
    );
    // A pin estimate already includes its selected media. Only add automatic,
    // non-pinned cache entries here so shared blobs are never double-counted.
    const pendingMediaBytes = mediaRows.reduce((total, row) => {
      const value = recordValue(row.value);
      return typeof value?.operationId === "string" && typeof value.byteSize === "number"
        ? total + value.byteSize
        : total;
    }, 0);
    return (
      pinnedBytes +
      pendingMediaBytes +
      cacheRows.filter((row) => row.pinned === 0).reduce((total, row) => total + row.byteSize, 0)
    );
  }

  async putCacheMetadata(input: unknown): Promise<void> {
    const value = cacheMetadataSchema.parse(input);
    const key = this.requirePrivateNamespace();
    if (namespaceKey(value.namespace) !== key) throw new Error("NAMESPACE_MISMATCH");
    await this.database.cacheMetadata.put({
      byteSize: value.byteSize,
      id: `${key}:${value.recordKey}`,
      lastAccessedAt: value.lastAccessedAt,
      namespaceKey: key,
      pinned: value.pinned ? 1 : 0,
      storedAt: new Date().toISOString(),
      value,
    });
  }

  async evictLeastRecentlyUsed(bytesNeeded: number): Promise<number> {
    const key = this.requirePrivateNamespace();
    const candidates = (
      await this.database.cacheMetadata.where("namespaceKey").equals(key).toArray()
    )
      .filter((row) => row.pinned === 0)
      .sort((left, right) => left.lastAccessedAt.localeCompare(right.lastAccessedAt));
    let freed = 0;
    for (const row of candidates) {
      if (freed >= bytesNeeded) break;
      await this.database.transaction(
        "rw",
        [this.database.cacheMetadata, this.database.lruMetadata],
        async () => {
          await this.database.cacheMetadata.delete(row.id);
          await this.database.lruMetadata.delete(row.id);
        },
      );
      freed += row.byteSize;
    }
    return freed;
  }

  async clearNamespace(namespace: ProfileCacheNamespace): Promise<void> {
    const parsed = profileCacheNamespaceSchema.parse(namespace);
    const key = namespaceKey(parsed);
    await this.database.transaction(
      "rw",
      [this.database.namespaceMetadata, ...privateTables.map((name) => this.database.table(name))],
      async () => {
        for (const name of privateTables) {
          await this.database.table(name).where("namespaceKey").equals(key).delete();
        }
        await this.database.namespaceMetadata.delete(key);
      },
    );
    if (this.activeNamespaceKey() === key) this.activeNamespace = null;
  }

  async clearAccount(accountId: string): Promise<void> {
    z.uuid().parse(accountId);
    const prefix = `private:${accountId}:`;
    const namespaces = await this.database.namespaceMetadata
      .filter((row) => row.namespaceKey.startsWith(prefix))
      .toArray();
    for (const row of namespaces) {
      await this.clearNamespace(profileCacheNamespaceSchema.parse(row.value));
    }
  }

  close(): void {
    this.activeNamespace = null;
    this.database.close();
  }
}
