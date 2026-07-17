import { randomUUID } from "node:crypto";

import type { Database } from "@lumen/database/types";
import { createClient } from "@supabase/supabase-js";

import { processMediaDeletionBatch, type MediaDeletionClient } from "./media-deletions.ts";

function requiredEnvironment(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalInteger(name: "MEDIA_DELETION_BATCH_SIZE" | "MEDIA_DELETION_LEASE_SECONDS") {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!/^[0-9]+$/u.test(value)) throw new Error(`${name} must be an integer.`);
  return Number(value);
}

async function main() {
  const client = createClient<Database>(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SECRET_KEY"),
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    },
  );
  const leaseSeconds = optionalInteger("MEDIA_DELETION_LEASE_SECONDS");
  const limit = optionalInteger("MEDIA_DELETION_BATCH_SIZE");
  const result = await processMediaDeletionBatch(client as unknown as MediaDeletionClient, {
    ...(leaseSeconds === undefined ? {} : { leaseSeconds }),
    ...(limit === undefined ? {} : { limit }),
    workerId: randomUUID(),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Media deletion worker failed.";
  console.error(message);
  process.exitCode = 1;
});
