import { z } from "zod";

import {
  type EnvironmentSource,
  type NodeEnvironment,
  readNodeEnvironment,
} from "./environment-source";
import { parsePublicEnvironment, type PublicEnvironment } from "./public-env";

export const deploymentProfiles = ["local", "test", "vercel_beta", "cloudflare"] as const;

export type DeploymentProfile = (typeof deploymentProfiles)[number];

export interface ServerEnvironment {
  readonly nodeEnvironment: NodeEnvironment;
  readonly deploymentProfile: DeploymentProfile;
  readonly public: PublicEnvironment;
  readonly supabaseSecretKey: string;
  readonly databaseUrl: string;
  readonly appEncryptionKey: string;
  readonly guestTokenSigningKey: string;
  readonly nextServerActionsEncryptionKey: string;
  readonly enableChildProfiles: boolean;
  readonly enablePublicChildContent: boolean;
  readonly enableFreeTextGameChat: boolean;
}

const LOCAL_SECRETS = Object.freeze({
  supabaseSecretKey: "local-secret-key-not-for-production-use",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  appEncryptionKey: "local-app-encryption-key-not-for-production",
  guestTokenSigningKey: "local-guest-signing-key-not-for-production",
  nextServerActionsEncryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
});

const deploymentProfileSchema = z.enum(deploymentProfiles);
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

function parseFeatureFlag(
  source: EnvironmentSource,
  name: "ENABLE_CHILD_PROFILES" | "ENABLE_PUBLIC_CHILD_CONTENT" | "ENABLE_FREE_TEXT_GAME_CHAT",
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

  const childProfilesRequested = parseFeatureFlag(source, "ENABLE_CHILD_PROFILES");
  const publicChildContentRequested = parseFeatureFlag(source, "ENABLE_PUBLIC_CHILD_CONTENT");
  const freeTextGameChatRequested = parseFeatureFlag(source, "ENABLE_FREE_TEXT_GAME_CHAT");
  const vercelBeta = deploymentProfile === "vercel_beta";
  const enableChildProfiles = vercelBeta ? false : childProfilesRequested;
  const enablePublicChildContent =
    enableChildProfiles && !vercelBeta && publicChildContentRequested;
  const enableFreeTextGameChat = vercelBeta ? false : freeTextGameChatRequested;

  return Object.freeze({
    nodeEnvironment,
    deploymentProfile,
    public: parsePublicEnvironment(source),
    ...serverValues,
    enableChildProfiles,
    enablePublicChildContent,
    enableFreeTextGameChat,
  });
}
