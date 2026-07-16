import "server-only";

import type { Json } from "@lumen/database";

type NullableRpcScalar = boolean | number | string;

/**
 * Supabase's generated RPC input types do not retain nullable SQL parameter
 * metadata. This helper keeps the runtime `null` while containing that type
 * impedance mismatch at the database boundary.
 */
export function nullableRpcArgument<T extends NullableRpcScalar>(value: T | null): T {
  return value as T;
}

/** Convert an already validated domain value into Postgres JSON without a blind cast. */
export function toDatabaseJson(value: unknown): Json {
  return convertJson(value, new WeakSet<object>(), "$input");
}

function convertJson(value: unknown, ancestors: WeakSet<object>, path: string): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference.`);
    ancestors.add(value);
    try {
      return value.map((item, index) => convertJson(item, ancestors, `${path}[${String(index)}]`));
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value !== "object" || value === undefined) {
    throw new TypeError(`${path} contains a value that JSON cannot represent.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must contain only plain JSON objects.`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference.`);
  ancestors.add(value);
  try {
    const result: Record<string, Json | undefined> = {};
    for (const [key, child] of Object.entries(value)) {
      // Matches JSON.stringify/Postgres JSON object semantics for optional fields.
      if (child !== undefined) result[key] = convertJson(child, ancestors, `${path}.${key}`);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}
