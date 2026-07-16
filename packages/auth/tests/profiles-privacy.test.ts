import { describe, expect, it } from "vitest";

import {
  accountCapabilityNames,
  configureProfileAccessInputSchema,
  consentActions,
  consentTypes,
  consentVerificationMethods,
  createGuardianManagedLearnerInputSchema,
  createProfileSessionInputSchema,
  familyCodeSchema,
  guardianExitInputSchema,
  handleSchema,
  onboardingAgeGateSelectionInputSchema,
  onboardingDetailsInputSchema,
  onboardingInputSchema,
  recordConsentInputSchema,
  resolveNeutralAgeOutcome,
  revokeConsentInputSchema,
  revokeDeviceProfileSessionsInputSchema,
  revokeProfileSessionInputSchema,
  timeZoneSchema,
  updateAccountProfileInputSchema,
} from "../src/profiles";
import {
  cancelDeletionRequestInputSchema,
  dataExportRequestInputSchema,
  deletionRequestInputSchema,
  exportScopes,
  privacyPreferencesSchema,
  privacyRequestKinds,
  updatePrivacyPreferencesInputSchema,
} from "../src/privacy";

const accountId = "11111111-1111-4111-8111-111111111111";
const learnerProfileId = "22222222-2222-4222-8222-222222222222";
const preferences = {
  theme: "system",
  reduceMotion: false,
  seriousMode: false,
  readingStyle: "standard",
} as const;

