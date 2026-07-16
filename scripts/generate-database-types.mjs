import { spawn } from "node:child_process";
import { open, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve("packages/database/src/generated/database.ts");
const temporaryPath = `${outputPath}.${String(process.pid)}.tmp.ts`;
const checkOnly = process.argv.includes("--check");
const linked = process.argv.includes("--linked");
const unsupportedArguments = process.argv.slice(2).filter((argument) => {
  return argument !== "--check" && argument !== "--linked";
});

if (unsupportedArguments.length > 0) {
  throw new Error(`Unsupported database type arguments: ${unsupportedArguments.join(", ")}`);
}

if (linked && !checkOnly) {
  throw new Error("Linked database type generation is check-only; pass --check with --linked.");
}

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

function normalizeProviderTypeMetadata(contents) {
  return contents.replace(
    /  \/\/ Allows to automatically instantiate createClient with right options\n  \/\/ instead of createClient<Database, \{ PostgrestVersion: 'XX' \}>\(URL, KEY\)\n  __InternalSupabase: \{\n    PostgrestVersion: "[^"]+";\n  \};\n/u,
    "",
  );
}

let output;

try {
  output = await open(temporaryPath, "w");
  const generator = spawn(
    "pnpm",
    ["exec", "supabase", "gen", "types", "typescript", linked ? "--linked" : "--local"],
    {
      stdio: ["inherit", output.fd, "inherit"],
    },
  );

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
    if (
      normalizeProviderTypeMetadata(currentContents) !==
      normalizeProviderTypeMetadata(generatedContents)
    ) {
      throw new Error(
        linked
          ? `Linked database types differ from the committed contract at ${outputPath}.`
          : `Generated database types are stale. Run \`pnpm db:types\` and commit ${outputPath}.`,
      );
    }
    process.stdout.write(
      linked
        ? `Linked database types match the committed contract: ${outputPath}.\n`
        : `Generated database types are current: ${outputPath}.\n`,
    );
  } else {
    await rename(temporaryPath, outputPath);
    process.stdout.write(`Generated and formatted ${outputPath}.\n`);
  }
} finally {
  await output?.close();
  await rm(temporaryPath, { force: true });
}
