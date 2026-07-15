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

export function GET() {
  const serverCapabilities = getServerCapabilities();
  const capabilities = getPublicCapabilities();
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION?.trim() || "development";
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
