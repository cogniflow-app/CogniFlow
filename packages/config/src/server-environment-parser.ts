import { z } from "zod";

import {
  type EnvironmentSource,
  type NodeEnvironment,
  readNodeEnvironment,
} from "./environment-source";
import { parsePublicEnvironment, type PublicEnvironment } from "./public-env";

export const deploymentProfiles = ["local", "test", "vercel_beta", "cloudflare"] as const;
export const oauthProviders = ["google", "github", "azure"] as const;
export const parentalConsentModes = ["disabled", "test_only", "external_verified"] as const;

export type DeploymentProfile = (typeof deploymentProfiles)[number];
export type OAuthProvider = (typeof oauthProviders)[number];
export type ParentalConsentMode = (typeof parentalConsentModes)[number];

export interface PrivacyRetentionConfiguration {
  readonly auditEventDays: number;
  readonly deletionGraceDays: number;
  readonly exportDownloadDays: number;
  readonly guestSessionHours: number;
  readonly profileSessionMinutes: number;
}

export interface RateLimitConfiguration {
  readonly destructiveRequestAttempts: number;
  readonly guestCreationAttempts: number;
  readonly passwordResetAttempts: number;
  readonly profilePinAttempts: number;
  readonly signupAttempts: number;
  readonly windowSeconds: number;
}

export interface ServerEnvironment {
  readonly nodeEnvironment: NodeEnvironment;
  readonly deploymentProfile: DeploymentProfile;
  readonly public: PublicEnvironment;
  readonly supabaseSecretKey: string;
  readonly databaseUrl: string;
  readonly appEncryptionKey: string;
  readonly guestTokenSigningKey: string;
  readonly nextServerActionsEncryptionKey: string;
  readonly authEmailConfirmationRequired: boolean;
  readonly enabledOAuthProviders: readonly OAuthProvider[];
  readonly privacyRetention: PrivacyRetentionConfiguration;
  readonly rateLimits: RateLimitConfiguration;
  readonly parentalConsentMode: ParentalConsentMode;
  readonly parentalConsentVerifierApiKey: string | null;
  readonly parentalConsentVerifierUrl: string | null;
  readonly vercelRuntime: boolean;
  readonly productionManagedProfileSafetyGate: boolean;
  readonly enableChildProfiles: boolean;
  readonly enablePublicChildContent: boolean;
  readonly enableFreeTextGameChat: boolean;
}

function resolveExternalConsentVerifier(
  source: EnvironmentSource,
  mode: ParentalConsentMode,
  nodeEnvironment: NodeEnvironment,
): { readonly apiKey: string | null; readonly url: string | null } {
  if (mode !== "external_verified") {
    return { apiKey: null, url: null };
  }
  const apiKey = source.PARENTAL_CONSENT_VERIFIER_API_KEY?.trim();
  const rawUrl = source.PARENTAL_CONSENT_VERIFIER_URL?.trim();
  if (!apiKey || apiKey.length < 24 || !rawUrl) {
    throw new Error(
      "external_verified consent requires PARENTAL_CONSENT_VERIFIER_URL and a server-only PARENTAL_CONSENT_VERIFIER_API_KEY",
    );
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("PARENTAL_CONSENT_VERIFIER_URL must be a valid URL");
  }
  if (nodeEnvironment === "production" && url.protocol !== "https:") {
    throw new Error("PARENTAL_CONSENT_VERIFIER_URL must use HTTPS in production");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("PARENTAL_CONSENT_VERIFIER_URL must use HTTP or HTTPS");
  }
  return { apiKey, url: url.toString() };
}

const LOCAL_SECRETS = Object.freeze({
  supabaseSecretKey: "local-secret-key-not-for-production-use",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  appEncryptionKey: "local-app-encryption-key-not-for-production",
  guestTokenSigningKey: "local-guest-signing-key-not-for-production",
  nextServerActionsEncryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
});

const deploymentProfileSchema = z.enum(deploymentProfiles);
const parentalConsentModeSchema = z.enum(parentalConsentModes);
const boundedInteger = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);
const serverValueSchema = z.object({
  supabaseSecretKey: z.string().trim().min(24),
  databaseUrl: z.url().refine((value) => /^postgres(?:ql)?:\/\//u.test(value), {
    message: "DATABASE_URL must use postgres or postgresql",
  }),
  appEncryptionKey: z.string().min(32),
  guestTokenSigningKey: z.string().min(32),
  nextServerActionsEncryptionKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9+/]{43}=$/u, "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be 32-byte base64"),
});

const privacyRetentionSchema = z.object({
  auditEventDays: boundedInteger(30, 3650),
  deletionGraceDays: boundedInteger(1, 90),
  exportDownloadDays: boundedInteger(1, 30),
  guestSessionHours: boundedInteger(1, 24),
  profileSessionMinutes: boundedInteger(5, 30),
});

