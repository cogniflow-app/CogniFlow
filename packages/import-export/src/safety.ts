import { PortabilityError } from "./errors";

export const DEFAULT_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxEntries: 2048,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxFileBytes: 64 * 1024 * 1024,
  maxPathBytes: 512,
});

export interface ArchiveLimits {
  readonly maxArchiveBytes: number;
  readonly maxCompressionRatio: number;
  readonly maxEntries: number;
  readonly maxExpandedBytes: number;
  readonly maxFileBytes: number;
  readonly maxPathBytes: number;
}

const forbiddenObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

export function assertSafeJsonValue(
  value: unknown,
  path = "$",
  ancestors = new WeakSet<object>(),
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new PortabilityError("invalid_schema", `${path} is circular.`);
    ancestors.add(value);
    try {
      for (const [index, child] of value.entries()) {
        assertSafeJsonValue(child, `${path}[${String(index)}]`, ancestors);
      }
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new PortabilityError("invalid_schema", `${path} contains an unsupported JSON value.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new PortabilityError("invalid_schema", `${path} must be a plain JSON object.`);
  }
  if (ancestors.has(value)) throw new PortabilityError("invalid_schema", `${path} is circular.`);
  ancestors.add(value);
  try {
    for (const key of Object.keys(value)) {
      if (forbiddenObjectKeys.has(key)) {
        throw new PortabilityError("invalid_schema", `${path} contains a forbidden object key.`);
      }
      assertSafeJsonValue(
        (value as Readonly<Record<string, unknown>>)[key],
        `${path}.${key}`,
        ancestors,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}

export function parseSafeJson(text: string, maximumBytes = 20_000_000): unknown {
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new PortabilityError("archive_limit", "The JSON source exceeds the allowed size.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new PortabilityError("invalid_format", "The JSON source is not valid.");
  }
  assertSafeJsonValue(parsed);
  return parsed;
}

export function canonicalJson(value: unknown): string {
  assertSafeJsonValue(value);
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function sanitizeDiagnosticText(value: unknown, fallback = "The operation failed."): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .normalize("NFKC")
    .replaceAll(/[\u0000-\u001f\u007f]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return (normalized || fallback).slice(0, 500);
}

export function safeArchivePath(name: string, limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS) {
  const normalized = name.normalize("NFC").replaceAll("\\", "/");
  if (
    !normalized ||
    new TextEncoder().encode(normalized).byteLength > limits.maxPathBytes ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes("\0") ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new PortabilityError("archive_invalid_path", "The archive contains an invalid path.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part.length === 0)) {
    throw new PortabilityError(
      "archive_invalid_path",
      "The archive path is not relative and safe.",
    );
  }
  return normalized;
}

export function safeFileName(value: string, fallback = "export") {
  const normalized = value
    .normalize("NFKC")
    .replaceAll(/[^\p{L}\p{N}._ -]+/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/^[. ]+|[. ]+$/gu, "")
    .slice(0, 180);
  return normalized || fallback;
}

export function decodeTextBytes(bytes: Uint8Array): string {
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
  } catch {
    throw new PortabilityError(
      "invalid_encoding",
      "The file must use UTF-8, UTF-16LE, or UTF-16BE text encoding.",
    );
  }
}

export function sourceText(source: {
  readonly bytes?: Uint8Array | undefined;
  readonly text?: string | undefined;
}): string {
  if (source.text !== undefined)
    return source.text.charCodeAt(0) === 0xfeff ? source.text.slice(1) : source.text;
  if (source.bytes !== undefined) return decodeTextBytes(source.bytes);
  throw new PortabilityError("invalid_format", "The source has no readable content.");
}
