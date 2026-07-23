import type { PortabilityDiagnostic } from "./schemas";

export type PortabilityErrorCode =
  | "archive_bomb"
  | "archive_duplicate_path"
  | "archive_invalid_path"
  | "archive_limit"
  | "cancelled"
  | "checksum_mismatch"
  | "encrypted_archive_invalid"
  | "invalid_encoding"
  | "invalid_format"
  | "invalid_mapping"
  | "invalid_schema"
  | "sqlite_invalid"
  | "unsupported_archive"
  | "unsupported_version";

export class PortabilityError extends Error {
  readonly code: PortabilityErrorCode;
  readonly diagnostics: readonly PortabilityDiagnostic[];

  constructor(
    code: PortabilityErrorCode,
    message: string,
    diagnostics: readonly PortabilityDiagnostic[] = [],
  ) {
    super(message);
    this.name = "PortabilityError";
    this.code = code;
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}
