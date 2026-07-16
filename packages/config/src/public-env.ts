import { z } from "zod";

import { DEFAULT_APP_NAME } from "./brand";
import { type EnvironmentSource, readNodeEnvironment } from "./environment-source";

const LOCAL_APP_URL = "http://127.0.0.1:3100";
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_PUBLISHABLE_KEY = "sb_publishable_local_development_only";

const publicEnvironmentSchema = z.object({
  appName: z.string().trim().min(1).max(80),
  appUrl: z.url().refine((value) => /^https?:\/\//u.test(value), {
    message: "NEXT_PUBLIC_APP_URL must use http or https",
  }),
  supabaseUrl: z.url().refine((value) => /^https?:\/\//u.test(value), {
    message: "NEXT_PUBLIC_SUPABASE_URL must use http or https",
  }),
  supabasePublishableKey: z.string().trim().min(1),
});

export interface PublicEnvironment {
  readonly appName: string;
  readonly appUrl: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

function requiredValue(
  source: EnvironmentSource,
  name: keyof EnvironmentSource,
  fallback: string,
): string | undefined {
  const value = source[name]?.trim();
  if (value) {
    return value;
  }

  return readNodeEnvironment(source) === "production" ? undefined : fallback;
}

export function parsePublicEnvironment(source: EnvironmentSource): PublicEnvironment {
  const environment = publicEnvironmentSchema.parse({
    appName: source.NEXT_PUBLIC_APP_NAME?.trim() || DEFAULT_APP_NAME,
    appUrl: requiredValue(source, "NEXT_PUBLIC_APP_URL", LOCAL_APP_URL),
    supabaseUrl: requiredValue(source, "NEXT_PUBLIC_SUPABASE_URL", LOCAL_SUPABASE_URL),
    supabasePublishableKey: requiredValue(
      source,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      LOCAL_PUBLISHABLE_KEY,
    ),
  });

  if (readNodeEnvironment(source) === "production") {
    if (new URL(environment.appUrl).protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
    }
    if (new URL(environment.supabaseUrl).protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS in production");
    }
  }

  return Object.freeze(environment);
}

/** Uses explicit public references so Next.js can replace them safely. */
export function readPublicEnvironment(): PublicEnvironment {
  return parsePublicEnvironment({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
