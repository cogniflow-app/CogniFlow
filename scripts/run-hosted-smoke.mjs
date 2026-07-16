import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const targetVariables = Object.freeze({
  preview: "HOSTED_PREVIEW_URL",
  production: "HOSTED_PRODUCTION_URL",
});

export function isTrustedVercelAutomationOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return false;
  }
  const { hostname } = parsed;
  return (
    hostname === "recallflash.com" ||
    hostname === "cogniflow-pearl.vercel.app" ||
    /^cogniflow-[a-z0-9]+-cogniflow-app-3471s-projects\.vercel\.app$/u.test(hostname)
  );
}

function usageError(message) {
  return new Error(
    `${message}\nUsage: node scripts/run-hosted-smoke.mjs <preview|production> [--url https://host.example]`,
  );
}

export function normalizeHostedBaseUrl(untrusted) {
  if (typeof untrusted !== "string" || !untrusted.trim()) {
    throw usageError(
      "A hosted base URL is required through --url or the target environment variable.",
    );
  }

  let parsed;
  try {
    parsed = new URL(untrusted.trim());
  } catch {
    throw usageError("The hosted base URL must be an absolute HTTPS URL.");
  }

  const localHostnames = new Set(["127.0.0.1", "[::1]", "localhost", "0.0.0.0"]);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    localHostnames.has(parsed.hostname) ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname.endsWith(".localhost")
  ) {
    throw usageError(
      "The hosted base URL must be a non-local HTTPS origin without credentials, a path, query, or fragment.",
    );
  }

  return parsed.origin;
}

export function resolveHostedSmokeRun(argv, environment = process.env) {
  const [target, ...options] = argv;
  if (!target || !Object.hasOwn(targetVariables, target)) {
    throw usageError("Choose exactly one hosted target: preview or production.");
  }

  let override;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== "--url" || override !== undefined) {
      throw usageError(`Unknown or repeated option: ${option ?? ""}`);
    }
    override = options[index + 1];
    if (!override) throw usageError("--url requires a value.");
    index += 1;
  }

  const environmentVariable = targetVariables[target];
  const baseURL = normalizeHostedBaseUrl(override ?? environment[environmentVariable]);
  if (
    environment.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() &&
    !isTrustedVercelAutomationOrigin(baseURL)
  ) {
    throw usageError(
      "The Vercel automation bypass may be sent only to this repository's trusted project origins.",
    );
  }
  return Object.freeze({ baseURL, target });
}

export async function runHostedSmoke(argv = process.argv.slice(2), environment = process.env) {
  const run = resolveHostedSmokeRun(argv, environment);
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    executable,
    ["exec", "playwright", "test", "--config=playwright.hosted.config.ts"],
    {
      cwd: repositoryRoot,
      env: {
        ...environment,
        HOSTED_SMOKE_TARGET: run.target,
        PLAYWRIGHT_BASE_URL: run.baseURL,
      },
      stdio: "inherit",
    },
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      child.kill(signal);
    });
  }

  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  try {
    process.exitCode = await runHostedSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Hosted smoke tests could not start.");
    process.exitCode = 1;
  }
}
