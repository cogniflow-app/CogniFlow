import { z } from "zod";

const BASE_ORIGIN = "https://return.invalid";
const DEFAULT_RETURN_URL = "/app";
const MAX_RETURN_URL_LENGTH = 2048;
const encodedControlPattern = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu;
const literalControlPattern = /[\p{Cc}\p{Cf}]/u;

function decodesToNavigationHazard(value: string): boolean {
  let decoded = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }

    if (decoded.startsWith("//") || decoded.includes("\\") || literalControlPattern.test(decoded)) {
      return true;
    }
  }

  return false;
}

function parseSafeRelativeReturnUrl(value: string): string | null {
  const candidate = value.trim();

  if (
    candidate.length === 0 ||
    candidate.length > MAX_RETURN_URL_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    literalControlPattern.test(candidate) ||
    encodedControlPattern.test(candidate) ||
    decodesToNavigationHazard(candidate)
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, BASE_ORIGIN);
    if (parsed.origin !== BASE_ORIGIN || parsed.username || parsed.password) return null;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (
      normalized.startsWith("//") ||
      normalized.includes("\\") ||
      literalControlPattern.test(normalized) ||
      decodesToNavigationHazard(normalized)
    ) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function isSafeRelativeReturnUrl(value: unknown): value is string {
  return typeof value === "string" && parseSafeRelativeReturnUrl(value) !== null;
}

/**
 * Converts an untrusted return destination to a same-origin relative URL.
 * Absolute, protocol-relative, malformed, and encoded navigation hazards
 * resolve to the supplied safe fallback.
 */
export function normalizeReturnUrl(value: unknown, fallback: string = DEFAULT_RETURN_URL): string {
  const safeFallback = parseSafeRelativeReturnUrl(fallback) ?? DEFAULT_RETURN_URL;
  return typeof value === "string"
    ? (parseSafeRelativeReturnUrl(value) ?? safeFallback)
    : safeFallback;
}

export const returnUrlInputSchema = z
  .unknown()
  .optional()
  .transform((value) => normalizeReturnUrl(value));

export { DEFAULT_RETURN_URL, MAX_RETURN_URL_LENGTH };
