"use client";

import {
  OFFLINE_PROTOCOL_VERSION,
  OfflineRepository,
  pinManifestSchema,
  retryPolicySchema,
  sealOutboxOperation,
  syncResponseSchema,
  type Conflict,
  type FailedOperationSummary,
  type OperationBreakdown,
  type PinManifest,
  type SyncHistoryEntry,
  type SynchronizationStatus,
} from "@lumen/offline";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

import { isolateBrowserLearnerContext } from "@/lib/auth/cache-isolation.client";

interface InstallPromptEvent extends Event {
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

interface SyncManagerLike {
  register(tag: string): Promise<void>;
}

const pinResponseSchema = z
  .object({
    data: z
      .object({
        cards: z.array(z.record(z.string(), z.unknown())).max(10_000),
        deck: z.record(z.string(), z.unknown()),
        includeAudio: z.boolean(),
        includeImages: z.boolean(),
        media: z
          .array(
            z
              .object({
                altText: z.string().max(1_000),
                byteSize: z.number().int().positive().max(10_485_760),
                id: z.uuid(),
                kind: z.enum(["audio", "image"]),
                mimeType: z.string().min(1).max(120),
                sha256: z.string().regex(/^[a-f0-9]{64}$/u),
              })
              .strict(),
          )
          .max(1_000),
        notes: z.array(z.record(z.string(), z.unknown())).max(10_000),
        pinnedAt: z.iso.datetime({ offset: true }),
        schedules: z.array(z.record(z.string(), z.unknown())).max(10_000),
      })
      .strict(),
    manifest: pinManifestSchema,
  })
  .strict();

const mediaUploadResponseSchema = z
  .object({
    data: z
      .object({
        altText: z.string(),
        id: z.uuid(),
        kind: z.enum(["audio", "image"]),
        mimeType: z.string(),
        signedUrl: z.string().nullable(),
        transcript: z.string(),
      })
      .strict(),
    status: z.literal("created"),
  })
  .strict();

const retryPolicy = retryPolicySchema.parse({
  baseDelayMs: 2_000,
  jitterRatio: 0.2,
  maximumAttempts: 8,
  maximumDelayMs: 3_600_000,
});
const installDismissedKey = "lumen:pwa-install-dismissed:v1";
const coordinationFallbackKey = "lumen:offline:coordination:v1";
const activeNamespaceStorageKey = "lumen:private:active-namespace:v1";
const syncPreferencesSchema = z
  .object({
    mediaDownloadPreference: z.enum(["all", "images_only", "none"]),
    meteredConnectionPreference: z.enum(["allow", "avoid_media", "pause"]),
    paused: z.boolean(),
  })
  .strict();
export type SyncPreferences = z.infer<typeof syncPreferencesSchema>;
export type OfflineConflictResolution =
  | "use_server"
  | "keep_local_revision"
  | "manual_merge"
  | "duplicate_entity"
  | "accept_canonical_replay"
  | "retain_as_practice"
  | "retry_media"
  | "abandon";

interface OfflineContextValue {
  readonly available: boolean;
  readonly clearAccountData: () => Promise<void>;
  readonly clearProfileData: () => Promise<void>;
  readonly conflicts: readonly Conflict[];
  readonly failedOperations: readonly FailedOperationSummary[];
  readonly install: () => Promise<void>;
  readonly installAvailable: boolean;
  readonly installed: boolean;
  readonly operationBreakdown: OperationBreakdown;
  readonly pinDeck: (deckId: string, includeAudio?: boolean) => Promise<void>;
  readonly pins: ReadonlyMap<string, PinManifest>;
  readonly queueCardMutation: (command: OfflineCardMutationCommand) => Promise<string>;
  readonly queueContentMutation: (command: OfflineContentMutationCommand) => Promise<void>;
  readonly queueDeckCreation: (command: OfflineDeckCreationCommand) => Promise<string>;
  readonly queueMediaUpload: (command: OfflineMediaUploadCommand) => Promise<string>;
  readonly queuePracticeAttempt: (command: OfflinePracticeCommand) => Promise<void>;
  readonly queueReview: (command: OfflineReviewCommand) => Promise<void>;
  readonly queueReviewUndo: (reviewId: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly resolveConflict: (
    conflictId: string,
    resolution: OfflineConflictResolution,
    mergedValue?: unknown,
  ) => Promise<void>;
  readonly retryOperation: (operationId: string) => Promise<void>;
  readonly abandonOperation: (operationId: string) => Promise<void>;
  readonly storageUsageBytes: number;
  readonly status: SynchronizationStatus;
  readonly syncHistory: readonly SyncHistoryEntry[];
  readonly syncNow: () => Promise<void>;
  readonly syncPreferences: SyncPreferences;
  readonly unpinDeck: (deckId: string) => Promise<void>;
  readonly updateSyncPreferences: (preferences: SyncPreferences) => Promise<void>;
  readonly updateAvailable: boolean;
  readonly updateNow: () => Promise<void>;
}

export interface OfflineDeckCreationCommand {
  readonly description: string;
  readonly folderId: string | null;
  readonly title: string;
}

export interface OfflineCardMutationCommand {
  readonly authoringData: Readonly<Record<string, unknown>>;
  readonly baseSnapshot: Readonly<Record<string, unknown>> | null;
  readonly deckId: string;
  readonly expectedVersion: number | null;
  readonly noteId: string | null;
  readonly source: string;
  readonly tags: readonly string[];
}

export interface OfflineContentMutationCommand {
  readonly baseSnapshot: Readonly<Record<string, unknown>> | null;
  readonly baseVersion: number | null;
  readonly changes: Readonly<Record<string, unknown>>;
  readonly entityId: string;
  readonly mutationType: "update_deck" | "archive" | "delete" | "restore" | "reorder";
  readonly operation: string;
}

export interface OfflineMediaUploadCommand {
  readonly altText: string;
  readonly blob: Blob;
  readonly fileName: string;
  readonly kind: "audio" | "image";
  readonly mimeType: string;
  readonly sha256: string;
  readonly transcript: string;
}

export interface OfflineReviewCommand {
  readonly baseScheduleVersion: number;
  readonly beforeSchedule: Readonly<Record<string, unknown>>;
  readonly cardId: string;
  readonly deckId: string;
  readonly durationMs: number;
  readonly idempotencyKey: string;
  readonly optimisticSchedule: Readonly<Record<string, unknown>>;
  readonly rating: "again" | "hard" | "good" | "easy";
  readonly reviewId: string;
  readonly reviewedAt: string;
  readonly source: "today" | "deck" | "folder" | "filtered" | "review_ahead" | "cram";
  readonly studyDayStart: number;
  readonly studySessionId: string;
  readonly timezone: string;
}

export interface OfflinePracticeCommand {
  readonly answerRevealed: boolean;
  readonly attemptId: string;
  readonly contentVersion: number;
  readonly durationMs: number;
  readonly hintsUsed: number;
  readonly idempotencyKey: string;
  readonly itemPosition: number;
  readonly response: string;
  readonly responseKind: string;
  readonly retryCount: number;
  readonly selfConfidence: number | null;
  readonly selfVerdict?: "correct" | "partial" | "incorrect" | "needs_review";
  readonly sessionId: string;
}

const initialStatus: SynchronizationStatus = {
  lastSuccessfulSyncAt: null,
  pendingCriticalCount: 0,
  state: "synced",
};
const initialSyncPreferences: SyncPreferences = {
  mediaDownloadPreference: "images_only",
  meteredConnectionPreference: "avoid_media",
  paused: false,
};
const initialOperationBreakdown: OperationBreakdown = {
  content: 0,
  deadLetters: 0,
  media: 0,
  practice: 0,
  reviewUndos: 0,
  reviews: 0,
};

const OfflineContext = createContext<OfflineContextValue | null>(null);
const offlineUnavailable = async (): Promise<never> => {
  throw new Error("Offline storage is unavailable in this browser.");
};
const unavailableOfflineContext: OfflineContextValue = {
  abandonOperation: async () => undefined,
  available: false,
  clearAccountData: async () => undefined,
  clearProfileData: async () => undefined,
  conflicts: [],
  failedOperations: [],
  install: async () => undefined,
  installAvailable: false,
  installed: false,
  operationBreakdown: initialOperationBreakdown,
  pinDeck: offlineUnavailable,
  pins: new Map(),
  queueCardMutation: offlineUnavailable,
  queueContentMutation: offlineUnavailable,
  queueDeckCreation: offlineUnavailable,
  queueMediaUpload: offlineUnavailable,
  queuePracticeAttempt: offlineUnavailable,
  queueReview: offlineUnavailable,
  queueReviewUndo: offlineUnavailable,
  refresh: async () => undefined,
  resolveConflict: async () => undefined,
  retryOperation: async () => undefined,
  status: initialStatus,
  syncHistory: [],
  storageUsageBytes: 0,
  syncNow: async () => undefined,
  syncPreferences: initialSyncPreferences,
  unpinDeck: async () => undefined,
  updateAvailable: false,
  updateNow: async () => undefined,
  updateSyncPreferences: offlineUnavailable,
};

function statusLabel(status: SynchronizationStatus["state"]): string {
  return {
    needs_attention: "Needs attention",
    offline: "Offline",
    saving_locally: "Saving locally",
    storage_full: "Storage full",
    synced: "Synced",
    syncing: "Syncing",
    update_available: "Update available",
    waiting_to_sync: "Waiting to sync",
  }[status];
}

function statusSymbol(status: SynchronizationStatus["state"]): string {
  return {
    needs_attention: "!",
    offline: "○",
    saving_locally: "↓",
    storage_full: "!",
    synced: "✓",
    syncing: "↻",
    update_available: "↑",
    waiting_to_sync: "…",
  }[status];
}

function storageFull(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "UnknownError")
  );
}

