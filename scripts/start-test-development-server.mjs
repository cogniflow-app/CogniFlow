import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

// Test servers must not reuse a stale Turbopack development artifact after a
// production build. This removes generated output only; application files stay untouched.
await rm(join(repositoryRoot, "apps/web/.next/dev"), { force: true, recursive: true });

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(executable, ["--filter", "@lumen/web", "dev"], {
  cwd: repositoryRoot,
  env: { ...process.env, LUMEN_E2E: "true" },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error("Unable to start the isolated development test server.", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
