import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LumenOfflineDatabase,
  OfflineRepository,
  sealOutboxOperation,
  type OutboxOperation,
  type PrivateNamespace,
} from "../src";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profileA = "22222222-2222-4222-8222-222222222222";
const profileB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deviceId = "33333333-3333-4333-8333-333333333333";
let databaseName = "";
let repository: OfflineRepository;

function namespace(accountId = accountA, learnerProfileId = profileA): PrivateNamespace {
  return { accountId, kind: "private", learnerProfileId };
}

async function reviewOperation(
  accountId = accountA,
  learnerProfileId = profileA,
): Promise<OutboxOperation> {
  return sealOutboxOperation({
    accountId,
    attemptCount: 0,
    baseVersion: 0,
    createdAt: "2026-07-23T12:00:00.000Z",
    entityId: "55555555-5555-4555-8555-555555555555",
    entityType: "review",
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    lastFailure: null,
    learnerProfileId,
    nextAttemptAt: null,
    occurredAt: "2026-07-23T12:00:00.000Z",
    operation: "apply_review",
    payload: {
      baseScheduleVersion: 0,
      beforeSchedule: { state: "new" },
      cardId: "55555555-5555-4555-8555-555555555555",
      durationMs: 100,
      kind: "review",
      priorReviewOperationId: null,
      rating: "again",
      reviewId: crypto.randomUUID(),
      reviewedAt: "2026-07-23T12:00:00.000Z",
      source: "today",
      studyDayStart: 240,
      studySessionId: "66666666-6666-4666-8666-666666666666",
      timezone: "America/Chicago",
    },
    priorOperationId: null,
    protocolVersion: 1,
    registeredDeviceId: deviceId,
    status: "pending",
  });
}

async function contentOperation(
  entityId = "77777777-7777-4777-8777-777777777777",
): Promise<OutboxOperation> {
  return sealOutboxOperation({
    accountId: accountA,
    attemptCount: 0,
    baseVersion: 2,
    createdAt: "2026-07-23T12:00:00.000Z",
    entityId,
    entityType: "content",
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    lastFailure: null,
    learnerProfileId: profileA,
    nextAttemptAt: null,
    occurredAt: "2026-07-23T12:00:00.000Z",
    operation: "content.update_card_entry",
    payload: {
      baseSnapshot: { title: "Server" },
      changes: {
        authoringData: {
          imageAssetId: "99999999-9999-4999-8999-999999999999",
          kind: "image_occlusion",
        },
        deckId: "88888888-8888-4888-8888-888888888888",
        expectedVersion: 2,
        noteId: entityId,
        source: "",
        tags: ["offline"],
      },
      kind: "content_mutation",
      mutationType: "update_card_entry",
      temporaryId: null,
    },
    priorOperationId: null,
    protocolVersion: 1,
    registeredDeviceId: deviceId,
    status: "pending",
  });
}

async function deckOperation(): Promise<OutboxOperation> {
  return sealOutboxOperation({
    accountId: accountA,
    attemptCount: 0,
    baseVersion: 4,
    createdAt: "2026-07-23T12:00:00.000Z",
    entityId: "88888888-8888-4888-8888-888888888888",
    entityType: "content",
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    lastFailure: null,
    learnerProfileId: profileA,
    nextAttemptAt: null,
    occurredAt: "2026-07-23T12:00:00.000Z",
    operation: "content.deck.update",
    payload: {
      baseSnapshot: {
        descriptionPlain: "Original description",
        title: "Original deck",
      },
      changes: { title: "Local deck title" },
      kind: "content_mutation",
      mutationType: "update_deck",
      temporaryId: null,
    },
    priorOperationId: null,
    protocolVersion: 1,
    registeredDeviceId: deviceId,
    status: "pending",
  });
}

async function mediaOperation(): Promise<OutboxOperation> {
  const temporaryMediaId = "99999999-9999-4999-8999-999999999999";
  return sealOutboxOperation({
    accountId: accountA,
    attemptCount: 0,
    baseVersion: null,
    createdAt: "2026-07-23T12:00:00.000Z",
    entityId: temporaryMediaId,
    entityType: "media",
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    lastFailure: null,
    learnerProfileId: profileA,
    nextAttemptAt: null,
    occurredAt: "2026-07-23T12:00:00.000Z",
    operation: "media.upload",
    payload: {
      altText: "A diagram",
      byteSize: 13,
      fileName: "diagram.png",
      kind: "media_mutation",
      mediaKind: "image",
      mimeType: "image/png",
      ownerEntity: { entityId: temporaryMediaId, entityType: "media", local: true },
      sha256: "a".repeat(64),
      temporaryMediaId,
      transcript: "",
    },
    priorOperationId: null,
    protocolVersion: 1,
    registeredDeviceId: deviceId,
    status: "pending",
  });
}

