import { z } from "zod";

const unsafeTextPattern = /[\p{Cc}\p{Cf}]/u;

export const uuidSchema = z.uuid();

export const opaqueTokenSchema = z
  .string()
  .min(16)
  .max(4096)
  .refine((value) => !unsafeTextPattern.test(value), "Token contains unsupported characters");

export const policyVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, "Use a version identifier");

export const optionalReasonSchema = z
  .string()
  .refine((value) => !unsafeTextPattern.test(value), "Reason contains unsupported characters")
  .trim()
  .max(240)
  .optional();

export function normalizeHumanText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function containsUnsafeText(value: string): boolean {
  return unsafeTextPattern.test(value);
}
