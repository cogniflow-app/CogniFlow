import {
  OFFLINE_PROTOCOL_VERSION,
  causalOrder,
  mergeStructuredContent,
  outboxOperationSchema,
  syncRequestSchema,
  syncResponseSchema,
  verifyOutboxFingerprint,
  type Conflict,
  type OutboxOperation,
  type OutboxOperationResult,
} from "@lumen/offline";
import type { Json } from "@lumen/database";
import { cardAuthoringSchema } from "@lumen/domain";
import { NextRequest } from "next/server";
import { z } from "zod";

import { POST as createDeck } from "@/app/api/content/decks/route";
import { PATCH as mutateDeck } from "@/app/api/content/decks/[deckId]/route";
import {
  PATCH as updateCardEntry,
  POST as createCardEntry,
} from "@/app/api/content/decks/[deckId]/notes/route";
import { DELETE as deleteCardEntry } from "@/app/api/content/decks/[deckId]/notes/[noteId]/route";
import { POST as submitPracticeAttempt } from "@/app/api/practice/attempts/route";
import { POST as submitReview } from "@/app/api/study/reviews/route";
import { POST as submitReviewUndo } from "@/app/api/study/reviews/undo/route";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";
import { requireRequestRateLimit } from "@/lib/server/rate-limit";
import {
  createSrsRuntimeContext,
  isSrsRuntimeContext,
  type SrsRuntimeContext,
} from "@/lib/server/srs-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_REQUEST_BYTES = 524_288;
const MAXIMUM_OPERATIONS = 100;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function replaceMappedIdentifiers(value: unknown, mappings: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return mappings.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceMappedIdentifiers(item, mappings));
  const candidate = record(value);
  if (!candidate) return value;
  return Object.fromEntries(
    Object.entries(candidate).map(([key, item]) => [key, replaceMappedIdentifiers(item, mappings)]),
  );
}

function mappedOperation(
  operation: OutboxOperation,
  mappings: ReadonlyMap<string, string>,
): OutboxOperation {
  return outboxOperationSchema.parse({
    ...operation,
    entityId: mappings.get(operation.entityId) ?? operation.entityId,
    payload: replaceMappedIdentifiers(operation.payload, mappings),
  });
}

interface RemoteContentSnapshot {
  readonly updatedAt: string | null;
  readonly value: Readonly<Record<string, unknown>>;
  readonly version: number;
}

interface ContentMergePreparation {
  readonly conflictPaths: readonly string[];
  readonly mergedFields: readonly string[];
  readonly operation: OutboxOperation | null;
  readonly remote: RemoteContentSnapshot;
}

function rows(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.map(record).filter((row): row is Readonly<Record<string, unknown>> => row !== null)
    : [];
}

function baseField(
  base: Readonly<Record<string, unknown>>,
  key: string,
): { readonly found: boolean; readonly value: unknown } {
  const aliases =
    key === "descriptionText"
      ? ["descriptionText", "descriptionPlain"]
      : key === "source"
        ? ["source", "sourceReference"]
        : [key];
  for (const alias of aliases) {
    if (Object.hasOwn(base, alias)) return { found: true, value: base[alias] };
  }
  return { found: false, value: null };
}

