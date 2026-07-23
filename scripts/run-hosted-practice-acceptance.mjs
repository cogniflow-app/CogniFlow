import { fileURLToPath } from "node:url";

import { runHostedContentAcceptance } from "./run-hosted-content-acceptance.mjs";

export function runHostedPracticeAcceptance(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  return runHostedContentAcceptance(argv, environment, {
    playwrightConfig: "playwright.hosted-practice.config.ts",
    successMessage:
      "Preview Phase 04 practice, guide, isolation, and verified minimization acceptance completed successfully.\n",
  });
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runHostedPracticeAcceptance().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted practice acceptance failed."}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
