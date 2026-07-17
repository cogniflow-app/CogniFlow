export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ValidationSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ValidationFailure {
  readonly success: false;
  readonly issues: readonly ValidationIssue[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface RuntimeSchema<T> {
  readonly name: string;
  parse(input: unknown): T;
  safeParse(input: unknown): ValidationResult<T>;
}

export class DomainValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(schemaName: string, issues: readonly ValidationIssue[]) {
    super(`Invalid ${schemaName}: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "DomainValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export type SchemaParser<T> = (
  input: unknown,
  path: string,
  issues: ValidationIssue[],
) => T | undefined;

export function createRuntimeSchema<T>(name: string, parser: SchemaParser<T>): RuntimeSchema<T> {
  const safeParse = (input: unknown): ValidationResult<T> => {
    const issues: ValidationIssue[] = [];
    const data = parser(input, "$", issues);

    return data === undefined || issues.length > 0
      ? { success: false, issues: Object.freeze(issues) }
      : { success: true, data };
  };

  return Object.freeze({
    name,
    safeParse,
    parse(input: unknown): T {
      const result = safeParse(input);
      if (!result.success) {
        throw new DomainValidationError(name, result.issues);
      }
      return result.data;
    },
  });
}

export function issue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
): undefined {
  issues.push({ path, code, message });
  return undefined;
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecord(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): Readonly<Record<string, unknown>> | undefined {
  return isRecord(input) ? input : issue(issues, path, "invalid_type", "Expected an object");
}

export interface StringBounds {
  readonly min?: number;
  readonly max?: number;
  readonly trim?: boolean;
  readonly pattern?: RegExp;
}

export function readString(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
  bounds: StringBounds = {},
): string | undefined {
  if (typeof input !== "string") {
    return issue(issues, path, "invalid_type", "Expected a string");
  }

  const value = bounds.trim === false ? input : input.trim();
  const minimum = bounds.min ?? 0;
  const maximum = bounds.max ?? Number.POSITIVE_INFINITY;

  if (value.length < minimum || value.length > maximum) {
    return issue(
      issues,
      path,
      "invalid_length",
      `Expected between ${minimum} and ${String(maximum)} characters`,
    );
  }
  if (bounds.pattern && !bounds.pattern.test(value)) {
    return issue(issues, path, "invalid_format", "String has an invalid format");
  }
  return value;
}

export function readBoolean(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): boolean | undefined {
  return typeof input === "boolean"
    ? input
    : issue(issues, path, "invalid_type", "Expected a boolean");
}

export interface NumberBounds {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export function readNumber(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
  bounds: NumberBounds = {},
): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return issue(issues, path, "invalid_type", "Expected a finite number");
  }
  if (bounds.integer && !Number.isInteger(input)) {
    return issue(issues, path, "invalid_integer", "Expected an integer");
  }
  if (bounds.min !== undefined && input < bounds.min) {
    return issue(issues, path, "too_small", `Expected a value of at least ${bounds.min}`);
  }
  if (bounds.max !== undefined && input > bounds.max) {
    return issue(issues, path, "too_large", `Expected a value of at most ${bounds.max}`);
  }
  return input;
}

export function readLiteral<T extends string | number | boolean>(
  input: unknown,
  literal: T,
  path: string,
  issues: ValidationIssue[],
): T | undefined {
  return input === literal
    ? literal
    : issue(issues, path, "invalid_literal", `Expected ${JSON.stringify(literal)}`);
}

export function readOneOf<const T extends readonly string[]>(
  input: unknown,
  values: T,
  path: string,
  issues: ValidationIssue[],
): T[number] | undefined {
  if (typeof input === "string" && (values as readonly string[]).includes(input)) {
    return input as T[number];
  }
  return issue(issues, path, "invalid_choice", `Expected one of: ${values.join(", ")}`);
}

export function readArray<T>(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
  parser: SchemaParser<T>,
  bounds: { readonly min?: number; readonly max?: number } = {},
): readonly T[] | undefined {
  if (!Array.isArray(input)) {
    return issue(issues, path, "invalid_type", "Expected an array");
  }
  if (input.length < (bounds.min ?? 0) || input.length > (bounds.max ?? 10_000)) {
    return issue(
      issues,
      path,
      "invalid_length",
      `Expected between ${bounds.min ?? 0} and ${bounds.max ?? 10_000} items`,
    );
  }

  const values: T[] = [];
  for (const [index, value] of input.entries()) {
    const parsed = parser(value, `${path}[${index}]`, issues);
    if (parsed !== undefined) {
      values.push(parsed);
    }
  }
  return values;
}

export function hasOnlyKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): boolean {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !allowedKeys.has(key));
  for (const key of unknown) {
    issue(issues, `${path}.${key}`, "unknown_key", `Unknown property ${JSON.stringify(key)}`);
  }
  return unknown.length === 0;
}

export function optional<T>(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
  parser: SchemaParser<T>,
): T | undefined {
  return input === undefined ? undefined : parser(input, path, issues);
}

export function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

/** A deterministic, non-cryptographic fingerprint for change detection and test fixtures. */
export function contentFingerprint(value: unknown): string {
  const input = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
