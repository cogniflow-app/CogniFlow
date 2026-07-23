import { spawn } from "node:child_process";

import { readLocalSupabaseEnvironment } from "./local-supabase-environment.mjs";

const [requestedExecutable, ...arguments_] = process.argv.slice(2);

if (!requestedExecutable) {
  throw new Error("Usage: run-with-local-supabase-environment.mjs <command> [...arguments]");
}

const localSupabaseEnvironment = await readLocalSupabaseEnvironment();
const executable =
  process.platform === "win32" && requestedExecutable === "pnpm" ? "pnpm.cmd" : requestedExecutable;
const child = spawn(executable, arguments_, {
  env: {
    ...process.env,
    ...localSupabaseEnvironment,
    DEPLOYMENT_PROFILE: "test",
    ENABLE_CHILD_PROFILES: "false",
    ENABLE_PUBLIC_CHILD_CONTENT: "false",
    ENABLE_FREE_TEXT_GAME_CHAT: "false",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
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
  console.error(`Unable to run local Supabase command: ${requestedExecutable}`, error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