describe("profile and onboarding inputs", () => {
  it("normalizes handles and rejects reserved routes", () => {
    expect(handleSchema.parse("  Recall_Reader ")).toBe("recall_reader");
    expect(handleSchema.safeParse("admin").success).toBe(false);
  });

  it("keeps authorization enums identical to the database enum values", () => {
    expect(accountCapabilityNames).toEqual(["learn", "create", "host", "teach"]);
    expect(consentTypes).toEqual([
      "guardian_account",
      "child_profile",
      "analytics",
      "public_content",
      "ai_processing",
    ]);
    expect(consentActions).toEqual(["granted", "revoked"]);
    expect(consentVerificationMethods).toEqual([
      "not_verified",
      "local_test",
      "verified_external",
      "school_authorization",
    ]);
  });

  it("validates IANA time zones", () => {
    expect(timeZoneSchema.parse("America/Chicago")).toBe("America/Chicago");
    expect(timeZoneSchema.safeParse("Central Time Somewhere").success).toBe(false);
  });

  it("accepts only teen or adult completion of independent onboarding", () => {
    const base = {
      displayName: "Avery Learner",
      handle: "avery_learner",
      locale: "en-US",
      timeZone: "America/Chicago",
      studyDayStartMinutes: 240,
      learningGoals: ["long_term_retention"],
      preferences,
    } as const;

    expect(onboardingInputSchema.safeParse({ ...base, ageBand: "adult" }).success).toBe(true);
    expect(onboardingInputSchema.safeParse({ ...base, ageBand: "under_13" }).success).toBe(false);
    expect(
      onboardingInputSchema.safeParse({
        ...base,
        ageBand: "adult",
        exactBirthDate: "2000-01-01",
      }).success,
    ).toBe(false);
    expect(onboardingDetailsInputSchema.safeParse(base).success).toBe(true);
    expect(onboardingDetailsInputSchema.safeParse({ ...base, ageBand: "adult" }).success).toBe(
      false,
    );
    expect(
      onboardingAgeGateSelectionInputSchema.parse({
        ageBand: "teen",
        returnTo: "https://attacker.example/steal",
      }),
    ).toEqual({ ageBand: "teen", returnTo: "/app" });
  });

  it("validates bounded, unique learning-goal updates", () => {
    expect(
      updateAccountProfileInputSchema.parse({
        learningGoals: ["long_term_retention", "exam_preparation"],
      }),
    ).toEqual({ learningGoals: ["long_term_retention", "exam_preparation"] });
    expect(
      updateAccountProfileInputSchema.safeParse({
        learningGoals: ["long_term_retention", "long_term_retention"],
      }).success,
    ).toBe(false);
    expect(
      updateAccountProfileInputSchema.safeParse({ learningGoals: ["unsupported_goal"] }).success,
    ).toBe(false);
  });

  it("returns neutral, capability-aware age outcomes", () => {
    expect(resolveNeutralAgeOutcome("adult", { childProfiles: false })).toEqual({
      kind: "self_eligible",
      canCreateIndependentAccount: true,
    });
    expect(resolveNeutralAgeOutcome("under_13", { childProfiles: true })).toEqual({
      kind: "guardian_managed",
      canCreateIndependentAccount: false,
    });
    expect(resolveNeutralAgeOutcome("under_13", { childProfiles: false })).toEqual({
      kind: "child_profiles_unavailable",
      canCreateIndependentAccount: false,
    });
    expect(resolveNeutralAgeOutcome("unknown", { childProfiles: true })).toEqual({
      kind: "selection_required",
      canCreateIndependentAccount: false,
    });
  });

  it("creates a managed learner without accepting a child email", () => {
    const input = {
      displayName: "River",
      pseudonym: "River Otter",
      ageBand: "under_13",
      avatarSeed: "river-01",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      preferences,
    } as const;

    expect(createGuardianManagedLearnerInputSchema.parse(input)).toEqual(input);
    expect(
      createGuardianManagedLearnerInputSchema.safeParse({
        ...input,
        email: "child@example.com",
      }).success,
    ).toBe(false);
  });

  it("normalizes unambiguous family codes", () => {
    expect(familyCodeSchema.parse("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(familyCodeSchema.safeParse("ABCD-EFGH-I0O1-2345").success).toBe(false);
  });

  it("matches the profile-access route and database lock window", () => {
    const input = {
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      learnerProfileId,
      lockAfterMinutes: 15,
      password: "current-password",
      pin: "829461",
      pinConfirmation: "829461",
    } as const;

    expect(configureProfileAccessInputSchema.safeParse(input).success).toBe(true);
    expect(
      configureProfileAccessInputSchema.safeParse({
        ...input,
        lockAfterMinutes: 4,
      }).success,
    ).toBe(false);
    expect(
      configureProfileAccessInputSchema.safeParse({
        ...input,
        pin: "111111",
        pinConfirmation: "111111",
      }).success,
    ).toBe(false);
  });

  it("models route payloads without accepting server-derived device or proof fields", () => {
    expect(
      createProfileSessionInputSchema.parse({
        familyCode: "ABCDEFGHJKMNPQRS",
        learnerProfileId,
        pin: "829461",
      }),
    ).toEqual({
      familyCode: "ABCDEFGHJKMNPQRS",
      learnerProfileId,
      pin: "829461",
    });
    expect(
      createProfileSessionInputSchema.safeParse({
        credential: { kind: "profile_session_token", token: "client-token-is-not-accepted" },
        deviceId: accountId,
        learnerProfileId,
      }).success,
    ).toBe(false);

    expect(guardianExitInputSchema.safeParse({ password: "current-password" }).success).toBe(true);
    expect(
      revokeDeviceProfileSessionsInputSchema.safeParse({
        deviceId: accountId,
        password: "current-password",
      }).success,
    ).toBe(true);
    expect(
      revokeProfileSessionInputSchema.safeParse({
        password: "current-password",
        profileSessionId: learnerProfileId,
      }).success,
    ).toBe(true);
  });

  it("matches the consent ledger contract and requires evidence for verified methods", () => {
    const valid = {
      evidenceReference: "local-test:verified-evidence",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      learnerProfileId,
      consentType: "child_profile",
      policyVersion: "privacy-2026.07",
      scope: {
        age_band: "under_13",
        analytics: "minimized",
        child_profile: true,
        public_content: false,
      },
      verificationMethod: "local_test",
    } as const;

    expect(recordConsentInputSchema.safeParse(valid).success).toBe(true);
    expect(
      recordConsentInputSchema.safeParse({
        ...valid,
        evidenceReference: null,
      }).success,
    ).toBe(false);
    expect(
      recordConsentInputSchema.safeParse({
        ...valid,
        consentChecked: true,
      }).success,
    ).toBe(false);
    expect(
      revokeConsentInputSchema.parse({
        consentRecordId: learnerProfileId,
        password: "current-password",
        reason: "  No longer needed  ",
      }),
    ).toEqual({
      consentRecordId: learnerProfileId,
      password: "current-password",
      reason: "No longer needed",
    });
  });
});

describe("privacy and destructive request inputs", () => {
  it("uses explicit privacy defaults with no advertising option", () => {
    expect(
      privacyPreferencesSchema.parse({
        analytics: "essential_only",
        allowProductUpdates: false,
        allowSocialInteractions: false,
        defaultContentPrivate: true,
      }),
    ).toEqual({
      analytics: "essential_only",
      allowProductUpdates: false,
      allowSocialInteractions: false,
      defaultContentPrivate: true,
    });
  });

  it("keeps privacy request kinds aligned with the database and the account route", () => {
    expect(privacyRequestKinds).toEqual(["access", "export", "deletion", "correction"]);
    expect(exportScopes).toEqual(["complete_account"]);
    expect(
      updatePrivacyPreferencesInputSchema.safeParse({
        preferences: {
          analytics: "essential_only",
          allowProductUpdates: false,
          allowSocialInteractions: false,
          defaultContentPrivate: true,
        },
        target: { kind: "learner_profile", learnerProfileId },
      }).success,
    ).toBe(false);
  });

  it("validates an export request without pretending the archive is already available", () => {
    expect(
      dataExportRequestInputSchema.parse({ scope: "complete_account", format: "json_archive" }),
    ).toEqual({ scope: "complete_account", format: "json_archive" });
  });

  it("matches the password-based deletion route and requires an explicit phrase", () => {
    expect(
      deletionRequestInputSchema.safeParse({
        confirmationPhrase: "DELETE MY ACCOUNT",
        password: "current-password",
      }).success,
    ).toBe(true);
    expect(
      deletionRequestInputSchema.safeParse({
        confirmationPhrase: "DELETE MY ACCOUNT",
        password: "current-password",
        reason: "ignored-client-reason",
      }).success,
    ).toBe(false);
  });

  it("requires a job identifier and password to cancel deletion", () => {
    expect(
      cancelDeletionRequestInputSchema.safeParse({
        deletionJobId: accountId,
        password: "current-password",
      }).success,
    ).toBe(true);
  });
});
