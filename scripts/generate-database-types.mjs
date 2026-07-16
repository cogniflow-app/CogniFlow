import { spawn } from "node:child_process";
import { open, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve("packages/database/src/generated/database.ts");
const temporaryPath = `${outputPath}.${String(process.pid)}.tmp.ts`;
const checkOnly = process.argv.includes("--check");

function waitForExit(child, label) {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveExit();
        return;
      }

      rejectExit(
        new Error(
          `${label} exited with ${code === null ? `signal ${signal ?? "unknown"}` : `code ${String(code)}`}.`,
        ),
      );
    });
  });
}

let output;

try {
  output = await open(temporaryPath, "w");
  const generator = spawn("pnpm", ["exec", "supabase", "gen", "types", "typescript", "--local"], {
    stdio: ["inherit", output.fd, "inherit"],
  });

  await waitForExit(generator, "Supabase type generation");
  await output.close();
  output = undefined;

  const formatter = spawn("pnpm", ["exec", "prettier", "--write", temporaryPath], {
    stdio: "inherit",
  });
  await waitForExit(formatter, "Generated database type formatting");

  if (checkOnly) {
    const [currentContents, generatedContents] = await Promise.all([
      readFile(outputPath, "utf8"),
      readFile(temporaryPath, "utf8"),
    ]);
    if (currentContents !== generatedContents) {
      throw new Error(
        `Generated database types are stale. Run \`pnpm db:types\` and commit ${outputPath}.`,
      );
    }
    process.stdout.write(`Generated database types are current: ${outputPath}.\n`);
  } else {
    await rename(temporaryPath, outputPath);
    process.stdout.write(`Generated and formatted ${outputPath}.\n`);
  }
} finally {
  await output?.close();
  await rm(temporaryPath, { force: true });
}
