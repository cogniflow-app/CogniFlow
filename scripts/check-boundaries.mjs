import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = ["apps", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs"]);
const serverOnlySpecifiers = [
  "server-only",
  "@lumen/config/server-env",
  "@lumen/config/server-capabilities",
  "@lumen/config/server-environment-parser",
  "@lumen/config/server",
  "@lumen/database/server",
  "@lumen/database/route",
  "@lumen/database/test",
];
const serverOnlySuffixes = [
  "/server",
  "/server-env",
  "/server-capabilities",
  "/server-environment-parser",
  "/route",
  "/test",
];
const secretNames = [
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "APP_ENCRYPTION_KEY",
  "GUEST_TOKEN_SIGNING_KEY",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => ![".next", ".open-next", ".turbo", "node_modules"].includes(entry.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? collectFiles(path) : [path];
      }),
  );

  return nested.flat().filter((path) => sourceExtensions.has(extname(path)));
}

const violations = [];

for (const sourceRoot of sourceRoots) {
  const directory = join(root, sourceRoot);
  let files = [];

  try {
    files = await collectFiles(directory);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }
    throw error;
  }

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const path = relative(root, file);
    const isClient = /^\s*["']use client["'];/u.test(contents);
    const isDomain = path.startsWith("packages/domain/src/");

    if (isClient) {
      const imports = contents.matchAll(
        /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)["']([^"']+)["']/gu,
      );

      for (const match of imports) {
        const specifier = match[1];
        if (
          specifier &&
          (serverOnlySpecifiers.includes(specifier) ||
            serverOnlySuffixes.some((suffix) => specifier.endsWith(suffix)))
        ) {
          violations.push(`${path}: client module imports ${specifier}`);
        }
      }

      for (const secretName of secretNames) {
        if (contents.includes(secretName)) {
          violations.push(`${path}: client module references server secret ${secretName}`);
        }
      }
    }

    if (isDomain && /from\s+["'](?:next(?:\/|["'])|@supabase\/|@lumen\/database)/u.test(contents)) {
      violations.push(`${path}: domain module imports a framework/provider module`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Dependency boundary violations:\n${violations.join("\n")}`);
}

process.stdout.write("Dependency boundaries verified.\n");