async function loadRemoteContentSnapshot(
  context: SrsRuntimeContext,
  operation: OutboxOperation,
): Promise<RemoteContentSnapshot | null> {
  if (operation.payload.kind !== "content_mutation") return null;
  if (operation.payload.mutationType === "update_deck") {
    const { data, error } = await context.database.client
      .from("decks")
      .select(
        "title,description_plain,cover_asset_id,language_front,language_back,license,theme,version,updated_at",
      )
      .eq("id", operation.entityId)
      .single();
    const row = record(data);
    if (error || !row || typeof row.version !== "number") return null;
    return {
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      value: {
        coverAssetId: row.cover_asset_id ?? null,
        descriptionText: row.description_plain ?? "",
        languageBack: row.language_back ?? "",
        languageFront: row.language_front ?? "",
        license: row.license ?? "all_rights_reserved",
        theme: row.theme ?? "neutral",
        title: row.title ?? "",
      },
      version: row.version,
    };
  }
  if (operation.payload.mutationType !== "update_card_entry") return null;
  const { data, error } = await context.database.client
    .from("notes")
    .select("card_payload,source_reference,version,updated_at")
    .eq("id", operation.entityId)
    .single();
  const row = record(data);
  const payload = record(row?.card_payload);
  if (error || !row || typeof row.version !== "number" || !payload) return null;
  const { data: noteTagData, error: noteTagError } = await context.database.client
    .from("note_tags")
    .select("tag_id")
    .eq("note_id", operation.entityId)
    .is("deleted_at", null);
  if (noteTagError) return null;
  const tagIds = rows(noteTagData)
    .map((tag) => tag.tag_id)
    .filter((tagId): tagId is string => typeof tagId === "string");
  let tags: string[] = [];
  if (tagIds.length > 0) {
    const { data: tagData, error: tagError } = await context.database.client
      .from("tags")
      .select("name")
      .in("id", tagIds);
    if (tagError) return null;
    tags = rows(tagData)
      .map((tag) => tag.name)
      .filter((name): name is string => typeof name === "string")
      .sort();
  }
  return {
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    value: {
      authoringData: payload.authoringData,
      source: row.source_reference ?? "",
      tags,
    },
    version: row.version,
  };
}

async function prepareContentAutoMerge(
  context: SrsRuntimeContext,
  operation: OutboxOperation,
): Promise<ContentMergePreparation | null> {
  if (
    operation.payload.kind !== "content_mutation" ||
    !["update_deck", "update_card_entry"].includes(operation.payload.mutationType) ||
    !operation.payload.baseSnapshot
  ) {
    return null;
  }
  const remote = await loadRemoteContentSnapshot(context, operation);
  if (!remote) return null;
  const allowedFields =
    operation.payload.mutationType === "update_deck"
      ? new Set([
          "coverAssetId",
          "descriptionText",
          "languageBack",
          "languageFront",
          "license",
          "theme",
          "title",
        ])
      : new Set(["authoringData", "source", "tags"]);
  const nextChanges: Record<string, unknown> = { ...operation.payload.changes };
  const conflictPaths: string[] = [];
  const mergedFields: string[] = [];
  for (const [key, localValue] of Object.entries(operation.payload.changes)) {
    if (!allowedFields.has(key)) continue;
    const base = baseField(operation.payload.baseSnapshot, key);
    if (!base.found || !Object.hasOwn(remote.value, key)) {
      conflictPaths.push(key);
      continue;
    }
    const result = mergeStructuredContent(base.value, localValue, remote.value[key], key);
    if (result.status === "conflict") {
      conflictPaths.push(...result.conflictPaths);
    } else {
      nextChanges[key] = result.value;
      mergedFields.push(...result.mergedPaths);
    }
  }
  if (conflictPaths.length > 0) {
    return { conflictPaths, mergedFields, operation: null, remote };
  }
  if (
    operation.payload.mutationType === "update_card_entry" &&
    !cardAuthoringSchema.safeParse(nextChanges.authoringData).success
  ) {
    return {
      conflictPaths: ["authoringData"],
      mergedFields,
      operation: null,
      remote,
    };
  }
  return {
    conflictPaths: [],
    mergedFields: [...new Set(mergedFields)].slice(0, 100),
    operation: outboxOperationSchema.parse({
      ...operation,
      baseVersion: remote.version,
      payload: {
        ...operation.payload,
        changes: {
          ...nextChanges,
          ...(operation.payload.mutationType === "update_card_entry"
            ? { expectedVersion: remote.version }
            : {}),
        },
      },
    }),
    remote,
  };
}

