import { spawn } from "node:child_process";

import { withVerificationEnvironment } from "./verification-environment.mjs";

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(executable, ["--filter", "@lumen/web", "start"], {
  env: withVerificationEnvironment(),
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error("Unable to start the production test server.", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
