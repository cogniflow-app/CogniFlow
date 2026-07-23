import withBundleAnalyzerFactory from "@next/bundle-analyzer";
import { parseServerEnvironment } from "@lumen/config/server-environment-parser";
import type { NextConfig } from "next";
import {
  PHASE_ANALYZE,
  PHASE_DEVELOPMENT_SERVER,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_TEST,
} from "next/constants";

import { shouldPreventSearchIndexing } from "./lib/search-indexing";

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const productionPhases = new Set<string>([
  PHASE_ANALYZE,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
]);

function nodeEnvironmentForPhase(phase: string): "development" | "production" | "test" {
  if (productionPhases.has(phase)) {
    return "production";
  }

  return phase === PHASE_TEST ? "test" : "development";
}

/**
 * Validate the exact values used by Next for a phase. Production phases force
 * production validation so an inherited NODE_ENV value cannot bypass the guard.
 */
export function validateNextEnvironment(phase: string, source: EnvironmentSource = process.env) {
  return parseServerEnvironment({
    NODE_ENV: nodeEnvironmentForPhase(phase),
    NEXT_PUBLIC_APP_NAME: source.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: source.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_LOCAL_PWA_TEST_MODE: source.NEXT_PUBLIC_LOCAL_PWA_TEST_MODE,
    AUTH_EMAIL_CONFIRMATION_REQUIRED: source.AUTH_EMAIL_CONFIRMATION_REQUIRED,
    AUTH_OAUTH_AZURE_ENABLED: source.AUTH_OAUTH_AZURE_ENABLED,
    AUTH_OAUTH_GITHUB_ENABLED: source.AUTH_OAUTH_GITHUB_ENABLED,
    AUTH_OAUTH_GOOGLE_ENABLED: source.AUTH_OAUTH_GOOGLE_ENABLED,
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY,
    DATABASE_URL: source.DATABASE_URL,
    DEPLOYMENT_PROFILE: source.DEPLOYMENT_PROFILE,
    ENABLE_CHILD_PROFILES: source.ENABLE_CHILD_PROFILES,
    ENABLE_PUBLIC_CHILD_CONTENT: source.ENABLE_PUBLIC_CHILD_CONTENT,
    ENABLE_FREE_TEXT_GAME_CHAT: source.ENABLE_FREE_TEXT_GAME_CHAT,
    APP_ENCRYPTION_KEY: source.APP_ENCRYPTION_KEY,
    GUEST_TOKEN_SIGNING_KEY: source.GUEST_TOKEN_SIGNING_KEY,
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: source.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    AUDIT_EVENT_RETENTION_DAYS: source.AUDIT_EVENT_RETENTION_DAYS,
    DELETION_GRACE_PERIOD_DAYS: source.DELETION_GRACE_PERIOD_DAYS,
    EXPORT_DOWNLOAD_RETENTION_DAYS: source.EXPORT_DOWNLOAD_RETENTION_DAYS,
    GUEST_SESSION_RETENTION_HOURS: source.GUEST_SESSION_RETENTION_HOURS,
    PROFILE_SESSION_TTL_MINUTES: source.PROFILE_SESSION_TTL_MINUTES,
    RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS: source.RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS,
    RATE_LIMIT_GUEST_CREATION_ATTEMPTS: source.RATE_LIMIT_GUEST_CREATION_ATTEMPTS,
    RATE_LIMIT_PASSWORD_RESET_ATTEMPTS: source.RATE_LIMIT_PASSWORD_RESET_ATTEMPTS,
    RATE_LIMIT_PROFILE_PIN_ATTEMPTS: source.RATE_LIMIT_PROFILE_PIN_ATTEMPTS,
    RATE_LIMIT_SIGNUP_ATTEMPTS: source.RATE_LIMIT_SIGNUP_ATTEMPTS,
    RATE_LIMIT_WINDOW_SECONDS: source.RATE_LIMIT_WINDOW_SECONDS,
    PARENTAL_CONSENT_MODE: source.PARENTAL_CONSENT_MODE,
    PARENTAL_CONSENT_VERIFIER_API_KEY: source.PARENTAL_CONSENT_VERIFIER_API_KEY,
    PARENTAL_CONSENT_VERIFIER_URL: source.PARENTAL_CONSENT_VERIFIER_URL,
    VERCEL: source.VERCEL,
    VERCEL_ENV: source.VERCEL_ENV,
    VERCEL_URL: source.VERCEL_URL,
  });
}

function createContentSecurityPolicy(localConnectivity: boolean, isEmbed: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${localConnectivity ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${localConnectivity ? " http://127.0.0.1:*" : ""} https://*.supabase.co`,
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co",
    `media-src 'self' blob:${localConnectivity ? " http://127.0.0.1:*" : ""} https://*.supabase.co`,
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isEmbed ? "frame-ancestors 'self' https:" : "frame-ancestors 'none'",
    ...(localConnectivity ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function createNextConfigForEnvironment(
  phase: string,
  source: EnvironmentSource,
): NextConfig {
  const environment = validateNextEnvironment(phase, source);

  const withBundleAnalyzer = withBundleAnalyzerFactory({
    enabled: source.ANALYZE === "true",
  });
  const isDevelopment = phase === PHASE_DEVELOPMENT_SERVER;
  const localConnectivity =
    isDevelopment ||
    (source.NEXT_PUBLIC_LOCAL_PWA_TEST_MODE === "true" &&
      environment.public.appUrl === "http://127.0.0.1:3100" &&
      environment.public.supabaseUrl === "http://127.0.0.1:54321");
  const contentSecurityPolicy = createContentSecurityPolicy(localConnectivity, false);
  const embedContentSecurityPolicy = createContentSecurityPolicy(localConnectivity, true);
  const sharedSecurityHeaders = [
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    ...(shouldPreventSearchIndexing(source)
      ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]
      : []),
  ];
  const securityHeaders = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    ...sharedSecurityHeaders,
    // Recording is still browser-permission gated and starts only after an explicit editor action.
    { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  const embedSecurityHeaders = [
    { key: "Content-Security-Policy", value: embedContentSecurityPolicy },
    ...sharedSecurityHeaders,
    { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  ];
  const nextConfig: NextConfig = {
    ...(source.LUMEN_E2E === "true" ? { devIndicators: false } : {}),
    env: {
      NEXT_PUBLIC_APP_URL: environment.public.appUrl,
    },
    poweredByHeader: false,
    reactStrictMode: true,
    transpilePackages: [
      "@lumen/auth",
      "@lumen/config",
      "@lumen/database",
      "@lumen/domain",
      "@lumen/offline",
      "@lumen/ui",
    ],
    typedRoutes: true,
    async headers() {
      return [
        {
          headers: securityHeaders,
          source: "/((?!embed/deck/).*)",
        },
        {
          headers: embedSecurityHeaders,
          source: "/embed/deck/:publicId",
        },
        {
          headers: [{ key: "Cache-Control", value: "no-store" }],
          source: "/api/health",
        },
      ];
    },
  };

  return withBundleAnalyzer(nextConfig);
}

export default function createNextConfig(phase: string): NextConfig {
  return createNextConfigForEnvironment(phase, process.env);
}
