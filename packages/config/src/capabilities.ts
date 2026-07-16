import type {
  DeploymentProfile,
  OAuthProvider,
  ParentalConsentMode,
  PrivacyRetentionConfiguration,
  ServerEnvironment,
} from "./server-environment-parser";

export interface ServerCapabilities {
  readonly deploymentProfile: DeploymentProfile;
  readonly childProfiles: boolean;
  readonly publicChildContent: boolean;
  readonly freeTextGameChat: boolean;
  readonly emailConfirmationRequired: boolean;
  readonly oauthProviders: readonly OAuthProvider[];
  readonly privacyRetention: PrivacyRetentionConfiguration;
  readonly parentalConsentMode: ParentalConsentMode;
  readonly childConsentReady: boolean;
  readonly privilegedDatabaseAccess: boolean;
}

export interface PublicCapabilities {
  readonly deploymentProfile: DeploymentProfile;
  readonly childProfiles: boolean;
  readonly publicChildContent: boolean;
  readonly freeTextGameChat: boolean;
  readonly emailConfirmationRequired: boolean;
  readonly oauthProviders: readonly OAuthProvider[];
  readonly privacyRetention: PrivacyRetentionConfiguration;
  readonly parentalConsentMode: ParentalConsentMode;
  readonly childConsentReady: boolean;
}

export function deriveServerCapabilities(environment: ServerEnvironment): ServerCapabilities {
  return Object.freeze({
    deploymentProfile: environment.deploymentProfile,
    childProfiles: environment.enableChildProfiles,
    publicChildContent: environment.enablePublicChildContent,
    freeTextGameChat: environment.enableFreeTextGameChat,
    emailConfirmationRequired: environment.authEmailConfirmationRequired,
    oauthProviders: environment.enabledOAuthProviders,
    privacyRetention: environment.privacyRetention,
    parentalConsentMode: environment.parentalConsentMode,
    childConsentReady:
      environment.enableChildProfiles && environment.parentalConsentMode !== "disabled",
    privilegedDatabaseAccess: environment.supabaseSecretKey.length > 0,
  });
}

/** Explicit allow-list; never serialize a server environment object to the UI. */
export function sanitizeCapabilities(capabilities: ServerCapabilities): PublicCapabilities {
  return Object.freeze({
    deploymentProfile: capabilities.deploymentProfile,
    childProfiles: capabilities.childProfiles,
    publicChildContent: capabilities.publicChildContent,
    freeTextGameChat: capabilities.freeTextGameChat,
    emailConfirmationRequired: capabilities.emailConfirmationRequired,
    oauthProviders: capabilities.oauthProviders,
    privacyRetention: capabilities.privacyRetention,
    parentalConsentMode: capabilities.parentalConsentMode,
    childConsentReady: capabilities.childConsentReady,
  });
}
