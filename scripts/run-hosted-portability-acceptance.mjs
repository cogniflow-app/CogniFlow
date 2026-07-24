import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  createHostedAcceptancePassword,
  provisionHostedAcceptanceFixture,
  runHostedContentAcceptance,
} from "./run-hosted-content-acceptance.mjs";

const PREVIEW_PROJECT_REF = "cfwddajyjbueggpzfomh";
const HOSTED_AUTH_ADMIN_CREATE_SPACING_MS = 1_500;

export function createHostedRestoreIdentity(runId) {
  const compact = runId.replaceAll("-", "");
  return Object.freeze({
    email: `phase06-restore-${compact}@example.test`,
    password: `${createHostedAcceptancePassword(runId)}-Restore`,
  });
}

export async function provisionHostedPortabilityFixtures(
  runId,
  secretKey,
  { delayImplementation = delay, fetchImplementation = fetch, signal } = {},
) {
  await provisionHostedAcceptanceFixture(runId, secretKey, {
    fetchImplementation,
    signal,
  });
  await delayImplementation(
    HOSTED_AUTH_ADMIN_CREATE_SPACING_MS,
    undefined,
    signal ? { signal } : undefined,
  );
  const identity = createHostedRestoreIdentity(runId);
  const response = await fetchImplementation(
    `https://${PREVIEW_PROJECT_REF}.supabase.co/auth/v1/admin/users`,
    {
      body: JSON.stringify({
        email: identity.email,
        email_confirm: true,
        password: identity.password,
        user_metadata: { lumen_hosted_acceptance: runId },
      }),
      cache: "no-store",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("Preview restore-account fixture provisioning failed.");
}

export function runHostedPortabilityAcceptance(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  return runHostedContentAcceptance(argv, environment, {
    playwrightConfig: "playwright.hosted-portability.config.ts",
    provisionFixtureImplementation: provisionHostedPortabilityFixtures,
    successMessage:
      "Preview Phase 06 import, export, backup, restore, artifact authorization, and verified Storage cleanup acceptance completed successfully.\n",
  });
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runHostedPortabilityAcceptance().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted portability acceptance failed."}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
