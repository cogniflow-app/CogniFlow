import { brandConfig } from "@lumen/config/brand";
import { getPublicCapabilities, getServerCapabilities } from "@lumen/config/server-capabilities";
import { createRuntimeHealth, type RuntimeProvider } from "@lumen/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function runtimeProvider(deploymentProfile: string): RuntimeProvider {
  if (deploymentProfile === "vercel_beta") return "vercel";
  if (deploymentProfile === "cloudflare") return "cloudflare";
  return "local";
}

function vercelEnvironment(): "development" | "preview" | "production" | null {
  if (process.env.VERCEL?.trim() !== "1") return null;
  const value = process.env.VERCEL_ENV?.trim();
  return value === "development" || value === "preview" || value === "production" ? value : null;
}

function supabaseProjectRef(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const hostname = new URL(configuredUrl).hostname;
    return /^([a-z0-9]{20})\.supabase\.co$/u.exec(hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function GET() {
  const serverCapabilities = getServerCapabilities();
  const capabilities = getPublicCapabilities();
  const version =
    process.env.NEXT_PUBLIC_BUILD_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "development";
  const health = createRuntimeHealth({
    buildVersion: version,
    provider: runtimeProvider(serverCapabilities.deploymentProfile),
    runtime: "nodejs",
  });

  return Response.json(
    {
      ...health,
      app: brandConfig.name,
      capabilities,
      deploymentProfile: serverCapabilities.deploymentProfile,
      supabaseProjectRef: supabaseProjectRef(),
      vercelEnvironment: vercelEnvironment(),
      version,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