async function responseWithSyncMetadata(
  response: Response,
  metadata: Readonly<Record<string, unknown>>,
): Promise<Response> {
  const body =
    record(
      await response
        .clone()
        .json()
        .catch(() => null),
    ) ?? {};
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ ...body, ...metadata }), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function dispatchWithContentMerge(
  context: SrsRuntimeContext,
  request: NextRequest,
  operation: OutboxOperation,
): Promise<Response> {
  const first = await dispatchOperation(request, operation);
  if (first.status !== 409) return first;
  const prepared = await prepareContentAutoMerge(context, operation);
  if (!prepared) return first;
  const serverValue = {
    ...prepared.remote.value,
    currentVersion: prepared.remote.version,
  };
  if (!prepared.operation) {
    return responseWithSyncMetadata(first, {
      conflictPaths: prepared.conflictPaths,
      mergedFields: prepared.mergedFields,
      serverValue,
      updatedAt: prepared.remote.updatedAt,
    });
  }
  const retried = await dispatchOperation(request, prepared.operation);
  return responseWithSyncMetadata(retried, {
    appliedAfterReplay: retried.ok,
    mergedFields: prepared.mergedFields,
    serverValue,
    updatedAt: prepared.remote.updatedAt,
  });
}

function internalRequest(original: NextRequest, path: string, body: unknown): NextRequest {
  const headers = new Headers();
  for (const name of ["cookie", "origin", "referer", "user-agent", "x-forwarded-for"]) {
    const value = original.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("content-type", "application/json");
  return new NextRequest(new URL(path, original.url), {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

async function dispatchOperation(
  request: NextRequest,
  operation: OutboxOperation,
): Promise<Response> {
  if (operation.payload.kind === "review") {
    const payload = operation.payload;
    return submitReview(
      internalRequest(request, "/api/study/reviews", {
        cardId: payload.cardId,
        currentScheduleVersion: payload.baseScheduleVersion,
        durationMs: payload.durationMs,
        idempotencyKey: operation.idempotencyKey,
        rating: payload.rating,
        reviewId: payload.reviewId,
        reviewedAt: payload.reviewedAt,
        source: payload.source,
        studyDayStart: payload.studyDayStart,
        studySessionId: payload.studySessionId,
        timezone: payload.timezone,
      }),
    );
  }
  if (operation.payload.kind === "review_undo") {
    return submitReviewUndo(
      internalRequest(request, "/api/study/reviews/undo", {
        idempotencyKey: operation.idempotencyKey,
        reviewLogId: operation.payload.reviewId,
        undoEventId: operation.payload.undoEventId,
      }),
    );
  }
  if (operation.payload.kind === "practice_attempt") {
    const payload = operation.payload;
    return submitPracticeAttempt(
      internalRequest(request, "/api/practice/attempts", {
        answerRevealed: payload.answerRevealed,
        attemptId: payload.attemptId,
        contentVersion: payload.contentVersion,
        durationMs: payload.durationMs,
        hintsUsed: payload.hintsUsed,
        idempotencyKey: operation.idempotencyKey,
        itemPosition: payload.itemPosition,
        response: payload.response,
        responseKind: payload.responseKind,
        retryCount: payload.retryCount,
        selfConfidence: payload.selfConfidence,
        ...(payload.selfVerdict ? { selfVerdict: payload.selfVerdict } : {}),
        sessionId: payload.sessionId,
      }),
    );
  }
  if (
    operation.payload.kind === "content_mutation" &&
    operation.payload.mutationType === "create_deck"
  ) {
    return createDeck(
      internalRequest(request, "/api/content/decks", {
        description: operation.payload.changes.descriptionText ?? "",
        folderId: operation.payload.changes.folderId ?? null,
        idempotencyKey: operation.idempotencyKey,
        title: operation.payload.changes.title,
        visibility: "private",
      }),
    );
  }
  if (operation.payload.kind === "content_mutation") {
    const payload = operation.payload;
    const changes = payload.changes;
    if (
      (payload.mutationType === "create_card_entry" ||
        payload.mutationType === "update_card_entry") &&
      typeof changes.deckId === "string" &&
      typeof changes.authoringData === "object" &&
      changes.authoringData !== null
    ) {
      const body = {
        authoringData: changes.authoringData,
        expectedVersion:
          payload.mutationType === "create_card_entry"
            ? null
            : (changes.expectedVersion ?? operation.baseVersion),
        idempotencyKey: operation.idempotencyKey,
        noteId:
          payload.mutationType === "create_card_entry"
            ? null
            : (changes.noteId ?? operation.entityId),
        source: changes.source ?? "",
        tags: changes.tags ?? [],
      };
      const parameters = { params: Promise.resolve({ deckId: changes.deckId }) };
      return payload.mutationType === "create_card_entry"
        ? createCardEntry(
            internalRequest(request, `/api/content/decks/${changes.deckId}/notes`, body),
            parameters,
          )
        : updateCardEntry(
            internalRequest(request, `/api/content/decks/${changes.deckId}/notes`, body),
            parameters,
          );
    }
    if (
      payload.mutationType === "delete" &&
      typeof changes.deckId === "string" &&
      typeof changes.noteId === "string"
    ) {
      return deleteCardEntry(
        internalRequest(request, `/api/content/decks/${changes.deckId}/notes/${changes.noteId}`, {
          expectedVersion: changes.expectedVersion ?? operation.baseVersion,
          idempotencyKey: operation.idempotencyKey,
        }),
        {
          params: Promise.resolve({
            deckId: changes.deckId,
            noteId: changes.noteId,
          }),
        },
      );
    }
    if (
      ["update_deck", "archive", "delete", "restore"].includes(payload.mutationType) &&
      z.string().uuid().safeParse(operation.entityId).success
    ) {
      const action =
        payload.mutationType === "update_deck"
          ? "update"
          : payload.mutationType === "archive"
            ? "archive"
            : payload.mutationType;
      return mutateDeck(
        internalRequest(request, `/api/content/decks/${operation.entityId}`, {
          action,
          ...(changes.coverAssetId !== undefined ? { coverAssetId: changes.coverAssetId } : {}),
          ...(changes.descriptionText !== undefined
            ? { description: changes.descriptionText }
            : {}),
          expectedVersion: operation.baseVersion ?? 0,
          idempotencyKey: operation.idempotencyKey,
          ...(changes.languageBack !== undefined ? { languageBack: changes.languageBack } : {}),
          ...(changes.languageFront !== undefined ? { languageFront: changes.languageFront } : {}),
          ...(changes.license !== undefined ? { license: changes.license } : {}),
          ...(changes.theme !== undefined ? { theme: changes.theme } : {}),
          ...(changes.title !== undefined ? { title: changes.title } : {}),
        }),
        { params: Promise.resolve({ deckId: operation.entityId }) },
      );
    }
  }
  return Response.json(
    {
      code: "CONFLICT",
      message:
        operation.payload.kind === "media_mutation"
          ? "The pending media file must be uploaded before its reference can synchronize."
          : "This offline edit needs review before it can be merged with the server version.",
      retryable: operation.payload.kind === "media_mutation",
    },
    {
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      status: operation.payload.kind === "media_mutation" ? 503 : 409,
    },
  );
}

function conflictFor(
  operation: OutboxOperation,
  body: Readonly<Record<string, unknown>> | null,
): Conflict {
  const conflictPaths = Array.isArray(body?.conflictPaths)
    ? body.conflictPaths.filter((path): path is string => typeof path === "string").slice(0, 100)
    : [];
  const bodyServerValue = record(body?.serverValue);
  const kind: Conflict["kind"] =
    operation.entityType === "review"
      ? "review_chain"
      : operation.entityType === "media"
        ? "media"
        : operation.operation.includes("delete")
          ? "delete_edit"
          : conflictPaths.some(
                (path) =>
                  path.includes("authoringData") ||
                  path.includes(".content") ||
                  path.includes(".fields"),
              )
            ? "rich_overlap"
            : "same_field";
  return {
    conflictId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    entity: {
      entityId: operation.entityId,
      entityType:
        operation.entityType === "content"
          ? operation.operation.includes(".deck.")
            ? "deck"
            : "card_entry"
          : operation.entityType === "review"
            ? "review"
            : operation.entityType === "media"
              ? "media"
              : "practice_attempt",
      local: operation.entityId.startsWith("local:"),
    },
    kind,
    localChangedAt: operation.occurredAt,
    localValue:
      operation.payload.kind === "content_mutation"
        ? operation.payload.changes
        : operation.payload.kind === "review"
          ? {
              rating: operation.payload.rating,
              reviewedAt: operation.payload.reviewedAt,
            }
          : null,
    mergedFields: Array.isArray(body?.mergedFields)
      ? body.mergedFields
          .filter((field): field is string => typeof field === "string")
          .slice(0, 100)
      : [],
    namespace: {
      accountId: operation.accountId,
      kind: "private",
      learnerProfileId: operation.learnerProfileId,
    },
    operationId: operation.id,
    resolution: null,
    resolvedAt: null,
    serverChangedAt:
      typeof body?.updatedAt === "string" &&
      z.iso.datetime({ offset: true }).safeParse(body.updatedAt).success
        ? body.updatedAt
        : null,
    serverValue: {
      ...(bodyServerValue ?? {}),
      currentVersion:
        typeof body?.currentVersion === "number"
          ? body.currentVersion
          : typeof bodyServerValue?.currentVersion === "number"
            ? bodyServerValue.currentVersion
            : null,
      message: typeof body?.message === "string" ? body.message.slice(0, 300) : null,
    },
  };
}

function canonicalProjection(body: Readonly<Record<string, unknown>> | null) {
  const data = record(body?.data);
  return data ?? (body ? { response: body } : null);
}

async function operationResult(
  operation: OutboxOperation,
  response: Response,
  receiptId: string,
): Promise<OutboxOperationResult> {
  const rawBody: unknown = await response.json().catch(() => null);
  const body = record(rawBody);
  if (response.ok) {
    const canonical = canonicalProjection(body);
    const mergedFields = Array.isArray(body?.mergedFields)
      ? body.mergedFields
          .filter((field): field is string => typeof field === "string")
          .slice(0, 100)
      : [];
    const projection =
      canonical && mergedFields.length > 0
        ? { ...canonical, synchronization: { mergedFields } }
        : canonical;
    const version =
      typeof projection?.scheduleVersion === "number"
        ? projection.scheduleVersion
        : typeof projection?.version === "number"
          ? projection.version
          : null;
    const canonicalId =
      typeof projection?.reviewId === "string"
        ? projection.reviewId
        : typeof projection?.id === "string"
          ? projection.id
          : operation.entityId;
    return {
      acknowledgment: {
        acknowledgedAt: new Date().toISOString(),
        canonicalEntityId: canonicalId,
        canonicalVersion: version,
        operationId: operation.id,
        receiptId,
      },
      authoritativeProjection: projection,
      conflict: null,
      failure: null,
      operationId: operation.id,
      status: body?.appliedAfterReplay === true ? "applied_after_replay" : "acknowledged",
    };
  }
  const retryable = response.status === 429 || response.status >= 500 || body?.retryable === true;
  const unauthorized = response.status === 401 || response.status === 403;
  const conflict = response.status === 409 ? conflictFor(operation, body) : null;
  return {
    acknowledgment: null,
    authoritativeProjection: null,
    conflict,
    failure: {
      code: unauthorized
        ? response.status === 403
          ? "permission_removed"
          : "unauthorized"
        : conflict
          ? operation.entityType === "review"
            ? "review_conflict"
            : "content_conflict"
          : retryable
            ? "server_unavailable"
            : "validation",
      message:
        typeof body?.message === "string"
          ? body.message.slice(0, 300)
          : retryable
            ? "Synchronization was interrupted. The operation remains queued."
            : "The server rejected this operation. Review it in Offline & sync.",
      retryable,
    },
    operationId: operation.id,
    status: unauthorized
      ? "unauthorized"
      : conflict
        ? "conflict"
        : retryable
          ? "retryable"
          : "rejected",
  };
}

function replayResult(
  operationId: string,
  value: Readonly<Record<string, unknown>>,
): OutboxOperationResult | null {
  const parsed = syncResponseSchema.shape.results.element.safeParse(
    [
      {
        ...value,
        operationId,
        status: "duplicate",
      },
    ][0],
  );
  return parsed.success ? parsed.data : null;
}

export async function POST(request: NextRequest) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;

  try {
    await requireRequestRateLimit({
      accountId: context.accountId,
      limit: 30,
      request,
      scope: "offline_sync",
      windowSeconds: 60,
    });
  } catch (error) {
    return context.applyCookies(
      apiError(429, {
        code: "RATE_LIMITED",
        message: "Synchronization is happening too often. Wait a moment and retry.",
        retryable: true,
        retryAfterMs:
          error instanceof Error && "retryAfterSeconds" in error
            ? Number(error.retryAfterSeconds) * 1_000
            : 30_000,
      }),
    );
  }

  const parsed = syncRequestSchema.safeParse(
    await readBoundedJson(request, MAXIMUM_REQUEST_BYTES).catch(() => null),
  );
  if (
    !parsed.success ||
    parsed.data.operations.length > MAXIMUM_OPERATIONS ||
    parsed.data.deviceId !== context.deviceId ||
    parsed.data.learnerProfileId !== context.learnerProfileId
  ) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The synchronization batch could not be validated.",
        retryable: false,
      }),
    );
  }

  const ordered = causalOrder(parsed.data.operations);
  const fingerprints = await Promise.all(ordered.map(verifyOutboxFingerprint));
  if (fingerprints.some((valid) => !valid)) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "A queued operation changed after it was saved.",
        retryable: false,
      }),
    );
  }

  const results: OutboxOperationResult[] = [];
  const blockedEntities = new Set<string>();
  const blockedOperationIds = new Set<string>();
  const temporaryMappings = new Map<string, string>();
  for (const operation of ordered) {
    const chainKey = `${operation.entityType}:${operation.entityId}`;
    if (
      blockedEntities.has(chainKey) ||
      (operation.priorOperationId !== null && blockedOperationIds.has(operation.priorOperationId))
    ) {
      results.push({
        acknowledgment: null,
        authoritativeProjection: null,
        conflict: null,
        failure: {
          code: "network",
          message: "An earlier related change must synchronize first.",
          retryable: true,
        },
        operationId: operation.id,
        status: "retryable",
      });
      blockedOperationIds.add(operation.id);
      continue;
    }
    const { data: beginData, error: beginError } = await context.privileged.rpc(
      "admin_begin_sync_operation",
      {
        p_actor_account_id: context.accountId,
        p_auth_session_id: context.authSessionId,
        p_device_id: context.deviceId,
        p_idempotency_key: operation.idempotencyKey,
        p_learner_profile_id: context.learnerProfileId,
        p_operation_id: operation.id,
        p_operation_kind: operation.operation,
        p_payload_fingerprint: operation.payloadFingerprint,
        p_profile_session_id: nullableRpcArgument(context.profileSessionId),
        p_protocol_version: OFFLINE_PROTOCOL_VERSION,
      },
    );
    const begin = record(beginData);
    if (beginError || !begin || typeof begin.receiptId !== "string") {
      const alteredReuse =
        beginError?.code === "22023" && beginError.message.includes("reused with different input");
      results.push({
        acknowledgment: null,
        authoritativeProjection: null,
        conflict: null,
        failure: {
          code: alteredReuse ? "idempotency_conflict" : "server_unavailable",
          message: alteredReuse
            ? "This operation ID was already used for a different change."
            : "The server could not reserve this operation. It remains queued.",
          retryable: !alteredReuse,
        },
        operationId: operation.id,
        status: alteredReuse ? "rejected" : "retryable",
      });
      blockedEntities.add(chainKey);
      blockedOperationIds.add(operation.id);
      continue;
    }
    if (begin.state === "complete") {
      const previous = record(begin.result);
      const replay = previous ? replayResult(operation.id, previous) : null;
      if (replay) {
        results.push(replay);
        continue;
      }
    }
    if (begin.state === "pending") {
      results.push({
        acknowledgment: null,
        authoritativeProjection: null,
        conflict: null,
        failure: {
          code: "server_unavailable",
          message: "This operation is already being synchronized by another tab.",
          retryable: true,
        },
        operationId: operation.id,
        status: "retryable",
      });
      blockedEntities.add(chainKey);
      blockedOperationIds.add(operation.id);
      continue;
    }

    const dispatchableOperation = mappedOperation(operation, temporaryMappings);
    const result = await operationResult(
      operation,
      await dispatchWithContentMerge(context, request, dispatchableOperation),
      begin.receiptId,
    );
    if (
      result.acknowledgment?.canonicalEntityId &&
      result.acknowledgment.canonicalEntityId !== operation.entityId
    ) {
      temporaryMappings.set(operation.entityId, result.acknowledgment.canonicalEntityId);
    }
    const version = result.acknowledgment?.canonicalVersion ?? operation.baseVersion;
    const { data: completed, error: completionError } = await context.privileged.rpc(
      "admin_complete_sync_operation",
      {
        p_actor_account_id: context.accountId,
        p_auth_session_id: context.authSessionId,
        p_device_id: context.deviceId,
        p_entity_id: dispatchableOperation.entityId,
        p_entity_type: operation.entityType,
        p_entity_version: version ?? 0,
        p_learner_profile_id: context.learnerProfileId,
        p_operation_id: operation.id,
        p_payload_fingerprint: operation.payloadFingerprint,
        p_profile_session_id: nullableRpcArgument(context.profileSessionId),
        p_result: toDatabaseJson(result) as Json,
        p_tombstone:
          operation.payload.kind === "content_mutation" &&
          operation.payload.changes.tombstone === true,
      },
    );
    const completedResult = record(completed);
    if (completionError || !completedResult) {
      results.push({
        ...result,
        acknowledgment: null,
        failure: {
          code: "server_unavailable",
          message: "The result was not durably acknowledged. The operation remains queued.",
          retryable: true,
        },
        status: "retryable",
      });
      blockedEntities.add(chainKey);
      blockedOperationIds.add(operation.id);
      continue;
    }
    results.push(result);
    if (!["acknowledged", "applied_after_replay", "duplicate"].includes(result.status)) {
      blockedEntities.add(chainKey);
      blockedOperationIds.add(operation.id);
    }
  }

  const contentCursor = parsed.data.cursors
    .map((cursor) => BigInt(cursor.sequence))
    .reduce((maximum, value) => (value > maximum ? value : maximum), 0n);
  const { data: pullData, error: pullError } = await context.privileged.rpc(
    "admin_pull_sync_changes",
    {
      p_actor_account_id: context.accountId,
      // PostgREST accepts bigint arguments as decimal JSON strings. Avoid narrowing
      // a durable cursor through JavaScript's 53-bit number range.
      p_after_sequence: contentCursor.toString() as unknown as number,
      p_auth_session_id: context.authSessionId,
      p_device_id: context.deviceId,
      p_learner_profile_id: context.learnerProfileId,
      p_limit: 500,
      p_profile_session_id: nullableRpcArgument(context.profileSessionId),
    },
  );
  const pull = record(pullData);
  const changes = !pullError && Array.isArray(pull?.changes) ? pull.changes : [];
  const nextSequence =
    !pullError && typeof pull?.nextSequence === "string"
      ? pull.nextSequence
      : contentCursor.toString();
  const streams = ["content", "media", "permissions", "practice", "reviews"] as const;
  const response = syncResponseSchema.parse({
    capabilities: {
      maximumBatchOperations: MAXIMUM_OPERATIONS,
      protocolVersion: OFFLINE_PROTOCOL_VERSION,
    },
    changes,
    nextCursors: streams.map((stream) => ({ sequence: nextSequence, stream })),
    protocolVersion: OFFLINE_PROTOCOL_VERSION,
    results,
    serverTime: new Date().toISOString(),
  });
  return context.applyCookies(apiSuccess(response));
}
