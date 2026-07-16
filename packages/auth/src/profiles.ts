import { z } from "zod";

import { passwordCredentialSchema, reauthenticationProofSchema } from "./auth-inputs";
import {
  ageBands,
  ageBandSchema,
  selfOnboardingAgeBandSchema,
  type AgeBand,
} from "./identity-values";
import {
  containsUnsafeText,
  normalizeHumanText,
  opaqueTokenSchema,
  policyVersionSchema,
  uuidSchema,
} from "./primitives";
import { returnUrlInputSchema } from "./redirects";

export const learnerKinds = ["self", "child", "school_managed"] as const;
export const learnerAccessRoles = ["self", "guardian", "teacher_observer", "school_admin"] as const;
export const accountCapabilityNames = ["learn", "create", "host", "teach"] as const;
export const learningGoalNames = [
  "long_term_retention",
  "exam_preparation",
  "language_learning",
  "professional_certification",
  "classroom_learning",
] as const;
export const themePreferences = ["light", "dark", "system"] as const;

export const learnerKindSchema = z.enum(learnerKinds);
export const learnerAccessRoleSchema = z.enum(learnerAccessRoles);
export const accountCapabilityNameSchema = z.enum(accountCapabilityNames);
export const learningGoalNameSchema = z.enum(learningGoalNames);
export const learningGoalsSchema = z
  .array(learningGoalNameSchema)
  .max(learningGoalNames.length)
  .refine((goals) => new Set(goals).size === goals.length, "Learning goals must be unique");

const reservedHandles = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "copyright",
  "help",
  "join",
  "moderator",
  "privacy",
  "root",
  "safety",
  "support",
  "system",
  "terms",
]);

export const displayNameSchema = z
  .string()
  .max(240)
  .refine((value) => !containsUnsafeText(value), "Display name contains unsupported characters")
  .transform(normalizeHumanText)
  .pipe(z.string().min(1).max(80));

export const pseudonymSchema = z
  .string()
  .max(120)
  .refine((value) => !containsUnsafeText(value), "Pseudonym contains unsupported characters")
  .transform(normalizeHumanText)
  .pipe(z.string().min(2).max(40));

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(
    /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/u,
    "Use lowercase letters, numbers, and internal underscores",
  )
  .refine((value) => !reservedHandles.has(value), "This handle is reserved");

export const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u, "Use a valid locale tag");

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA time zone");

export const studyDayStartMinutesSchema = z.number().int().min(0).max(1439);
export const avatarSeedSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/u, "Avatar seed contains unsupported characters");

export const profilePreferencesSchema = z
  .object({
    theme: z.enum(themePreferences),
    reduceMotion: z.boolean(),
    seriousMode: z.boolean(),
    readingStyle: z.enum(["standard", "increased_spacing"]),
  })
  .strict();

export const onboardingInputSchema = z
  .object({
    displayName: displayNameSchema,
    handle: handleSchema,
    locale: localeSchema,
    timeZone: timeZoneSchema,
    studyDayStartMinutes: studyDayStartMinutesSchema,
    ageBand: selfOnboardingAgeBandSchema,
    learningGoals: learningGoalsSchema.default([]),
    preferences: profilePreferencesSchema,
  })
  .strict();

/** Age is supplied from a server-verified onboarding gate, never this request body. */
export const onboardingDetailsInputSchema = onboardingInputSchema.omit({ ageBand: true }).strict();

export const onboardingAgeGateSelectionInputSchema = z
  .object({
    ageBand: z.enum(["under_13", "teen", "adult"]),
    returnTo: returnUrlInputSchema,
  })
  .strict();

export const updateAccountProfileInputSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    handle: handleSchema.optional(),
    locale: localeSchema.optional(),
    timeZone: timeZoneSchema.optional(),
    studyDayStartMinutes: studyDayStartMinutesSchema.optional(),
    learningGoals: learningGoalsSchema.optional(),
    preferences: profilePreferencesSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "Provide at least one profile change");

const guardianManagedAgeBandSchema = z.enum(["under_13", "teen"]);