const rateLimitSchema = z.object({
  destructiveRequestAttempts: boundedInteger(1, 100),
  guestCreationAttempts: boundedInteger(1, 1000),
  passwordResetAttempts: boundedInteger(1, 100),
  profilePinAttempts: boundedInteger(1, 100),
  signupAttempts: boundedInteger(1, 100),
  windowSeconds: boundedInteger(30, 86_400),
});

function parseFeatureFlag(
  source: EnvironmentSource,
  name:
    | "AUTH_EMAIL_CONFIRMATION_REQUIRED"
    | "AUTH_OAUTH_AZURE_ENABLED"
    | "AUTH_OAUTH_GITHUB_ENABLED"
    | "AUTH_OAUTH_GOOGLE_ENABLED"
    | "ENABLE_CHILD_PROFILES"
    | "ENABLE_PUBLIC_CHILD_CONTENT"
    | "ENABLE_FREE_TEXT_GAME_CHAT",
): boolean {
  const value = source[name]?.trim().toLowerCase();
  if (value === undefined || value === "") {
    return false;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`${name} must be one of: true, false, 1, 0`);
}

function configuredInteger(
  source: EnvironmentSource,
  name:
    | "AUDIT_EVENT_RETENTION_DAYS"
    | "DELETION_GRACE_PERIOD_DAYS"
    | "EXPORT_DOWNLOAD_RETENTION_DAYS"
    | "GUEST_SESSION_RETENTION_HOURS"
    | "PROFILE_SESSION_TTL_MINUTES"
    | "RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS"
    | "RATE_LIMIT_GUEST_CREATION_ATTEMPTS"
    | "RATE_LIMIT_PASSWORD_RESET_ATTEMPTS"
    | "RATE_LIMIT_PROFILE_PIN_ATTEMPTS"
    | "RATE_LIMIT_SIGNUP_ATTEMPTS"
    | "RATE_LIMIT_WINDOW_SECONDS",
  fallback: number,
): string | number {
  const value = source[name]?.trim();
  return value ? value : fallback;
}

function resolveDeploymentProfile(
  source: EnvironmentSource,
  nodeEnvironment: NodeEnvironment,
): DeploymentProfile {
  const configured = source.DEPLOYMENT_PROFILE?.trim();
  if (configured) {
    return deploymentProfileSchema.parse(configured);
  }

  if (nodeEnvironment === "production") {
    throw new Error("DEPLOYMENT_PROFILE is required in production");
  }

  return nodeEnvironment === "test" ? "test" : "local";
}

function resolveParentalConsentMode(
  source: EnvironmentSource,
  deploymentProfile: DeploymentProfile,
  childProfilesEnabled: boolean,
  childSafetyGate: boolean,
): ParentalConsentMode {
  const requested = parentalConsentModeSchema.parse(
    source.PARENTAL_CONSENT_MODE?.trim() || "disabled",
  );

  if (childSafetyGate) {
    return "disabled";
  }

  if (requested === "test_only") {
    if (!childProfilesEnabled || !["local", "test"].includes(deploymentProfile)) {
      throw new Error(
        "PARENTAL_CONSENT_MODE=test_only requires enabled child profiles on local or test",
      );
    }
  }

  if (requested === "external_verified") {
    if (!childProfilesEnabled || deploymentProfile !== "cloudflare") {
      throw new Error(
        "PARENTAL_CONSENT_MODE=external_verified requires enabled child profiles on cloudflare",
      );
    }
  }

  return requested;
}

function requiredServerValue(
  source: EnvironmentSource,
  name:
    | "SUPABASE_SECRET_KEY"
    | "DATABASE_URL"
    | "APP_ENCRYPTION_KEY"
    | "GUEST_TOKEN_SIGNING_KEY"
    | "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
  fallback: string,
  allowLocalDefault: boolean,
): string | undefined {
  const configured = source[name]?.trim();
  if (configured) {
    return configured;
  }

  return allowLocalDefault ? fallback : undefined;
}

