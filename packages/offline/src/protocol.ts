import {
  OFFLINE_PROTOCOL_VERSION,
  outboxOperationSchema,
  type OutboxOperation,
  type ProfileCacheNamespace,
  type RetryPolicy,
  type SyncCursor,
} from "./schemas";

const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

function canonical(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonical(item, seen));
  if (typeof value !== "object") throw new TypeError("UNSERIALIZABLE_VALUE");
  if (seen.has(value)) throw new TypeError("CYCLIC_VALUE");
  seen.add(value);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort()) {
    if (dangerousKeys.has(key)) throw new TypeError("UNSAFE_OBJECT_KEY");
    const item = (value as Readonly<Record<string, unknown>>)[key];
    if (item !== undefined) result[key] = canonical(item, seen);
  }
  seen.delete(value);
  return result;
}

export function deterministicSerialize(value: unknown): string {
  return JSON.stringify(canonical(value, new WeakSet()));
}

export async function payloadFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(deterministicSerialize(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function outboxCommand(operation: Omit<OutboxOperation, "payloadFingerprint">): unknown {
  return {
    accountId: operation.accountId,
    baseVersion: operation.baseVersion,
    entityId: operation.entityId,
    entityType: operation.entityType,
    id: operation.id,
    idempotencyKey: operation.idempotencyKey,
    learnerProfileId: operation.learnerProfileId,
    occurredAt: operation.occurredAt,
    operation: operation.operation,
    payload: operation.payload,
    priorOperationId: operation.priorOperationId,
    protocolVersion: operation.protocolVersion,
    registeredDeviceId: operation.registeredDeviceId,
  };
}

export async function sealOutboxOperation(
  operation: Omit<OutboxOperation, "payloadFingerprint">,
): Promise<OutboxOperation> {
  const payloadFingerprintValue = await payloadFingerprint(outboxCommand(operation));
  return outboxOperationSchema.parse({
    ...operation,
    payloadFingerprint: payloadFingerprintValue,
  });
}

export async function verifyOutboxFingerprint(operation: OutboxOperation): Promise<boolean> {
  const { payloadFingerprint: expected, ...unsealed } = operation;
  return expected === (await payloadFingerprint(outboxCommand(unsealed)));
}

export function namespaceKey(namespace: ProfileCacheNamespace): string {
  return namespace.kind === "public"
    ? "public"
    : `private:${namespace.accountId}:${namespace.learnerProfileId}`;
}

export function compareCursors(left: SyncCursor, right: SyncCursor): number {
  if (left.stream !== right.stream) return left.stream.localeCompare(right.stream);
  const leftSequence = BigInt(left.sequence);
  const rightSequence = BigInt(right.sequence);
  return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
}

export function causalOrder(operations: readonly OutboxOperation[]): readonly OutboxOperation[] {
  const byId = new Map(operations.map((operation) => [operation.id, operation]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: OutboxOperation[] = [];
  const visit = (operation: OutboxOperation): void => {
    if (visited.has(operation.id)) return;
    if (visiting.has(operation.id)) throw new Error("CAUSAL_CYCLE");
    visiting.add(operation.id);
    if (operation.priorOperationId) {
      const prior = byId.get(operation.priorOperationId);
      if (prior) visit(prior);
    }
    visiting.delete(operation.id);
    visited.add(operation.id);
    ordered.push(operation);
  };
  [...operations]
    .sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
    )
    .forEach(visit);
  return Object.freeze(ordered);
}

function deterministicUnitInterval(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

export function retryDelayMs(
  operationId: string,
  attemptCount: number,
  policy: RetryPolicy,
): number {
  const exponential = Math.min(
    policy.maximumDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, attemptCount - 1),
  );
  const centered = deterministicUnitInterval(`${operationId}:${attemptCount}`) * 2 - 1;
  return Math.max(
    policy.baseDelayMs,
    Math.round(exponential * (1 + centered * policy.jitterRatio)),
  );
}

export function negotiateProtocol(version: number): typeof OFFLINE_PROTOCOL_VERSION {
  if (version !== OFFLINE_PROTOCOL_VERSION) throw new Error("UNSUPPORTED_PROTOCOL");
  return OFFLINE_PROTOCOL_VERSION;
}

export function shouldDeadLetter(
  attemptCount: number,
  policy: RetryPolicy,
  retryable: boolean,
): boolean {
  return !retryable || attemptCount >= policy.maximumAttempts;
}

export function mapTemporaryId(value: string, mappings: ReadonlyMap<string, string>): string {
  return mappings.get(value) ?? value;
}