beforeEach(async () => {
  databaseName = `lumen-offline-test-${crypto.randomUUID()}`;
  repository = new OfflineRepository(new LumenOfflineDatabase(databaseName));
  await repository.open();
});

afterEach(async () => {
  repository.close();
  await Dexie.delete(databaseName);
});

describe("offline repository", () => {
  it("creates the complete schema at version one", () => {
    expect(repository.database.verno).toBe(1);
    expect(repository.database.tables.map((table) => table.name).sort()).toEqual(
      [
        "cacheMetadata",
        "cachedCapabilities",
        "cardEntryProjections",
        "conflicts",
        "contentOutbox",
        "deckProjections",
        "deviceState",
        "featureFlags",
        "localSessionItems",
        "localSessions",
        "lruMetadata",
        "mediaBlobs",
        "mediaManifests",
        "mediaOutbox",
        "namespaceMetadata",
        "operationReceipts",
        "pinnedDecks",
        "practiceOutbox",
        "reviewOutbox",
        "reviewUndoOutbox",
        "scheduleProjections",
        "studyCardProjections",
        "syncCursors",
        "temporaryIdMappings",
        "workerUpdateState",
      ].sort(),
    );
  });

  it("isolates account and learner-profile queries", async () => {
    await repository.activateNamespace(namespace());
    const operationA = await reviewOperation();
    await repository.enqueue(operationA);
    expect(await repository.pendingOperations()).toHaveLength(1);

    await repository.activateNamespace(namespace(accountA, profileB));
    expect(await repository.pendingOperations()).toHaveLength(0);
    await repository.enqueue(await reviewOperation(accountA, profileB));

    await repository.activateNamespace(namespace(accountB, profileA));
    expect(await repository.pendingOperations()).toHaveLength(0);

    await repository.activateNamespace(namespace());
    expect((await repository.pendingOperations()).map((operation) => operation.id)).toEqual([
      operationA.id,
    ]);
  });

  it("rejects writes from another namespace", async () => {
    await repository.activateNamespace(namespace());
    await expect(repository.enqueue(await reviewOperation(accountA, profileB))).rejects.toThrow(
      "NAMESPACE_MISMATCH",
    );
  });

  it("clears one profile without touching another profile or public metadata", async () => {
    await repository.activateNamespace(namespace());
    await repository.enqueue(await reviewOperation());
    await repository.activateNamespace(namespace(accountA, profileB));
    await repository.enqueue(await reviewOperation(accountA, profileB));
    await repository.activateNamespace({ kind: "public" });
    await repository.database.deckProjections.put({
      id: "public:deck",
      namespaceKey: "public",
      storedAt: new Date().toISOString(),
      value: { id: "public-deck" },
    });

    await repository.clearNamespace(namespace());
    await repository.activateNamespace(namespace(accountA, profileB));
    expect(await repository.pendingOperations()).toHaveLength(1);
    expect(await repository.database.deckProjections.get("public:deck")).toBeDefined();
  });

  it("clears every private namespace for one account only", async () => {
    await repository.activateNamespace(namespace());
    await repository.enqueue(await reviewOperation());
    await repository.activateNamespace(namespace(accountA, profileB));
    await repository.enqueue(await reviewOperation(accountA, profileB));
    await repository.activateNamespace(namespace(accountB, profileA));
    await repository.enqueue(await reviewOperation(accountB, profileA));

    await repository.clearAccount(accountA);
    await repository.activateNamespace(namespace(accountB, profileA));
    expect(await repository.pendingOperations()).toHaveLength(1);
    expect(
      await repository.database.namespaceMetadata
        .filter((row) => row.namespaceKey.startsWith(`private:${accountA}:`))
        .count(),
    ).toBe(0);
  });

  it("retains pinned cache metadata during LRU cleanup", async () => {
    await repository.activateNamespace(namespace());
    const base = {
      lastAccessedAt: "2026-07-23T12:00:00.000Z",
      namespace: namespace(),
    };
    await repository.putCacheMetadata({
      ...base,
      byteSize: 100,
      pinned: true,
      recordKey: "pinned",
    });
    await repository.putCacheMetadata({
      ...base,
      byteSize: 80,
      pinned: false,
      recordKey: "old",
    });
    expect(await repository.evictLeastRecentlyUsed(50)).toBe(80);
    expect(await repository.database.cacheMetadata.count()).toBe(1);
  });

  it("reports pin estimates without double-counting pinned media", async () => {
    await repository.activateNamespace(namespace());
    await repository.putPin({
      cardCount: 2,
      contentHash: "a".repeat(64),
      deckId: "77777777-7777-4777-8777-777777777777",
      deckTitle: "Offline size",
      estimatedBytes: 2_048,
      includeAudio: false,
      includeImages: true,
      mediaBytes: 1_024,
      pinnedAt: "2026-07-23T12:00:00.000Z",
      status: "ready",
      updatedAt: "2026-07-23T12:00:00.000Z",
    });
    await repository.putCacheMetadata({
      byteSize: 1_024,
      lastAccessedAt: "2026-07-23T12:00:00.000Z",
      namespace: namespace(),
      pinned: true,
      recordKey: "pinned-media",
    });
    await repository.putCacheMetadata({
      byteSize: 128,
      lastAccessedAt: "2026-07-23T12:00:00.000Z",
      namespace: namespace(),
      pinned: false,
      recordKey: "automatic-preview",
    });
    expect(await repository.currentNamespaceUsageBytes()).toBe(2_176);
  });

  it("atomically replaces a pin and marks another device's delta as an available update", async () => {
    await repository.activateNamespace(namespace());
    const deckId = "77777777-7777-4777-8777-777777777777";
    const cardId = "55555555-5555-4555-8555-555555555555";
    const manifest = {
      cardCount: 1,
      contentHash: "a".repeat(64),
      deckId,
      deckTitle: "Atomic pin",
      estimatedBytes: 2_048,
      includeAudio: false,
      includeImages: true,
      mediaBytes: 0,
      pinnedAt: "2026-07-23T12:00:00.000Z",
      status: "ready" as const,
      updatedAt: "2026-07-23T12:00:00.000Z",
    };
    await repository.replacePinnedDeck({
      cards: [{ active: true, deckId, id: cardId, previewFront: "First projection" }],
      deck: { id: deckId, title: "Atomic pin", version: 1 },
      media: [],
      notes: [],
      pin: manifest,
      schedules: [{ card_id: cardId, version: 1 }],
    });
    await repository.applyPulledChanges(
      [
        {
          changedAt: "2026-07-23T12:05:00.000Z",
          deviceId: "44444444-4444-4444-8444-444444444444",
          entityId: cardId,
          entityType: "review",
          entityVersion: 2,
          sequence: "9",
          tombstone: false,
        },
      ],
      deviceId,
    );
    expect((await repository.listPins())[0]).toMatchObject({
      lastSynchronizedAt: "2026-07-23T12:05:00.000Z",
      updateAvailable: true,
    });

    await repository.replacePinnedDeck({
      cards: [{ active: true, deckId, id: cardId, previewFront: "Replacement projection" }],
      deck: { id: deckId, title: "Atomic pin", version: 2 },
      media: [],
      notes: [],
      pin: {
        ...manifest,
        contentHash: "b".repeat(64),
        updatedAt: "2026-07-23T12:06:00.000Z",
      },
      schedules: [{ card_id: cardId, version: 2 }],
    });
    expect(await repository.deckProjectionRows("studyCardProjections", deckId)).toEqual([
      expect.objectContaining({ previewFront: "Replacement projection" }),
    ]);
    expect((await repository.listPins())[0]?.updateAvailable).toBe(false);
  });

  it("persists cursors and defers retryable operations until their next attempt", async () => {
    await repository.activateNamespace(namespace());
    await repository.putCursor({ sequence: "900719925474099301", stream: "reviews" });
    expect(await repository.listCursors()).toEqual([
      { sequence: "900719925474099301", stream: "reviews" },
    ]);

    const operation = await reviewOperation();
    await repository.enqueue({
      ...operation,
      nextAttemptAt: "2099-01-01T00:00:00.000Z",
      status: "retryable",
    });
    expect(await repository.pendingOperations()).toHaveLength(0);
  });

  it("finds the latest causal operation for one entity only", async () => {
    await repository.activateNamespace(namespace());
    const first = await reviewOperation();
    const second = await reviewOperation();
    await repository.enqueue(first);
    await repository.enqueue({
      ...second,
      createdAt: "2026-07-23T12:01:00.000Z",
      occurredAt: "2026-07-23T12:01:00.000Z",
    });
    expect((await repository.latestPendingOperation("review", first.entityId))?.id).toBe(second.id);
    expect(
      await repository.latestPendingOperation("review", "77777777-7777-4777-8777-777777777777"),
    ).toBeNull();
  });

  it("reads a 10,000-card pin without crossing the local performance budget", async () => {
    await repository.activateNamespace(namespace());
    const deckId = "77777777-7777-4777-8777-777777777777";
    const key = repository.activeNamespaceKey();
    expect(key).not.toBeNull();
    const now = new Date().toISOString();
    await repository.database.studyCardProjections.bulkPut(
      Array.from({ length: 10_000 }, (_, index) => ({
        id: `${key}:card-${String(index)}`,
        namespaceKey: key!,
        storedAt: now,
        value: { deckId, id: `card-${String(index)}`, previewFront: `Prompt ${String(index)}` },
      })),
    );
    const startedAt = performance.now();
    const cards = await repository.deckProjectionRows("studyCardProjections", deckId);
    const elapsedMs = performance.now() - startedAt;
    expect(cards).toHaveLength(10_000);
    expect(elapsedMs).toBeLessThan(2_000);
  }, 10_000);

  it("deduplicates pinned media by hash and retains it while another deck references it", async () => {
    await repository.activateNamespace(namespace());
    const firstDeck = "77777777-7777-4777-8777-777777777777";
    const secondDeck = "88888888-8888-4888-8888-888888888888";
    const bytes = new Blob(["offline-image"], { type: "image/png" });
    const media = {
      assetId: "99999999-9999-4999-8999-999999999999",
      blob: bytes,
      byteSize: bytes.size,
      kind: "image" as const,
      mimeType: "image/png",
      sha256: "a".repeat(64),
    };
    await repository.putPinnedMedia({ ...media, deckId: firstDeck });
    await repository.putPinnedMedia({ ...media, deckId: secondDeck });
    expect(await repository.database.mediaBlobs.count()).toBe(1);

    await repository.removePin(firstDeck);
    expect(await repository.database.mediaBlobs.count()).toBe(1);
    await repository.removePin(secondDeck);
    expect(await repository.database.mediaBlobs.count()).toBe(0);
    expect(await repository.database.cacheMetadata.count()).toBe(0);
  });

  it("retains an offline-created media blob and atomically remaps dependent content", async () => {
    await repository.activateNamespace(namespace());
    const media = await mediaOperation();
    const blob = new Blob(["offline-image"], { type: "image/png" });
    expect(blob.size).toBe(13);
    await repository.putPendingMedia(media, blob);
    await repository.enqueue(await contentOperation());

    expect(await repository.pendingMediaUploads()).toHaveLength(1);
    expect(await repository.currentNamespaceUsageBytes()).toBe(13);

    const canonicalId = "aaaaaaaa-1111-4111-8111-111111111111";
    await repository.completePendingMediaUpload(media.id, canonicalId, {
      baseDelayMs: 1_000,
      jitterRatio: 0,
      maximumAttempts: 3,
      maximumDelayMs: 60_000,
    });

    expect(await repository.pendingMediaUploads()).toHaveLength(0);
    expect(await repository.database.mediaBlobs.count()).toBe(0);
    const content = await repository.database.contentOutbox.toCollection().first();
    expect(JSON.stringify(content?.value)).toContain(canonicalId);
    expect(JSON.stringify(content?.value)).not.toContain(media.entityId);
    expect(
      await repository.database.temporaryIdMappings
        .where("namespaceKey")
        .equals(repository.activeNamespaceKey()!)
        .count(),
    ).toBeGreaterThanOrEqual(1);
  });

  it("turns an explicit keep-local conflict choice into a new version-checked operation", async () => {
    await repository.activateNamespace(namespace());
    const operation = await contentOperation();
    await repository.enqueue(operation);
    const conflictId = crypto.randomUUID();
    await repository.applyOperationResult(
      {
        acknowledgment: null,
        authoritativeProjection: null,
        conflict: {
          conflictId,
          createdAt: "2026-07-23T12:01:00.000Z",
          entity: { entityId: operation.entityId, entityType: "card_entry", local: false },
          kind: "same_field",
          localChangedAt: operation.occurredAt,
          localValue:
            operation.payload.kind === "content_mutation" ? operation.payload.changes : {},
          mergedFields: [],
          namespace: namespace(),
          operationId: operation.id,
          resolution: null,
          resolvedAt: null,
          serverChangedAt: "2026-07-23T12:00:30.000Z",
          serverValue: { currentVersion: 7, title: "Server title" },
        },
        failure: {
          code: "content_conflict",
          message: "The card changed on another device.",
          retryable: false,
        },
        operationId: operation.id,
        status: "conflict",
      },
      {
        baseDelayMs: 1_000,
        jitterRatio: 0,
        maximumAttempts: 3,
        maximumDelayMs: 60_000,
      },
    );

    await repository.resolveConflict({ conflictId, resolution: "keep_local_revision" });
    const pending = await repository.pendingOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      baseVersion: 7,
      entityId: operation.entityId,
      status: "pending",
    });
    expect(await repository.unresolvedConflicts()).toHaveLength(0);
    expect((await repository.database.contentOutbox.get(operation.id))?.status).toBe("abandoned");
  });

  it("retains a privacy-safe confirmation when independent fields auto-merge", async () => {
    await repository.activateNamespace(namespace());
    const operation = await reviewOperation();
    await repository.enqueue(operation);
    const acknowledgedAt = "2026-07-23T12:02:00.000Z";
    await repository.applyOperationResult(
      {
        acknowledgment: {
          acknowledgedAt,
          canonicalEntityId: operation.entityId,
          canonicalVersion: 1,
          operationId: operation.id,
          receiptId: crypto.randomUUID(),
        },
        authoritativeProjection: {
          synchronization: { mergedFields: ["authoringData.front"] },
        },
        conflict: null,
        failure: null,
        operationId: operation.id,
        status: "applied_after_replay",
      },
      {
        baseDelayMs: 1_000,
        jitterRatio: 0,
        maximumAttempts: 3,
        maximumDelayMs: 60_000,
      },
    );

    expect(await repository.recentSyncHistory()).toEqual([
      {
        acknowledgedAt,
        mergedFields: ["authoringData.front"],
        operationId: operation.id,
        status: "applied_after_replay",
      },
    ]);
  });

  it("duplicates a conflicted deck as a causal deck create rather than a card create", async () => {
    await repository.activateNamespace(namespace());
    const operation = await deckOperation();
    await repository.enqueue(operation);
    const conflictId = crypto.randomUUID();
    await repository.applyOperationResult(
      {
        acknowledgment: null,
        authoritativeProjection: null,
        conflict: {
          conflictId,
          createdAt: "2026-07-23T12:01:00.000Z",
          entity: { entityId: operation.entityId, entityType: "deck", local: false },
          kind: "delete_edit",
          localChangedAt: operation.occurredAt,
          localValue:
            operation.payload.kind === "content_mutation" ? operation.payload.changes : {},
          mergedFields: [],
          namespace: namespace(),
          operationId: operation.id,
          resolution: null,
          resolvedAt: null,
          serverChangedAt: "2026-07-23T12:00:30.000Z",
          serverValue: { currentVersion: 5 },
        },
        failure: {
          code: "content_conflict",
          message: "The deck changed on another device.",
          retryable: false,
        },
        operationId: operation.id,
        status: "conflict",
      },
      {
        baseDelayMs: 1_000,
        jitterRatio: 0,
        maximumAttempts: 3,
        maximumDelayMs: 60_000,
      },
    );

    await repository.resolveConflict({ conflictId, resolution: "duplicate_entity" });

    const pending = await repository.pendingOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      baseVersion: null,
      entityType: "content",
      operation: "content.create_deck",
      payload: {
        changes: {
          descriptionText: "Original description",
          title: "Local deck title",
        },
        mutationType: "create_deck",
      },
      status: "pending",
    });
    expect(pending[0]?.entityId).toMatch(/^local:deck:/u);
  });
});
