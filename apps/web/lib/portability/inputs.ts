import {
  conflictPolicySchema,
  delimiterMappingSchema,
  duplicatePolicySchema,
  exportablePortabilityFormatSchema,
  mediaImportPolicySchema,
  progressImportPolicySchema,
  reviewHistoryPolicySchema,
  scheduleImportPolicySchema,
  spreadsheetMappingSchema,
  textMappingSchema,
} from "@lumen/import-export";
import { z } from "zod";

export const portabilityInspectInputSchema = z
  .object({
    adapterCode: z.string().min(1).max(100).optional(),
    archivePassphrase: z.string().min(12).max(1024).optional(),
    declaredMimeType: z.string().max(200).optional(),
    fileName: z.string().min(1).max(255).optional(),
    text: z.string().max(20_000_000),
  })
  .strict();

export const portabilityImportOptionsSchema = z
  .object({
    adapterCode: z.string().min(1).max(100),
    archivePassphrase: z.string().min(12).max(1024).optional(),
    conflictPolicy: conflictPolicySchema.default("create_independent"),
    destinationDeckId: z.string().uuid().optional(),
    destinationDeckTitle: z.string().min(1).max(180).optional(),
    duplicatePolicy: duplicatePolicySchema.default("skip"),
    mapping: delimiterMappingSchema.optional(),
    mediaPolicy: mediaImportPolicySchema.default("copy_verified"),
    progressPolicy: progressImportPolicySchema.default("omit"),
    reviewHistoryPolicy: reviewHistoryPolicySchema.default("omit"),
    schedulePolicy: scheduleImportPolicySchema.default("content_only"),
    spreadsheetMapping: spreadsheetMappingSchema.optional(),
    textMapping: textMappingSchema.optional(),
  })
  .strict();

export const portabilityExportInputSchema = z
  .object({
    adapterCode: z.string().min(1).max(100),
    archivePassphrase: z.string().min(12).max(1024).optional(),
    deckIds: z.array(z.string().uuid()).max(100),
    fileName: z.string().min(1).max(255),
    format: exportablePortabilityFormatSchema,
    includeHistory: z.boolean().default(false),
    includeMedia: z.boolean().default(false),
    includeProgress: z.boolean().default(false),
    privacyExportJobId: z.string().uuid().optional(),
    scope: z.enum(["decks", "complete_account"]).default("decks"),
    unsupportedCardPolicy: z.enum(["cancel", "flatten", "map_closest", "omit"]).default("cancel"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.format === "encrypted_lumen_archive" && !value.archivePassphrase) {
      context.addIssue({
        code: "custom",
        message: "Enter an archive passphrase.",
        path: ["archivePassphrase"],
      });
    }
    if (value.format !== "encrypted_lumen_archive" && value.archivePassphrase) {
      context.addIssue({
        code: "custom",
        message: "A passphrase is used only for encrypted Lumen archives.",
        path: ["archivePassphrase"],
      });
    }
    if (value.scope === "decks" && value.deckIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one deck.",
        path: ["deckIds"],
      });
    }
    if (value.privacyExportJobId && value.scope !== "complete_account") {
      context.addIssue({
        code: "custom",
        message: "A privacy export request requires complete-account scope.",
        path: ["privacyExportJobId"],
      });
    }
  });

export type PortabilityImportOptions = z.infer<typeof portabilityImportOptionsSchema>;