const managedLearnerBaseSchema = z
  .object({
    displayName: displayNameSchema,
    pseudonym: pseudonymSchema,
    ageBand: guardianManagedAgeBandSchema,
    avatarSeed: avatarSeedSchema,
    preferences: profilePreferencesSchema,
  })
  .strict();

export const createGuardianManagedLearnerInputSchema = managedLearnerBaseSchema
  .extend({ idempotencyKey: uuidSchema })
  .strict();

export const createSchoolManagedLearnerInputSchema = managedLearnerBaseSchema
  .extend({
    idempotencyKey: uuidSchema,
    ownerAccountId: uuidSchema,
    schoolAuthorizationProof: opaqueTokenSchema,
  })
  .strict();

export const updateLearnerProfileInputSchema = z
  .object({
    learnerProfileId: uuidSchema,
    displayName: displayNameSchema.optional(),
    pseudonym: pseudonymSchema.optional(),
    avatarSeed: avatarSeedSchema.optional(),
    preferences: profilePreferencesSchema.optional(),
  })
  .strict()
  .refine(
    ({ learnerProfileId: _learnerProfileId, ...changes }) => Object.keys(changes).length > 0,
    "Provide at least one learner-profile change",
  );

export const learnerPinSchema = z
  .string()
  .regex(/^\d{6,12}$/u, "Use a 6–12 digit PIN")
  .refine((value) => !/^(\d)\1+$/u.test(value), "Choose a less predictable PIN")
  .refine(
    (value) => !["123456", "654321", "012345", "543210"].includes(value),
    "Choose a less predictable PIN",
  );

export const familyCodeSchema = z
  .string()
  .trim()
  .max(32)
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]+/gu, ""))
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{16}$/u, "Enter a valid family code"));

export const configureProfileAccessInputSchema = z
  .object({
    idempotencyKey: uuidSchema,
    learnerProfileId: uuidSchema,
    lockAfterMinutes: z.number().int().min(5).max(30),
    password: passwordCredentialSchema,
    pin: learnerPinSchema,
    pinConfirmation: learnerPinSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.pin !== input.pinConfirmation) {
      context.addIssue({
        code: "custom",
        message: "PINs do not match",
        path: ["pinConfirmation"],
      });
    }
  });

export const createProfileSessionInputSchema = z
  .object({
    familyCode: familyCodeSchema,
    learnerProfileId: uuidSchema,
    pin: learnerPinSchema,
  })
  .strict();

export const revokeProfileSessionInputSchema = z
  .object({
    password: passwordCredentialSchema,
    profileSessionId: uuidSchema,
  })
  .strict();

export const guardianExitInputSchema = z
  .object({
    password: passwordCredentialSchema,
  })
  .strict();

export const revokeDeviceProfileSessionsInputSchema = z
  .object({
    deviceId: uuidSchema,
    password: passwordCredentialSchema,
  })
  .strict();

export const guardianRelationshipInputSchema = z
  .object({
    learnerProfileId: uuidSchema,
    guardianAccountId: uuidSchema,
    role: z.literal("guardian"),
  })
  .strict();

export const guardianRelationshipActionInputSchema = z
  .object({
    relationshipId: uuidSchema,
    action: z.enum(["accept", "revoke"]),
    reauthentication: reauthenticationProofSchema,
  })
  .strict();

export const consentTypes = [
  "guardian_account",
  "child_profile",
  "analytics",
  "public_content",
  "ai_processing",
] as const;
export const consentActions = ["granted", "revoked"] as const;
export const consentVerificationMethods = [
  "not_verified",
  "local_test",
  "verified_external",
  "school_authorization",
] as const;

export const consentTypeSchema = z.enum(consentTypes);
export const consentActionSchema = z.enum(consentActions);
export const consentVerificationMethodSchema = z.enum(consentVerificationMethods);
export const consentScopeSchema = z
  .record(z.string().min(1).max(80), z.json())
  .refine((scope) => Object.keys(scope).length <= 20, "Consent scope has too many fields");

