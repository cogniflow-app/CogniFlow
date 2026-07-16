import { z } from "zod";

import { passwordCredentialSchema } from "./auth-inputs";
import { containsUnsafeText, normalizeHumanText, uuidSchema } from "./primitives";

export const analyticsPreferences = ["essential_only", "first_party_product"] as const;
export const privacyRequestKinds = ["access", "export", "deletion", "correction"] as const;
export const exportScopes = ["complete_account"] as const;

export const privacyPreferencesSchema = z
  .object({
    analytics: z.enum(analyticsPreferences),
    allowProductUpdates: z.boolean(),
    allowSocialInteractions: z.boolean(),
    defaultContentPrivate: z.boolean(),
  })
  .strict();

const privacyPreferenceTargetSchema = z.object({ kind: z.literal("account") }).strict();

export const updatePrivacyPreferencesInputSchema = z
  .object({
    target: privacyPreferenceTargetSchema,
    preferences: privacyPreferencesSchema,
  })
  .strict();

const privacyRequestDetailsSchema = z
  .string()
  .max(1000)
  .refine((value) => !containsUnsafeText(value), "Details contain unsupported characters")
  .transform(normalizeHumanText)
  .pipe(z.string().min(1).max(500));

export const privacyRequestInputSchema = z
  .object({
    kind: z.enum(privacyRequestKinds),
    details: privacyRequestDetailsSchema.optional(),
  })
  .strict();

export const dataExportRequestInputSchema = z
  .object({
    scope: z.enum(exportScopes),
    format: z.literal("json_archive"),
  })
  .strict();

export const deletionRequestInputSchema = z
  .object({
    confirmationPhrase: z.literal("DELETE MY ACCOUNT"),
    password: passwordCredentialSchema,
  })
  .strict();

export const cancelDeletionRequestInputSchema = z
  .object({
    deletionJobId: uuidSchema,
    password: passwordCredentialSchema,
  })
  .strict();

export const requestStatusInputSchema = z
  .object({
    requestId: uuidSchema,
  })
  .strict();

export type PrivacyPreferences = z.infer<typeof privacyPreferencesSchema>;
export type UpdatePrivacyPreferencesInput = z.infer<typeof updatePrivacyPreferencesInputSchema>;
export type PrivacyRequestInput = z.infer<typeof privacyRequestInputSchema>;
export type DataExportRequestInput = z.infer<typeof dataExportRequestInputSchema>;
export type DeletionRequestInput = z.infer<typeof deletionRequestInputSchema>;
export type CancelDeletionRequestInput = z.infer<typeof cancelDeletionRequestInputSchema>;
