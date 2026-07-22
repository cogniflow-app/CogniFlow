import { fileURLToPath } from "node:url";

import { runHostedContentAcceptance } from "./run-hosted-content-acceptance.mjs";

export function runHostedSrsAcceptance(argv = process.argv.slice(2), environment = process.env) {
  return runHostedContentAcceptance(argv, environment, {
    playwrightConfig: "playwright.hosted-srs.config.ts",
    successMessage:
      "Preview Phase 03 SRS acceptance and verified minimization completed successfully.\n",
  });
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runHostedSrsAcceptance().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted SRS acceptance failed."}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
