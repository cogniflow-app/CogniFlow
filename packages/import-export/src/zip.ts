import { unzipSync, zipSync, type UnzipFileInfo, type Zippable } from "fflate";

import { PortabilityError } from "./errors";
import { DEFAULT_ARCHIVE_LIMITS, type ArchiveLimits, safeArchivePath } from "./safety";

const DETERMINISTIC_ZIP_TIME = new Date("1980-01-02T00:00:00.000Z");

function isSymlinkLike(info: UnzipFileInfo): boolean {
  const attrs = (info as unknown as Readonly<Record<string, unknown>>).attrs;
  return typeof attrs === "number" && ((attrs >>> 16) & 0o170000) === 0o120000;
}

export function safeUnzip(
  bytes: Uint8Array,
  overrides: Partial<ArchiveLimits> = {},
): ReadonlyMap<string, Uint8Array> {
  const limits: ArchiveLimits = Object.freeze({ ...DEFAULT_ARCHIVE_LIMITS, ...overrides });
  if (bytes.byteLength > limits.maxArchiveBytes) {
    throw new PortabilityError("archive_limit", "The archive exceeds the compressed-size limit.");
  }
  const seen = new Set<string>();
  let entryCount = 0;
  let expandedBytes = 0;
  let output: Readonly<Record<string, Uint8Array>>;
  try {
    output = unzipSync(bytes, {
      filter(info) {
        const path = safeArchivePath(info.name, limits);
        if (seen.has(path)) {
          throw new PortabilityError(
            "archive_duplicate_path",
            "The archive contains an ambiguous duplicate path.",
          );
        }
        seen.add(path);
        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw new PortabilityError("archive_limit", "The archive contains too many entries.");
        }
        if (isSymlinkLike(info)) {
          throw new PortabilityError(
            "archive_invalid_path",
            "Symbolic-link archive entries are not supported.",
          );
        }
        const originalSize = info.originalSize;
        const compressedSize = info.size;
        if (originalSize > limits.maxFileBytes) {
          throw new PortabilityError("archive_limit", "An archive entry is too large.");
        }
        expandedBytes += originalSize;
        if (expandedBytes > limits.maxExpandedBytes) {
          throw new PortabilityError("archive_bomb", "The archive expands beyond the safe limit.");
        }
        if (
          originalSize > 0 &&
          (compressedSize === 0 || originalSize / compressedSize > limits.maxCompressionRatio)
        ) {
          throw new PortabilityError(
            "archive_bomb",
            "The archive contains an unsafe compression ratio.",
          );
        }
        return !path.endsWith("/");
      },
    });
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    throw new PortabilityError("invalid_format", "The ZIP archive is invalid or unsupported.");
  }
  const files = new Map<string, Uint8Array>();
  let measured = 0;
  for (const [name, value] of Object.entries(output)) {
    const path = safeArchivePath(name, limits);
    measured += value.byteLength;
    if (value.byteLength > limits.maxFileBytes || measured > limits.maxExpandedBytes) {
      throw new PortabilityError("archive_bomb", "The expanded archive exceeds the safe limit.");
    }
    files.set(path, value);
  }
  return files;
}

export function createZip(
  files: ReadonlyMap<string, Uint8Array> | Readonly<Record<string, Uint8Array>>,
  limits: Partial<ArchiveLimits> = {},
) {
  const resolved: ArchiveLimits = Object.freeze({ ...DEFAULT_ARCHIVE_LIMITS, ...limits });
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);
  if (entries.length > resolved.maxEntries) {
    throw new PortabilityError("archive_limit", "The archive contains too many entries.");
  }
  const zippable: Zippable = {};
  let total = 0;
  for (const [rawPath, bytes] of entries) {
    const path = safeArchivePath(rawPath, resolved);
    if (path in zippable) {
      throw new PortabilityError(
        "archive_duplicate_path",
        "The archive contains an ambiguous duplicate path.",
      );
    }
    total += bytes.byteLength;
    if (bytes.byteLength > resolved.maxFileBytes || total > resolved.maxExpandedBytes) {
      throw new PortabilityError("archive_limit", "The archive input exceeds the safe limit.");
    }
    zippable[path] = [
      bytes,
      {
        level: /\.(?:gif|jpe?g|mp3|mp4|ogg|png|web[mp]|zip)$/iu.test(path) ? 0 : 6,
        mtime: DETERMINISTIC_ZIP_TIME,
      },
    ];
  }
  const archive = zipSync(zippable, {
    level: 6,
    mtime: DETERMINISTIC_ZIP_TIME,
  });
  if (archive.byteLength > resolved.maxArchiveBytes) {
    throw new PortabilityError("archive_limit", "The resulting archive is too large.");
  }
  return archive;
}