export function parseServerEnvironment(source: EnvironmentSource): ServerEnvironment {
  const nodeEnvironment = readNodeEnvironment(source);
  const deploymentProfile = resolveDeploymentProfile(source, nodeEnvironment);
  const allowLocalDefaults =
    nodeEnvironment !== "production" &&
    (deploymentProfile === "local" || deploymentProfile === "test");

  const serverValues = serverValueSchema.parse({
    supabaseSecretKey: requiredServerValue(
      source,
      "SUPABASE_SECRET_KEY",
      LOCAL_SECRETS.supabaseSecretKey,
      allowLocalDefaults,
    ),
    databaseUrl: requiredServerValue(
      source,
      "DATABASE_URL",
      LOCAL_SECRETS.databaseUrl,
      allowLocalDefaults,
    ),
    appEncryptionKey: requiredServerValue(
      source,
      "APP_ENCRYPTION_KEY",
      LOCAL_SECRETS.appEncryptionKey,
      allowLocalDefaults,
    ),
    guestTokenSigningKey: requiredServerValue(
      source,
      "GUEST_TOKEN_SIGNING_KEY",
      LOCAL_SECRETS.guestTokenSigningKey,
      allowLocalDefaults,
    ),
    nextServerActionsEncryptionKey: requiredServerValue(
      source,
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      LOCAL_SECRETS.nextServerActionsEncryptionKey,
      allowLocalDefaults,
    ),
  });

  const enabledOAuthProviders = Object.freeze(
    oauthProviders.filter((provider) => {
      const flagName =
        provider === "google"
          ? "AUTH_OAUTH_GOOGLE_ENABLED"
          : provider === "github"
            ? "AUTH_OAUTH_GITHUB_ENABLED"
            : "AUTH_OAUTH_AZURE_ENABLED";
      return parseFeatureFlag(source, flagName);
    }),
  );
  const privacyRetention = Object.freeze(
    privacyRetentionSchema.parse({
      auditEventDays: configuredInteger(source, "AUDIT_EVENT_RETENTION_DAYS", 365),
      deletionGraceDays: configuredInteger(source, "DELETION_GRACE_PERIOD_DAYS", 30),
      exportDownloadDays: configuredInteger(source, "EXPORT_DOWNLOAD_RETENTION_DAYS", 7),
      guestSessionHours: configuredInteger(source, "GUEST_SESSION_RETENTION_HOURS", 24),
      profileSessionMinutes: configuredInteger(source, "PROFILE_SESSION_TTL_MINUTES", 30),
    }),
  );
  const rateLimits = Object.freeze(
    rateLimitSchema.parse({
      destructiveRequestAttempts: configuredInteger(
        source,
        "RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS",
        3,
      ),
      guestCreationAttempts: configuredInteger(source, "RATE_LIMIT_GUEST_CREATION_ATTEMPTS", 20),
      passwordResetAttempts: configuredInteger(source, "RATE_LIMIT_PASSWORD_RESET_ATTEMPTS", 5),
      profilePinAttempts: configuredInteger(source, "RATE_LIMIT_PROFILE_PIN_ATTEMPTS", 5),
      signupAttempts: configuredInteger(source, "RATE_LIMIT_SIGNUP_ATTEMPTS", 5),
      windowSeconds: configuredInteger(source, "RATE_LIMIT_WINDOW_SECONDS", 900),
    }),
  );

  const childProfilesRequested = parseFeatureFlag(source, "ENABLE_CHILD_PROFILES");
  const publicChildContentRequested = parseFeatureFlag(source, "ENABLE_PUBLIC_CHILD_CONTENT");
  const freeTextGameChatRequested = parseFeatureFlag(source, "ENABLE_FREE_TEXT_GAME_CHAT");
  const vercelRuntime = source.VERCEL?.trim() === "1";
  const vercelChildSafetyGate = deploymentProfile === "vercel_beta" || vercelRuntime;
  // Managed learner mode currently overlays an opaque profile token on the
  // guardian's Supabase session. Keep that complete workflow available for
  // local/test verification, but do not expose it to an untrusted production
  // browser until managed profiles have an independent BFF identity session.
  const productionManagedProfileSafetyGate = nodeEnvironment === "production";
  const childSafetyGate = vercelChildSafetyGate || productionManagedProfileSafetyGate;
  const childProfileRequestAllowed = !childSafetyGate && childProfilesRequested;
  const parentalConsentMode = resolveParentalConsentMode(
    source,
    deploymentProfile,
    childProfileRequestAllowed,
    childSafetyGate,
  );
  const parentalConsentVerifier = resolveExternalConsentVerifier(
    source,
    parentalConsentMode,
    nodeEnvironment,
  );
  const enableChildProfiles = childProfileRequestAllowed && parentalConsentMode !== "disabled";
  const enablePublicChildContent = enableChildProfiles && publicChildContentRequested;
  const enableFreeTextGameChat = childSafetyGate ? false : freeTextGameChatRequested;

  return Object.freeze({
    nodeEnvironment,
    deploymentProfile,
    public: parsePublicEnvironment(source),
    ...serverValues,
    authEmailConfirmationRequired: parseFeatureFlag(source, "AUTH_EMAIL_CONFIRMATION_REQUIRED"),
    enabledOAuthProviders,
    privacyRetention,
    rateLimits,
    parentalConsentMode,
    parentalConsentVerifierApiKey: parentalConsentVerifier.apiKey,
    parentalConsentVerifierUrl: parentalConsentVerifier.url,
    vercelRuntime,
    productionManagedProfileSafetyGate,
    enableChildProfiles,
    enablePublicChildContent,
    enableFreeTextGameChat,
  });
}
