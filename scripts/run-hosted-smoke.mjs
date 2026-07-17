import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createHostedPlaywrightEnvironment } from "./hosted-child-environment.mjs";
import hostedPreflightContract from "./hosted-preflight.cjs";
import {
  authenticateVercelDeploymentOwnership,
  createHostedPreflightAttestation,
  fetchHostedHealthWithScopedBypass,
  resolveVercelAutomationBypass,
} from "./vercel-deployment-ownership.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const { createHostedPreflightFile, destroyHostedPreflightFile } = hostedPreflightContract;

const targetVariables = Object.freeze({
  preview: "HOSTED_PREVIEW_URL",
  production: "HOSTED_PRODUCTION_URL",
});

const targetHealthContracts = Object.freeze({
  preview: Object.freeze({
    supabaseProjectRef: "cfwddajyjbueggpzfomh",
    vercelEnvironment: "preview",
  }),
  production: Object.freeze({
    supabaseProjectRef: "qccbaynfvtyxigiikpmq",
    vercelEnvironment: "production",
  }),
});

function isProjectDeploymentHostname(hostname) {
  return /^cogniflow-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-cogniflow-app-3471s-projects\.vercel\.app$/u.test(
    hostname,
  );
}

export function isCandidateVercelAutomationOrigin(origin) {
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
    isProjectDeploymentHostname(hostname)
  );
}

export function isHostedSmokeOriginForTarget(origin, target) {
  let parsed;
  try {
    if (normalizeHostedBaseUrl(origin) !== origin) return false;
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (target === "preview") return isProjectDeploymentHostname(parsed.hostname);
  return target === "production" && parsed.origin === "https://recallflash.com";
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
  if (!isHostedSmokeOriginForTarget(baseURL, target)) {
    throw usageError(`The ${target} smoke target does not match its fixed hosted environment.`);
  }
  return Object.freeze({ baseURL, target });
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

export function assertHostedSmokeHealthProjection(value, target) {
  const health = record(value);
  const contract = targetHealthContracts[target];
  if (
    !contract ||
    health?.status !== "ok" ||
    health.provider !== "vercel" ||
    health.deploymentProfile !== "vercel_beta" ||
    health.vercelEnvironment !== contract.vercelEnvironment ||
    health.supabaseProjectRef !== contract.supabaseProjectRef ||
    typeof health.buildVersion !== "string" ||
    !health.buildVersion.trim() ||
    health.buildVersion === "development"
  ) {
    throw usageError(
      `The ${target} health projection does not match its fixed hosted environment.`,
    );
  }
}

export async function preflightHostedSmokeTarget(
  run,
  environment = process.env,
  fetchImplementation = fetch,
  authenticateOwnershipImplementation = authenticateVercelDeploymentOwnership,
  resolveBypassImplementation = resolveVercelAutomationBypass,
) {
  if (!isHostedSmokeOriginForTarget(run?.baseURL, run?.target)) {
    throw usageError("The hosted smoke target is not valid for its selected environment.");
  }
  const ownership = await authenticateOwnershipImplementation(run.baseURL, run.target, environment);
  const bypass = await resolveBypassImplementation(ownership, environment, {
    fetchImplementation,
  });
  const { bypassCookie, response } = await fetchHostedHealthWithScopedBypass(
    run.baseURL,
    bypass,
    fetchImplementation,
  );
  if (!response.ok || !response.headers.get("cache-control")?.includes("no-store")) {
    throw usageError(`The ${run.target} hosted health preflight failed.`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw usageError(`The ${run.target} hosted health response was invalid.`);
  }
  assertHostedSmokeHealthProjection(body, run.target);
  return createHostedPreflightAttestation({
    baseURL: run.baseURL,
    bypassCookie,
    ownership,
    target: run.target,
  });
}

export async function runHostedSmoke(argv = process.argv.slice(2), environment = process.env) {
  const run = resolveHostedSmokeRun(argv, environment);
  const preflight = await preflightHostedSmokeTarget(run, environment);
  const preflightFile = createHostedPreflightFile(preflight);
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  let sandbox;
  const signalHandlers = new Map();
  try {
    sandbox = createHostedPlaywrightEnvironment(environment, {
      HOSTED_SMOKE_PREFLIGHT_FILE: preflightFile,
      HOSTED_SMOKE_TARGET: run.target,
      PLAYWRIGHT_BASE_URL: run.baseURL,
    });
    const child = spawn(
      executable,
      ["exec", "playwright", "test", "--config=playwright.hosted.config.ts"],
      {
        cwd: repositoryRoot,
        env: sandbox.environment,
        stdio: "inherit",
      },
    );

    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => {
        child.kill(signal);
      };
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }

    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve(code ?? (signal ? 1 : 0));
      });
    });
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    sandbox?.cleanup();
    destroyHostedPreflightFile(preflightFile);
  }
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
