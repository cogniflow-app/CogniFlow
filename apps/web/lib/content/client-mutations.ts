import type { ContentApiError } from "./view-models";

type ContentErrorCode = ContentApiError["code"];

const CONTENT_ERROR_CODES = new Set<ContentErrorCode>([
  "CONFLICT",
  "FORBIDDEN",
  "INTERNAL",
  "INVALID_INPUT",
  "NOT_FOUND",
  "QUOTA_EXCEEDED",
  "UNAUTHENTICATED",
]);

function errorCode(value: unknown): ContentErrorCode {
  return typeof value === "string" && CONTENT_ERROR_CODES.has(value as ContentErrorCode)
    ? (value as ContentErrorCode)
    : "INTERNAL";
}

export class ContentApiRequestError extends Error implements ContentApiError {
  readonly code: ContentErrorCode;
  readonly currentVersion?: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly retryable: boolean;

  constructor(
    payload: Partial<ContentApiError> | null,
    fallbackMessage: string,
    fallbackRetryable = false,
  ) {
    super(payload?.message ?? fallbackMessage);
    this.name = "ContentApiRequestError";
    this.code = errorCode(payload?.code);
    this.retryable = payload?.retryable ?? fallbackRetryable;
    if (
      typeof payload?.currentVersion === "number" &&
      Number.isSafeInteger(payload.currentVersion)
    ) {
      this.currentVersion = payload.currentVersion;
    }
    if (payload?.fieldErrors) this.fieldErrors = payload.fieldErrors;
  }
}

export async function readContentResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  let body: unknown = null;
  let decoded = true;
  try {
    body = await response.json();
  } catch {
    decoded = false;
  }
  if (!response.ok) {
    const payload =
      decoded && typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Partial<ContentApiError>)
        : null;
    throw new ContentApiRequestError(payload, fallbackMessage, response.status >= 500);
  }

  if (
    !decoded ||
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    body.data === null ||
    Array.isArray(body.data)
  ) {
    throw new ContentApiRequestError(
      {
        code: "INTERNAL",
        message:
          "The change may have completed, but its response could not be confirmed. Retry safely.",
        retryable: true,
      },
      fallbackMessage,
      true,
    );
  }
  return body as T;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

interface PendingOperation {
  readonly fingerprint: string;
  readonly key: string;
}

/**
 * Holds one client idempotency key for each logical mutation while its outcome is uncertain.
 * A changed command payload is a new operation; an exact retry after a lost or retryable response
 * retains the original key so the server can replay its receipt instead of duplicating content.
 */
export class PendingContentMutations {
  readonly #operations = new Map<string, PendingOperation>();
  readonly #createKey: () => string;

  constructor(createKey: () => string = () => crypto.randomUUID()) {
    this.#createKey = createKey;
  }

  acquire(operation: string, command: unknown): string {
    const fingerprint = JSON.stringify(stableValue(command));
    const pending = this.#operations.get(operation);
    if (pending?.fingerprint === fingerprint) return pending.key;
    const key = this.#createKey();
    this.#operations.set(operation, { fingerprint, key });
    return key;
  }

  settle(operation: string, key: string, error?: unknown): void {
    const pending = this.#operations.get(operation);
    if (pending?.key !== key) return;
    if (error === undefined || (error instanceof ContentApiRequestError && !error.retryable)) {
      this.#operations.delete(operation);
    }
  }
}

export async function performContentMutation<T>(input: {
  readonly body: Readonly<Record<string, unknown>>;
  readonly fallbackMessage: string;
  readonly method?: string;
  readonly operation: string;
  readonly pending: PendingContentMutations;
  readonly url: string;
}): Promise<T> {
  const key = input.pending.acquire(input.operation, input.body);
  try {
    const response = await fetch(input.url, {
      body: JSON.stringify({ ...input.body, idempotencyKey: key }),
      headers: { "Content-Type": "application/json" },
      method: input.method ?? "PATCH",
    });
    const result = await readContentResponse<T>(response, input.fallbackMessage);
    input.pending.settle(input.operation, key);
    return result;
  } catch (error) {
    input.pending.settle(input.operation, key, error);
    throw error;
  }
}

export function conflictRecoveryMessage(error: ContentApiRequestError, resource: string): string {
  return error.currentVersion
    ? `${resource} changed elsewhere and is now at version ${String(error.currentVersion)}. Reload the current content before trying again.`
    : `${resource} changed elsewhere. Reload the current content before trying again.`;
}
