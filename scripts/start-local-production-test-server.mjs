import { spawn } from "node:child_process";

import { withVerificationEnvironment } from "./verification-environment.mjs";

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(executable, ["--filter", "@lumen/web", "start"], {
  env: {
    ...withVerificationEnvironment(),
    ...process.env,
    DEPLOYMENT_PROFILE: "test",
    ENABLE_CHILD_PROFILES: "false",
    ENABLE_FREE_TEXT_GAME_CHAT: "false",
    ENABLE_PUBLIC_CHILD_CONTENT: "false",
    NEXT_PUBLIC_LOCAL_PWA_TEST_MODE: "true",
    PARENTAL_CONSENT_MODE: "disabled",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error("Unable to start the local production PWA test server.", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