async function blobSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // BroadcastChannel and in-tab state remain available when Web Storage is blocked.
  }
}

export function OfflineStatus({
  compact = false,
  status,
}: {
  readonly compact?: boolean;
  readonly status: SynchronizationStatus;
}) {
  const label = statusLabel(status.state);
  return (
    <div aria-label={`${label}. ${status.pendingCriticalCount} pending changes.`} role="status">
      <a
        className="offline-status"
        data-compact={compact ? "true" : "false"}
        data-state={status.state}
        href="/app/offline"
      >
        <span aria-hidden="true" className="offline-status__symbol">
          {statusSymbol(status.state)}
        </span>
        <span>
          {compact
            ? label
            : `${label}${status.pendingCriticalCount ? ` · ${String(status.pendingCriticalCount)}` : ""}`}
        </span>
      </a>
    </div>
  );
}

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext) ?? unavailableOfflineContext;
}

export function OfflineProvider({
  accountId,
  children,
  deviceId,
  learnerProfileId,
}: {
  readonly accountId: string;
  readonly children: ReactNode;
  readonly deviceId: string;
  readonly learnerProfileId: string;
}) {
  const repositoryRef = useRef<OfflineRepository | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const installPromptRef = useRef<InstallPromptEvent | null>(null);
  const busyRef = useRef(0);
  const updateRequestedRef = useRef(false);
  const pathname = usePathname() ?? "";
  const [available, setAvailable] = useState(true);
  const [conflicts, setConflicts] = useState<readonly Conflict[]>([]);
  const [failedOperations, setFailedOperations] = useState<readonly FailedOperationSummary[]>([]);
  const [pins, setPins] = useState<ReadonlyMap<string, PinManifest>>(new Map());
  const [storageUsageBytes, setStorageUsageBytes] = useState(0);
  const [status, setStatus] = useState<SynchronizationStatus>(initialStatus);
  const [syncHistory, setSyncHistory] = useState<readonly SyncHistoryEntry[]>([]);
  const [syncPreferences, setSyncPreferences] = useState<SyncPreferences>(initialSyncPreferences);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [operationBreakdown, setOperationBreakdown] =
    useState<OperationBreakdown>(initialOperationBreakdown);
  const [installed, setInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const namespace = useMemo(
    () => ({ accountId, kind: "private" as const, learnerProfileId }),
    [accountId, learnerProfileId],
  );
  const leaseKey = useMemo(
    () => `lumen:offline:sync-lease:${accountId}:${learnerProfileId}`,
    [accountId, learnerProfileId],
  );

  const refresh = useCallback(async () => {
    const repository = repositoryRef.current;
    if (!repository) return;
    const [pinRows, counts, breakdown, conflictRows, failedRows, history, usage] =
      await Promise.all([
        repository.listPins(),
        repository.operationCounts(),
        repository.operationBreakdown(),
        repository.unresolvedConflicts(),
        repository.failedOperations(),
        repository.recentSyncHistory(),
        repository.currentNamespaceUsageBytes(),
      ]);
    setPins(new Map(pinRows.map((pin) => [pin.deckId, pin])));
    setConflicts(conflictRows);
    setFailedOperations(failedRows);
    setOperationBreakdown(breakdown);
    setSyncHistory(history);
    setStorageUsageBytes(usage);
    setStatus((current) => ({
      ...current,
      pendingCriticalCount: counts.pending,
      state:
        counts.conflicts > 0 || counts.deadLetters > 0
          ? "needs_attention"
          : !navigator.onLine
            ? "offline"
            : counts.pending > 0
              ? "waiting_to_sync"
              : current.state === "syncing" || current.state === "saving_locally"
                ? current.state
                : "synced",
    }));
  }, []);

  const coordinate = useCallback((message: Readonly<Record<string, unknown>>) => {
    const payload = { ...message, at: Date.now(), nonce: crypto.randomUUID() };
    try {
      const channel = new BroadcastChannel("lumen-offline-v1");
      channel.postMessage(payload);
      channel.close();
    } catch {
      safeLocalStorageSet(coordinationFallbackKey, JSON.stringify(payload));
    }
  }, []);

  const acquireLease = useCallback((): boolean => {
    const now = Date.now();
    const owner = crypto.randomUUID();
    try {
      const current = JSON.parse(window.localStorage.getItem(leaseKey) ?? "null") as unknown;
      const record =
        typeof current === "object" && current !== null && !Array.isArray(current)
          ? (current as Readonly<Record<string, unknown>>)
          : null;
      if (typeof record?.expiresAt === "number" && record.expiresAt > now) return false;
      window.localStorage.setItem(leaseKey, JSON.stringify({ expiresAt: now + 20_000, owner }));
      const confirmed = JSON.parse(window.localStorage.getItem(leaseKey) ?? "null") as {
        owner?: unknown;
      } | null;
      return confirmed?.owner === owner;
    } catch {
      return true;
    }
  }, [leaseKey]);

  const syncNow = useCallback(async () => {
    const repository = repositoryRef.current;
    if (!repository || syncPreferences.paused || !navigator.onLine || !acquireLease()) {
      if (!navigator.onLine) {
        setStatus((current) => ({ ...current, state: "offline" }));
      }
      return;
    }
    const connection = (
      navigator as Navigator & {
        readonly connection?: { readonly effectiveType?: string; readonly saveData?: boolean };
      }
    ).connection;
    const metered =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    const allowMedia = !metered || syncPreferences.meteredConnectionPreference === "allow";
    if (allowMedia) {
      const uploads = await repository.pendingMediaUploads();
      for (const upload of uploads) {
        const payload = upload.operation.payload;
        if (payload.kind !== "media_mutation") continue;
        try {
          const form = new FormData();
          form.set("file", new File([upload.blob], payload.fileName, { type: payload.mimeType }));
          form.set("kind", payload.mediaKind);
          form.set("sha256", payload.sha256);
          form.set("altText", payload.altText);
          form.set("transcript", payload.transcript);
          form.set("idempotencyKey", upload.operation.idempotencyKey);
          const response = await fetch("/api/content/media", { body: form, method: "POST" });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            await repository.applyOperationResult(
              {
                acknowledgment: null,
                authoritativeProjection: null,
                conflict: null,
                failure: {
                  code: retryable ? "server_unavailable" : "media_rejected",
                  message: retryable
                    ? "The media upload was interrupted and remains on this browser."
                    : "The server rejected this media file. The local draft remains recoverable.",
                  retryable,
                },
                operationId: upload.operation.id,
                status: retryable ? "retryable" : "rejected",
              },
              retryPolicy,
            );
            continue;
          }
          const result = mediaUploadResponseSchema.parse(await response.json());
          await repository.completePendingMediaUpload(
            upload.operation.id,
            result.data.id,
            retryPolicy,
          );
        } catch {
          await repository.applyOperationResult(
            {
              acknowledgment: null,
              authoritativeProjection: null,
              conflict: null,
              failure: {
                code: "network",
                message: "The media upload was interrupted and remains on this browser.",
                retryable: true,
              },
              operationId: upload.operation.id,
              status: "retryable",
            },
            retryPolicy,
          );
        }
      }
    }
    const unresolvedMedia = await repository.unresolvedMediaTemporaryIds();
    const operations = (await repository.pendingOperations(100)).filter((operation) => {
      if (operation.entityType === "media") return false;
      if (operation.entityType !== "content" || unresolvedMedia.size === 0) return true;
      const serialized = JSON.stringify(operation.payload);
      return ![...unresolvedMedia].some((temporaryId) => serialized.includes(temporaryId));
    });
    busyRef.current += 1;
    setStatus((current) => ({
      ...current,
      pendingCriticalCount: operations.length,
      state: "syncing",
    }));
    try {
      const cursors = await repository.listCursors();
      const response = await fetch("/api/sync/v1", {
        body: JSON.stringify({
          cursors,
          deviceId,
          learnerProfileId,
          operations,
          protocolVersion: OFFLINE_PROTOCOL_VERSION,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (response.status === 401 || response.status === 403) {
        setAvailable(false);
        setStatus((current) => ({ ...current, state: "needs_attention" }));
        await isolateBrowserLearnerContext("offline_access_changed");
        window.location.assign("/auth/sign-in?accessChanged=1");
        return;
      }
      if (!response.ok) throw new Error("SYNC_REQUEST_FAILED");
      const parsed = syncResponseSchema.parse(await response.json());
      for (const result of parsed.results) {
        await repository.applyOperationResult(result, retryPolicy);
      }
      await repository.applyPulledChanges(parsed.changes, deviceId);
      for (const cursor of parsed.nextCursors) await repository.putCursor(cursor);
      const counts = await repository.operationCounts();
      setStatus({
        lastSuccessfulSyncAt: parsed.serverTime,
        pendingCriticalCount: counts.pending,
        state:
          counts.conflicts > 0 || counts.deadLetters > 0
            ? "needs_attention"
            : counts.pending > 0
              ? "waiting_to_sync"
              : "synced",
      });
      coordinate({ type: "sync-complete" });
    } catch {
      setStatus((current) => ({
        ...current,
        pendingCriticalCount: Math.max(current.pendingCriticalCount, operations.length),
        state: navigator.onLine ? "waiting_to_sync" : "offline",
      }));
      const registration = registrationRef.current;
      const syncManager = registration
        ? (registration as ServiceWorkerRegistration & { sync?: SyncManagerLike }).sync
        : undefined;
      await syncManager?.register("lumen-sync-v1").catch(() => undefined);
    } finally {
      busyRef.current = Math.max(0, busyRef.current - 1);
      try {
        window.localStorage.removeItem(leaseKey);
      } catch {
        // The lease expires after 20 seconds if storage access changes mid-sync.
      }
    }
  }, [
    acquireLease,
    coordinate,
    deviceId,
    learnerProfileId,
    leaseKey,
    syncPreferences.meteredConnectionPreference,
    syncPreferences.paused,
  ]);

  const pinDeck = useCallback(
    async (deckId: string, includeAudio = syncPreferences.mediaDownloadPreference === "all") => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("OFFLINE_STORAGE_UNAVAILABLE");
      if (!navigator.onLine) throw new Error("PIN_REQUIRES_CONNECTION");
      busyRef.current += 1;
      setStatus((current) => ({ ...current, state: "saving_locally" }));
      try {
        const response = await fetch(`/api/offline/decks/${deckId}/pin`, {
          body: JSON.stringify({
            includeAudio,
            includeImages: syncPreferences.mediaDownloadPreference !== "none",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const message =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : "This deck could not be pinned.";
          throw new Error(message);
        }
        const parsed = pinResponseSchema.parse(await response.json());
        const estimate = await navigator.storage?.estimate?.().catch(() => null);
        const available =
          typeof estimate?.quota === "number" && typeof estimate.usage === "number"
            ? estimate.quota - estimate.usage
            : null;
        if (available !== null && available < Math.ceil(parsed.manifest.estimatedBytes * 1.05)) {
          throw new DOMException(
            "The pin exceeds available browser storage.",
            "QuotaExceededError",
          );
        }
        const downloadedMedia: {
          assetId: string;
          blob: Blob;
          byteSize: number;
          deckId: string;
          kind: "audio" | "image";
          mimeType: string;
          sha256: string;
        }[] = [];
        for (const asset of parsed.data.media) {
          const locatorResponse = await fetch(`/api/content/media/${asset.id}`, {
            cache: "no-store",
          });
          const locatorBody: unknown = await locatorResponse.json().catch(() => null);
          const locator =
            typeof locatorBody === "object" &&
            locatorBody !== null &&
            !Array.isArray(locatorBody) &&
            "data" in locatorBody &&
            typeof locatorBody.data === "object" &&
            locatorBody.data !== null &&
            !Array.isArray(locatorBody.data)
              ? (locatorBody.data as Readonly<Record<string, unknown>>)
              : null;
          if (!locatorResponse.ok || typeof locator?.signedUrl !== "string")
            throw new Error("A required media file could not be downloaded.");
          const mediaResponse = await fetch(locator.signedUrl, { cache: "no-store" });
          if (!mediaResponse.ok) throw new Error("A required media download was interrupted.");
          const blob = await mediaResponse.blob();
          if (
            blob.size !== asset.byteSize ||
            (blob.type &&
              blob.type.split(";", 1)[0]?.toLowerCase() !== asset.mimeType.toLowerCase()) ||
            (await blobSha256(blob)) !== asset.sha256
          ) {
            throw new Error("A downloaded media file failed local verification.");
          }
          downloadedMedia.push({
            assetId: asset.id,
            blob,
            byteSize: asset.byteSize,
            deckId,
            kind: asset.kind,
            mimeType: asset.mimeType,
            sha256: asset.sha256,
          });
        }
        await repository.replacePinnedDeck({
          cards: parsed.data.cards,
          deck: parsed.data.deck,
          media: downloadedMedia,
          notes: parsed.data.notes,
          pin: parsed.manifest,
          schedules: parsed.data.schedules,
        });
        await refresh();
        coordinate({ deckId, type: "pin-changed" });
      } catch (error) {
        setStatus((current) => ({
          ...current,
          state: storageFull(error) ? "storage_full" : "needs_attention",
        }));
        throw error;
      } finally {
        busyRef.current = Math.max(0, busyRef.current - 1);
      }
    },
    [coordinate, refresh, syncPreferences.mediaDownloadPreference],
  );

  const unpinDeck = useCallback(
    async (deckId: string) => {
      const repository = repositoryRef.current;
      if (!repository) return;
      busyRef.current += 1;
      setStatus((current) => ({ ...current, state: "saving_locally" }));
      try {
        await repository.removePin(deckId);
        await refresh();
        coordinate({ deckId, type: "pin-changed" });
      } finally {
        busyRef.current = Math.max(0, busyRef.current - 1);
      }
    },
    [coordinate, refresh],
  );

  const queueReview = useCallback(
    async (command: OfflineReviewCommand) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const prior = await repository.latestPendingOperation("review", command.cardId);
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: command.baseScheduleVersion,
        createdAt: new Date().toISOString(),
        entityId: command.cardId,
        entityType: "review",
        id: command.reviewId,
        idempotencyKey: command.idempotencyKey,
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: command.reviewedAt,
        operation: "review.submit",
        payload: {
          baseScheduleVersion: command.baseScheduleVersion,
          beforeSchedule: command.beforeSchedule,
          cardId: command.cardId,
          durationMs: command.durationMs,
          kind: "review",
          priorReviewOperationId: prior?.id ?? null,
          rating: command.rating,
          reviewId: command.reviewId,
          reviewedAt: command.reviewedAt,
          source: command.source,
          studyDayStart: command.studyDayStart,
          studySessionId: command.studySessionId,
          timezone: command.timezone,
        },
        priorOperationId: prior?.id ?? null,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      await repository.enqueue(operation);
      await repository.putProjection("scheduleProjections", command.cardId, {
        ...command.optimisticSchedule,
        baseVersion: command.baseScheduleVersion,
        card_id: command.cardId,
        deckId: command.deckId,
        pendingOperationId: operation.id,
      });
      await refresh();
      coordinate({ type: "outbox-changed" });
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const queueReviewUndo = useCallback(
    async (reviewId: string) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const undoEventId = crypto.randomUUID();
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: null,
        createdAt: new Date().toISOString(),
        entityId: reviewId,
        entityType: "review_undo",
        id: undoEventId,
        idempotencyKey: crypto.randomUUID(),
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: new Date().toISOString(),
        operation: "review.undo",
        payload: {
          kind: "review_undo",
          reason: "learner_requested",
          reviewId,
          undoEventId,
        },
        priorOperationId: reviewId,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      await repository.enqueue(operation);
      await refresh();
      coordinate({ type: "outbox-changed" });
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const queuePracticeAttempt = useCallback(
    async (command: OfflinePracticeCommand) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: command.contentVersion,
        createdAt: new Date().toISOString(),
        entityId: command.attemptId,
        entityType: "practice_attempt",
        id: command.attemptId,
        idempotencyKey: command.idempotencyKey,
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: new Date().toISOString(),
        operation: "practice.submit",
        payload: {
          answerRevealed: command.answerRevealed,
          attemptId: command.attemptId,
          contentVersion: command.contentVersion,
          durationMs: command.durationMs,
          hintsUsed: command.hintsUsed,
          itemPosition: command.itemPosition,
          kind: "practice_attempt",
          response: command.response,
          responseKind: command.responseKind,
          retryCount: command.retryCount,
          selfConfidence: command.selfConfidence,
          selfVerdict: command.selfVerdict ?? null,
          sessionId: command.sessionId,
        },
        priorOperationId: null,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      await repository.enqueue(operation);
      await refresh();
      coordinate({ type: "outbox-changed" });
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const queueDeckCreation = useCallback(
    async (command: OfflineDeckCreationCommand) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const operationId = crypto.randomUUID();
      const temporaryId = `local:deck:${operationId}`;
      const now = new Date().toISOString();
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: null,
        createdAt: now,
        entityId: temporaryId,
        entityType: "content",
        id: operationId,
        idempotencyKey: crypto.randomUUID(),
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: now,
        operation: "content.create_deck",
        payload: {
          baseSnapshot: null,
          changes: {
            descriptionText: command.description,
            folderId: command.folderId,
            title: command.title,
          },
          kind: "content_mutation",
          mutationType: "create_deck",
          temporaryId,
        },
        priorOperationId: null,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      await repository.enqueue(operation);
      await repository.putProjection("deckProjections", temporaryId, {
        cardCount: 0,
        descriptionPlain: command.description,
        folderId: command.folderId,
        id: temporaryId,
        local: true,
        noteCount: 0,
        status: "draft",
        title: command.title,
        updatedAt: now,
        version: 0,
      });
      await refresh();
      coordinate({ type: "outbox-changed" });
      return temporaryId;
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const queueCardMutation = useCallback(
    async (command: OfflineCardMutationCommand) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const operationId = crypto.randomUUID();
      const entityId = command.noteId ?? `local:card_entry:${operationId}`;
      const prior = await repository.latestPendingOperation("content", entityId);
      const deckPrior = command.deckId.startsWith("local:")
        ? await repository.latestPendingOperation("content", command.deckId)
        : null;
      const now = new Date().toISOString();
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: command.expectedVersion,
        createdAt: now,
        entityId,
        entityType: "content",
        id: operationId,
        idempotencyKey: crypto.randomUUID(),
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: now,
        operation: command.noteId ? "content.update_card_entry" : "content.create_card_entry",
        payload: {
          baseSnapshot: command.baseSnapshot,
          changes: {
            authoringData: command.authoringData,
            deckId: command.deckId,
            expectedVersion: command.expectedVersion,
            noteId: command.noteId,
            source: command.source,
            tags: [...command.tags],
          },
          kind: "content_mutation",
          mutationType: command.noteId ? "update_card_entry" : "create_card_entry",
          temporaryId: command.noteId ? null : entityId,
        },
        priorOperationId: prior?.id ?? deckPrior?.id ?? null,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      await repository.enqueue(operation);
      await repository.putProjection("cardEntryProjections", entityId, {
        authoringData: command.authoringData,
        deckId: command.deckId,
        id: entityId,
        local: command.noteId === null,
        pendingOperationId: operationId,
        source: command.source,
        tags: [...command.tags],
        updatedAt: now,
        version: command.expectedVersion ?? 0,
      });
      await refresh();
      coordinate({ type: "outbox-changed" });
      return entityId;
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const queueContentMutation = useCallback(
    async (command: OfflineContentMutationCommand) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const prior = await repository.latestPendingOperation("content", command.entityId);
      const operationId = crypto.randomUUID();
      const now = new Date().toISOString();
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: command.baseVersion,
        createdAt: now,
        entityId: command.entityId,
        entityType: "content",
        id: operationId,
        idempotencyKey: crypto.randomUUID(),
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: now,
        operation: command.operation,
        payload: {
          baseSnapshot: command.baseSnapshot,
          changes: command.changes,
          kind: "content_mutation",
          mutationType: command.mutationType,
          temporaryId: null,
        },
        priorOperationId: prior?.id ?? null,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      await repository.enqueue(operation);
      if (command.operation.startsWith("content.deck.")) {
        await repository.putProjection("deckProjections", command.entityId, {
          ...(command.baseSnapshot ?? {}),
          ...command.changes,
          id: command.entityId,
          pendingOperationId: operationId,
          updatedAt: now,
          version: command.baseVersion ?? 0,
        });
      }
      await refresh();
      coordinate({ type: "outbox-changed" });
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const queueMediaUpload = useCallback(
    async (command: OfflineMediaUploadCommand) => {
      const repository = repositoryRef.current;
      if (!repository) throw new Error("Offline storage is unavailable.");
      const estimate = await navigator.storage?.estimate?.().catch(() => null);
      if (typeof estimate?.quota === "number" && typeof estimate.usage === "number") {
        const availableBytes = Math.max(0, estimate.quota - estimate.usage);
        if (availableBytes < command.blob.size) {
          const freed = await repository.evictLeastRecentlyUsed(command.blob.size - availableBytes);
          if (availableBytes + freed < command.blob.size)
            throw new DOMException(
              "There is not enough browser storage for this media draft.",
              "QuotaExceededError",
            );
        }
      }
      const operationId = crypto.randomUUID();
      const temporaryMediaId = crypto.randomUUID();
      const now = new Date().toISOString();
      const operation = await sealOutboxOperation({
        accountId,
        attemptCount: 0,
        baseVersion: null,
        createdAt: now,
        entityId: temporaryMediaId,
        entityType: "media",
        id: operationId,
        idempotencyKey: crypto.randomUUID(),
        lastFailure: null,
        learnerProfileId,
        nextAttemptAt: null,
        occurredAt: now,
        operation: "media.upload",
        payload: {
          altText: command.altText,
          byteSize: command.blob.size,
          fileName: command.fileName,
          kind: "media_mutation",
          mediaKind: command.kind,
          mimeType: command.mimeType,
          ownerEntity: {
            entityId: temporaryMediaId,
            entityType: "media",
            local: true,
          },
          sha256: command.sha256,
          temporaryMediaId,
          transcript: command.transcript,
        },
        priorOperationId: null,
        protocolVersion: OFFLINE_PROTOCOL_VERSION,
        registeredDeviceId: deviceId,
        status: "pending",
      });
      setStatus((current) => ({ ...current, state: "saving_locally" }));
      try {
        await repository.putPendingMedia(operation, command.blob);
        await refresh();
        coordinate({ type: "outbox-changed" });
        return temporaryMediaId;
      } catch (error) {
        setStatus((current) => ({
          ...current,
          state: storageFull(error) ? "storage_full" : "needs_attention",
        }));
        throw error;
      }
    },
    [accountId, coordinate, deviceId, learnerProfileId, refresh],
  );

  const clearProfileData = useCallback(async () => {
    const repository = repositoryRef.current;
    if (!repository) return;
    await repository.clearNamespace(namespace);
    await repository.activateNamespace(namespace);
    await refresh();
    coordinate({ type: "storage-cleanup" });
  }, [coordinate, namespace, refresh]);

  const clearAccountData = useCallback(async () => {
    const repository = repositoryRef.current;
    if (!repository) return;
    await repository.clearAccount(accountId);
    await repository.activateNamespace(namespace);
    await refresh();
    coordinate({ type: "storage-cleanup" });
  }, [accountId, coordinate, namespace, refresh]);

  const resolveConflict = useCallback(
    async (conflictId: string, resolution: OfflineConflictResolution, mergedValue?: unknown) => {
      const repository = repositoryRef.current;
      if (!repository) return;
      await repository.resolveConflict({
        conflictId,
        ...(mergedValue === undefined ? {} : { mergedValue }),
        resolution,
      });
      await refresh();
      coordinate({ type: "conflict-resolved" });
    },
    [coordinate, refresh],
  );

  const retryOperation = useCallback(
    async (operationId: string) => {
      const repository = repositoryRef.current;
      if (!repository) return;
      await repository.retryOperation(operationId);
      await refresh();
      coordinate({ type: "outbox-changed" });
      if (navigator.onLine) void syncNow();
    },
    [coordinate, refresh, syncNow],
  );

  const abandonOperation = useCallback(
    async (operationId: string) => {
      const repository = repositoryRef.current;
      if (!repository) return;
      await repository.abandonOperation(operationId);
      await refresh();
      coordinate({ type: "outbox-changed" });
    },
    [coordinate, refresh],
  );

  const install = useCallback(async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "dismissed") safeLocalStorageSet(installDismissedKey, "true");
    installPromptRef.current = null;
    setInstallAvailable(false);
  }, []);

  const updateNow = useCallback(async () => {
    if (busyRef.current > 0) return;
    const registration = registrationRef.current;
    updateRequestedRef.current = true;
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const updateSyncPreferences = useCallback(
    async (preferences: SyncPreferences) => {
      const parsed = syncPreferencesSchema.parse(preferences);
      setSyncPreferences(parsed);
      const repository = repositoryRef.current;
      await repository?.putDeviceState(deviceId, parsed);
      if (!navigator.onLine) return;
      const response = await fetch("/api/sync/v1/preferences", {
        body: JSON.stringify(parsed),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Synchronization preferences could not be saved.");
      if (!parsed.paused) void syncNow();
    },
    [deviceId, syncNow],
  );

  useEffect(() => {
    let cancelled = false;
    const repository = new OfflineRepository();
    repositoryRef.current = repository;
    const start = async () => {
      try {
        if (!("indexedDB" in window)) throw new Error("INDEXEDDB_UNAVAILABLE");
        await repository.open();
        await repository.activateNamespace(namespace);
        safeLocalStorageSet(activeNamespaceStorageKey, repository.activeNamespaceKey() ?? "");
        if (navigator.onLine) {
          const preferenceResponse = await fetch("/api/sync/v1/preferences", {
            cache: "no-store",
          }).catch(() => null);
          if (preferenceResponse?.ok) {
            const body: unknown = await preferenceResponse.json().catch(() => null);
            const parsedPreferences =
              typeof body === "object" && body !== null && !Array.isArray(body) && "data" in body
                ? syncPreferencesSchema.safeParse(body.data)
                : null;
            if (parsedPreferences?.success) {
              setSyncPreferences(parsedPreferences.data);
              await repository.putDeviceState(deviceId, parsedPreferences.data);
            }
          }
        }
        if (!cancelled) {
          setAvailable(true);
          await refresh();
        }
      } catch {
        if (!cancelled) {
          setAvailable(false);
          setStatus((current) => ({ ...current, state: "needs_attention" }));
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      repository.close();
      if (repositoryRef.current === repository) repositoryRef.current = null;
    };
  }, [deviceId, namespace, refresh]);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { readonly standalone?: boolean }).standalone === true);
    setInstalled(standalone);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      if (standalone || safeLocalStorageGet(installDismissedKey) === "true") return;
      installPromptRef.current = event as InstallPromptEvent;
      setInstallAvailable(true);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", beforeInstall);
  }, []);

  useEffect(() => {
    const developmentOptIn = safeLocalStorageGet("lumen:pwa-dev") === "true";
    if (
      !("serviceWorker" in navigator) ||
      (process.env.NODE_ENV !== "production" && !developmentOptIn)
    ) {
      return;
    }
    let active = true;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (!active) return;
      registrationRef.current = registration;
      if (registration.waiting) {
        setUpdateAvailable(true);
        setStatus((current) => ({ ...current, state: "update_available" }));
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
            setStatus((current) => ({ ...current, state: "update_available" }));
            coordinate({ type: "update-available" });
          }
        });
      });
    });
    const controllerChanged = () => {
      if (updateRequestedRef.current && busyRef.current === 0) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
    };
  }, [coordinate]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const receive = (event: MessageEvent<unknown>) => {
      const message =
        typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
          ? (event.data as Readonly<Record<string, unknown>>)
          : null;
      if (message?.type === "SYNC_REQUESTED") void syncNow();
    };
    navigator.serviceWorker.addEventListener("message", receive);
    return () => navigator.serviceWorker.removeEventListener("message", receive);
  }, [syncNow]);

  useEffect(() => {
    const online = () => {
      void refresh().then(syncNow);
    };
    const offline = () => setStatus((current) => ({ ...current, state: "offline" }));
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow();
    }, 60_000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(interval);
    };
  }, [refresh, syncNow]);

  useEffect(() => {
    const receive = (value: unknown) => {
      const message =
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as Readonly<Record<string, unknown>>)
          : null;
      if (
        message?.type === "sync-complete" ||
        message?.type === "pin-changed" ||
        message?.type === "outbox-changed"
      )
        void refresh();
      if (message?.type === "update-available") setUpdateAvailable(true);
      if (message?.type === "identity-boundary") {
        const repository = repositoryRef.current;
        if (!repository) return;
        void repository.clearNamespace(namespace).finally(() => {
          repository.deactivateNamespace();
          window.location.reload();
        });
      }
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("lumen-offline-v1");
      channel.addEventListener("message", (event) => receive(event.data));
    } catch {
      channel = null;
    }
    const storage = (event: StorageEvent) => {
      if (event.key !== coordinationFallbackKey || !event.newValue) return;
      try {
        receive(JSON.parse(event.newValue) as unknown);
      } catch {
        // Ignore a malformed cross-tab fallback message.
      }
    };
    window.addEventListener("storage", storage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", storage);
    };
  }, [namespace, refresh]);

  useEffect(() => {
    const identityBoundary = (event: Event) => {
      const repository = repositoryRef.current;
      if (!repository) return;
      coordinate({ type: "identity-boundary" });
      const cleanup = repository
        .clearNamespace(namespace)
        .finally(() => repository.deactivateNamespace());
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        typeof detail === "object" &&
        detail !== null &&
        "waitUntil" in detail &&
        typeof detail.waitUntil === "function"
      ) {
        detail.waitUntil(cleanup);
        return;
      }
      void cleanup;
    };
    window.addEventListener("lumen:identity-boundary", identityBoundary);
    return () => window.removeEventListener("lumen:identity-boundary", identityBoundary);
  }, [coordinate, namespace]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      available,
      abandonOperation,
      clearAccountData,
      clearProfileData,
      conflicts,
      failedOperations,
      install,
      installAvailable,
      installed,
      operationBreakdown,
      pinDeck,
      pins,
      queueCardMutation,
      queueContentMutation,
      queueDeckCreation,
      queueMediaUpload,
      queuePracticeAttempt,
      queueReview,
      queueReviewUndo,
      refresh,
      resolveConflict,
      retryOperation,
      storageUsageBytes,
      status,
      syncHistory,
      syncNow,
      syncPreferences,
      unpinDeck,
      updateAvailable,
      updateNow,
      updateSyncPreferences,
    }),
    [
      available,
      abandonOperation,
      clearAccountData,
      clearProfileData,
      conflicts,
      failedOperations,
      install,
      installAvailable,
      installed,
      operationBreakdown,
      pinDeck,
      pins,
      queueCardMutation,
      queueContentMutation,
      queueDeckCreation,
      queueMediaUpload,
      queuePracticeAttempt,
      queueReview,
      queueReviewUndo,
      refresh,
      resolveConflict,
      retryOperation,
      storageUsageBytes,
      status,
      syncHistory,
      syncNow,
      syncPreferences,
      unpinDeck,
      updateAvailable,
      updateNow,
      updateSyncPreferences,
    ],
  );
  const focused =
    pathname.startsWith("/app/study/session/") || pathname.startsWith("/app/practice/session/");

  return (
    <OfflineContext.Provider value={value}>
      {children}
      <OfflineStatus compact={focused} status={status} />
      {installAvailable && !installed && (
        <aside aria-label="Install this app" className="offline-prompt" role="status">
          <div>
            <strong>Open like an app</strong>
            <p>Pinned decks work offline, and saved work waits safely to sync.</p>
          </div>
          <button onClick={() => void install()} type="button">
            Install
          </button>
          <button
            onClick={() => {
              safeLocalStorageSet(installDismissedKey, "true");
              setInstallAvailable(false);
            }}
            type="button"
          >
            Later
          </button>
        </aside>
      )}
      {updateAvailable && (
        <aside aria-label="Application update" className="offline-prompt" role="status">
          <div>
            <strong>Update available</strong>
            <p>Unsynced work is preserved. Update after your current activity is saved.</p>
          </div>
          <button disabled={busyRef.current > 0} onClick={() => void updateNow()} type="button">
            Update now
          </button>
          <button onClick={() => setUpdateAvailable(false)} type="button">
            Later
          </button>
        </aside>
      )}
    </OfflineContext.Provider>
  );
}
