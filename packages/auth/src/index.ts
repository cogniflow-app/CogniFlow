export {
  cacheIsolationEventSchema,
  cacheIsolationEventTypes,
  cacheIsolationScopes,
  requiredCacheIsolationScopes,
} from "./cache-isolation";
export type { CacheIsolationEvent, CacheIsolationScope } from "./cache-isolation";

export {
  authorizationCallbackInputSchema,
  emailAddressSchema,
  emailPasswordSignInInputSchema,
  emailPasswordSignUpInputSchema,
  emailVerificationInputSchema,
  magicLinkSignInInputSchema,
  newPasswordSchema,
  passwordCredentialSchema,
  passwordRecoveryRequestInputSchema,
  passwordResetInputSchema,
  pendingAuthAgeGateSchema,
  pendingRecoveryIntentSchema,
  recoverySessionIntentSchema,
  reauthenticationProofSchema,
  reauthenticationRequestSchema,
  signOutInputSchema,
  verifiedOnboardingAgeGateSchema,
} from "./auth-inputs";
export type {
  AuthorizationCallbackInput,
  EmailPasswordSignInInput,
  EmailPasswordSignUpInput,
  EmailVerificationInput,
  MagicLinkSignInInput,
  PasswordRecoveryRequestInput,
  PasswordResetInput,
  PendingAuthAgeGate,
  PendingRecoveryIntent,
  RecoverySessionIntent,
  ReauthenticationProof,
  ReauthenticationRequest,
  SignOutInput,
  VerifiedOnboardingAgeGate,
} from "./auth-inputs";

export { signupAgeBands, signupAgeBandSchema } from "./identity-values";

export { authErrorContexts, mapAuthError } from "./errors";
export type { AuthErrorContext, SafeAuthError, SafeAuthErrorCode } from "./errors";

export {
  guestJoinInputSchema,
  guestReconnectInputSchema,
  guestRoomDescriptorSchema,
  guestRoomStatuses,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  joinCodeSchema,
  resolveGuestRoom,
} from "./guests";
export type {
  GuestJoinInput,
  GuestReconnectInput,
  GuestRoomAdapter,
  GuestRoomDescriptor,
  GuestRoomResolution,
  GuestRoomTestFixture,
} from "./guests";

export {
  customNicknameSchema,
  filterCustomNickname,
  generatedNicknamePattern,
  generateSafeNickname,
  nicknameAdjectives,
  nicknameNouns,
} from "./nicknames";
export type { FilteredNickname, NicknameRejectionReason, RandomBytesSource } from "./nicknames";

export {
  analyticsPreferences,
  cancelDeletionRequestInputSchema,
  dataExportRequestInputSchema,
  deletionRequestInputSchema,
  exportScopes,
  privacyPreferencesSchema,
  privacyRequestInputSchema,
  privacyRequestKinds,
  requestStatusInputSchema,
  updatePrivacyPreferencesInputSchema,
} from "./privacy";
export type {
  CancelDeletionRequestInput,
  DataExportRequestInput,
  DeletionRequestInput,
  PrivacyPreferences,
  PrivacyRequestInput,
  UpdatePrivacyPreferencesInput,
} from "./privacy";

export {
  accountAppearanceInputSchema,
  accountCapabilityNames,
  accountCapabilityNameSchema,
  ageBands,
  ageBandSchema,
  avatarSeedSchema,
  configureProfileAccessInputSchema,
  consentActions,
  consentActionSchema,
  consentScopeSchema,
  consentTypes,
  consentTypeSchema,
  consentVerificationMethods,
  consentVerificationMethodSchema,
  createGuardianManagedLearnerInputSchema,
  createProfileSessionInputSchema,
  createSchoolManagedLearnerInputSchema,
  displayNameSchema,
  familyCodeSchema,
  guardianExitInputSchema,
  guardianRelationshipActionInputSchema,
  guardianRelationshipInputSchema,
  handleSchema,
  learnerAccessRoles,
  learnerAccessRoleSchema,
  learnerKinds,
  learnerKindSchema,
  learnerPinSchema,
  learningGoalNames,
  learningGoalNameSchema,
  learningGoalsSchema,
  localeSchema,
  onboardingAgeGateSelectionInputSchema,
  onboardingDetailsInputSchema,
  onboardingInputSchema,
  profilePreferencesSchema,
  pseudonymSchema,
  recordConsentInputSchema,
  resolveNeutralAgeOutcome,
  revokeConsentInputSchema,
  revokeDeviceProfileSessionsInputSchema,
  revokeProfileSessionInputSchema,
  selfOnboardingAgeBandSchema,
  studyDayStartMinutesSchema,
  themePreferences,
  timeZoneSchema,
  updateAccountProfileInputSchema,
  updateLearnerProfileInputSchema,
} from "./profiles";
export type {
  AccountAppearanceInput,
  AccountCapabilityName,
  AgeBand,
  ConfigureProfileAccessInput,
  CreateGuardianManagedLearnerInput,
  CreateProfileSessionInput,
  CreateSchoolManagedLearnerInput,
  GuardianExitInput,
  GuardianRelationshipActionInput,
  GuardianRelationshipInput,
  LearnerAccessRole,
  LearnerKind,
  NeutralAgeOutcome,
  OnboardingAgeGateSelectionInput,
  OnboardingDetailsInput,
  OnboardingInput,
  ProfilePreferences,
  RecordConsentInput,
  RevokeConsentInput,
  RevokeDeviceProfileSessionsInput,
  RevokeProfileSessionInput,
  UpdateAccountProfileInput,
  UpdateLearnerProfileInput,
} from "./profiles";

export {
  authProviderConfigurationSchema,
  authProviderNames,
  authProviderNameSchema,
  configuredAuthProviders,
  createPublicAuthProviderDescriptors,
  oauthProviderNames,
  oauthProviderNameSchema,
  publicAuthProviderDescriptorSchema,
} from "./providers";
export type {
  AuthProviderConfiguration,
  AuthProviderName,
  OAuthProviderName,
  PublicAuthProviderDescriptor,
} from "./providers";

export {
  DEFAULT_RETURN_URL,
  isSafeAuthenticationReturnUrl,
  isSafeRelativeReturnUrl,
  MAX_RETURN_URL_LENGTH,
  normalizeAuthenticationReturnUrl,
  normalizeReturnUrl,
  returnUrlInputSchema,
} from "./redirects";
