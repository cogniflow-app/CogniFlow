import { fileURLToPath } from "node:url";

import { runHostedContentAcceptance } from "./run-hosted-content-acceptance.mjs";

export function runHostedOfflineAcceptance(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  return runHostedContentAcceptance(argv, environment, {
    playwrightConfig: "playwright.hosted-offline.config.ts",
    successMessage:
      "Preview Phase 05 PWA, private pin, offline shell, outbox, synchronization, isolation, and verified minimization acceptance completed successfully.\n",
  });
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runHostedOfflineAcceptance().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted offline acceptance failed."}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