export const recordConsentInputSchema = z
  .object({
    evidenceReference: z.string().trim().min(8).max(256).nullable(),
    idempotencyKey: uuidSchema,
    learnerProfileId: uuidSchema,
    consentType: consentTypeSchema,
    policyVersion: policyVersionSchema,
    scope: consentScopeSchema,
    verificationMethod: consentVerificationMethodSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.verificationMethod === "not_verified" && input.evidenceReference !== null) {
      context.addIssue({
        code: "custom",
        message: "Unverified consent cannot carry verified evidence",
        path: ["evidenceReference"],
      });
    }
    if (input.verificationMethod !== "not_verified" && input.evidenceReference === null) {
      context.addIssue({
        code: "custom",
        message: "Verified consent requires an evidence reference",
        path: ["evidenceReference"],
      });
    }
  });

export const revokeConsentInputSchema = z
  .object({
    consentRecordId: uuidSchema,
    password: passwordCredentialSchema,
    reason: z
      .string()
      .max(1000)
      .refine((reason) => !containsUnsafeText(reason), "Reason contains unsupported characters")
      .transform(normalizeHumanText)
      .pipe(z.string().max(500))
      .transform((reason) => reason || undefined)
      .optional(),
  })
  .strict();

export type LearnerKind = z.infer<typeof learnerKindSchema>;
export type LearnerAccessRole = z.infer<typeof learnerAccessRoleSchema>;
export type AccountCapabilityName = z.infer<typeof accountCapabilityNameSchema>;
export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export type OnboardingDetailsInput = z.infer<typeof onboardingDetailsInputSchema>;
export type OnboardingAgeGateSelectionInput = z.infer<typeof onboardingAgeGateSelectionInputSchema>;
export type UpdateAccountProfileInput = z.infer<typeof updateAccountProfileInputSchema>;
export type CreateGuardianManagedLearnerInput = z.infer<
  typeof createGuardianManagedLearnerInputSchema
>;
export type CreateSchoolManagedLearnerInput = z.infer<typeof createSchoolManagedLearnerInputSchema>;
export type CreateProfileSessionInput = z.infer<typeof createProfileSessionInputSchema>;
export type UpdateLearnerProfileInput = z.infer<typeof updateLearnerProfileInputSchema>;
export type ConfigureProfileAccessInput = z.infer<typeof configureProfileAccessInputSchema>;
export type RevokeProfileSessionInput = z.infer<typeof revokeProfileSessionInputSchema>;
export type GuardianExitInput = z.infer<typeof guardianExitInputSchema>;
export type RevokeDeviceProfileSessionsInput = z.infer<
  typeof revokeDeviceProfileSessionsInputSchema
>;
export type GuardianRelationshipInput = z.infer<typeof guardianRelationshipInputSchema>;
export type GuardianRelationshipActionInput = z.infer<typeof guardianRelationshipActionInputSchema>;
export type RecordConsentInput = z.infer<typeof recordConsentInputSchema>;
export type RevokeConsentInput = z.infer<typeof revokeConsentInputSchema>;

export type NeutralAgeOutcome =
  | { readonly kind: "self_eligible"; readonly canCreateIndependentAccount: true }
  | { readonly kind: "guardian_managed"; readonly canCreateIndependentAccount: false }
  | { readonly kind: "child_profiles_unavailable"; readonly canCreateIndependentAccount: false }
  | { readonly kind: "selection_required"; readonly canCreateIndependentAccount: false };

/** This is presentation guidance only; authorization still belongs at the server/database boundary. */
export function resolveNeutralAgeOutcome(
  ageBand: AgeBand,
  capabilities: Readonly<{ childProfiles: boolean }>,
): NeutralAgeOutcome {
  if (ageBand === "teen" || ageBand === "adult") {
    return Object.freeze({ kind: "self_eligible", canCreateIndependentAccount: true });
  }

  if (ageBand === "under_13") {
    return Object.freeze({
      kind: capabilities.childProfiles ? "guardian_managed" : "child_profiles_unavailable",
      canCreateIndependentAccount: false,
    });
  }

  return Object.freeze({ kind: "selection_required", canCreateIndependentAccount: false });
}

export { ageBands, ageBandSchema, selfOnboardingAgeBandSchema };
export type { AgeBand };
