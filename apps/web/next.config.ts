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
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY,
    DATABASE_URL: source.DATABASE_URL,
    DEPLOYMENT_PROFILE: source.DEPLOYMENT_PROFILE,
    ENABLE_CHILD_PROFILES: source.ENABLE_CHILD_PROFILES,
    ENABLE_PUBLIC_CHILD_CONTENT: source.ENABLE_PUBLIC_CHILD_CONTENT,
    ENABLE_FREE_TEXT_GAME_CHAT: source.ENABLE_FREE_TEXT_GAME_CHAT,
    APP_ENCRYPTION_KEY: source.APP_ENCRYPTION_KEY,
    GUEST_TOKEN_SIGNING_KEY: source.GUEST_TOKEN_SIGNING_KEY,
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: source.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
  });
}

function createContentSecurityPolicy(isDevelopment: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export default function createNextConfig(phase: string): NextConfig {
  validateNextEnvironment(phase);

  const withBundleAnalyzer = withBundleAnalyzerFactory({
    enabled: process.env.ANALYZE === "true",
  });
  const contentSecurityPolicy = createContentSecurityPolicy(phase === PHASE_DEVELOPMENT_SERVER);
  const securityHeaders = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  const nextConfig: NextConfig = {
    poweredByHeader: false,
    reactStrictMode: true,
    transpilePackages: ["@lumen/config", "@lumen/database", "@lumen/domain", "@lumen/ui"],
    typedRoutes: true,
    async headers() {
      return [
        {
          headers: securityHeaders,
          source: "/(.*)",
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
