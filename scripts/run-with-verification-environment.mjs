import { spawn } from "node:child_process";

import { withVerificationEnvironment } from "./verification-environment.mjs";

const [requestedExecutable, ...arguments_] = process.argv.slice(2);

if (!requestedExecutable) {
  throw new Error("Usage: run-with-verification-environment.mjs <command> [...arguments]");
}

const executable =
  process.platform === "win32" && requestedExecutable === "pnpm" ? "pnpm.cmd" : requestedExecutable;
const child = spawn(executable, arguments_, {
  env: withVerificationEnvironment(),
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(`Unable to run verification command: ${requestedExecutable}`, error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
