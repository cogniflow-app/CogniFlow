import type { Database } from "@lumen/database/types";
import { createClient } from "@supabase/supabase-js";

import {
  cleanExpiredPortabilityArtifacts,
  type PortabilityWorkerClient,
} from "./portability-jobs.ts";

function requiredEnvironment(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = createClient<Database>(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SECRET_KEY"),
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    },
  ) as unknown as PortabilityWorkerClient;
  const expiredObjects = await cleanExpiredPortabilityArtifacts(client);
  process.stdout.write(
    `${JSON.stringify({
      expiredObjects: expiredObjects.length,
      note: "Cleanup complete. Authenticated route handlers process ordinary portability jobs; use the reusable worker library with a deployment-specific handler for scheduled job execution.",
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Portability worker failed.";
  console.error(message);
  process.exitCode = 1;
});
