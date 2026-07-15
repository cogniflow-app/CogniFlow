import "server-only";

import type { EnvironmentSource } from "./environment-source";
import { parseServerEnvironment, type ServerEnvironment } from "./server-environment-parser";

function readServerSource(): EnvironmentSource {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DEPLOYMENT_PROFILE: process.env.DEPLOYMENT_PROFILE,
    ENABLE_CHILD_PROFILES: process.env.ENABLE_CHILD_PROFILES,
    ENABLE_PUBLIC_CHILD_CONTENT: process.env.ENABLE_PUBLIC_CHILD_CONTENT,
    ENABLE_FREE_TEXT_GAME_CHAT: process.env.ENABLE_FREE_TEXT_GAME_CHAT,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    GUEST_TOKEN_SIGNING_KEY: process.env.GUEST_TOKEN_SIGNING_KEY,
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
  };
}

export function getServerEnvironment(
  source: EnvironmentSource = readServerSource(),
): ServerEnvironment {
  return parseServerEnvironment(source);
}

export type { DeploymentProfile, ServerEnvironment } from "./server-environment-parser";
