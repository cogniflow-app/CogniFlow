import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const RUNTIME_VARIABLES = Object.freeze([
  "CI",
  "COLORTERM",
  "COMSPEC",
  "FORCE_COLOR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "TERM",
  "TZ",
  "WINDIR",
]);

const HOSTED_ADDITIONS = new Set([
  "HOSTED_ACCEPTANCE_RUN_ID",
  "HOSTED_CONTENT_PREFLIGHT_FILE",
  "HOSTED_SMOKE_PREFLIGHT_FILE",
  "HOSTED_SMOKE_TARGET",
  "PLAYWRIGHT_BASE_URL",
]);

function safeEnvironmentValue(value) {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 16_384 && !value.includes("\0")
  );
}

function defaultBrowserPath(environment, platform) {
  const configured = environment.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (configured === "0") return configured;
  if (configured && isAbsolute(configured) && !configured.includes("\0")) return configured;

  const operatorHome = homedir();
  if (platform === "darwin") return join(operatorHome, "Library", "Caches", "ms-playwright");
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA?.trim();
    return join(
      localAppData && isAbsolute(localAppData)
        ? localAppData
        : join(operatorHome, "AppData", "Local"),
      "ms-playwright",
    );
  }
  return join(operatorHome, ".cache", "ms-playwright");
}

function makePrivateDirectory(path) {
  mkdirSync(path, { mode: 0o700, recursive: true });
  if (process.platform !== "win32") chmodSync(path, 0o700);
  return path;
}

export function createHostedPlaywrightEnvironment(
  environment,
  additions,
  { platform = process.platform, temporaryDirectory = tmpdir() } = {},
) {
  const sandboxRoot = mkdtempSync(join(resolve(temporaryDirectory), "lumen-hosted-browser-"));
  if (platform !== "win32") chmodSync(sandboxRoot, 0o700);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    rmSync(sandboxRoot, { force: true, recursive: true });
  };

  try {
    const home = makePrivateDirectory(join(sandboxRoot, "home"));
    const config = makePrivateDirectory(join(sandboxRoot, "config"));
    const cache = makePrivateDirectory(join(sandboxRoot, "cache"));
    const data = makePrivateDirectory(join(sandboxRoot, "data"));
    const state = makePrivateDirectory(join(sandboxRoot, "state"));
    const temporary = makePrivateDirectory(join(sandboxRoot, "tmp"));
    const operatorBrowserPath = defaultBrowserPath(environment, platform);
    const browserPath =
      operatorBrowserPath === "0" ? "0" : join(sandboxRoot, "playwright-browsers");
    if (operatorBrowserPath !== "0") {
      symlinkSync(operatorBrowserPath, browserPath, platform === "win32" ? "junction" : "dir");
    }
    const childEnvironment = {};
    const fixtureConfirmationFile = additions.HOSTED_ACCEPTANCE_RUN_ID
      ? join(sandboxRoot, "fixture-confirmed")
      : null;

    for (const name of RUNTIME_VARIABLES) {
      const value = environment[name];
      if (safeEnvironmentValue(value)) childEnvironment[name] = value;
    }
    for (const [name, value] of Object.entries(additions)) {
      if (!HOSTED_ADDITIONS.has(name) || !safeEnvironmentValue(value)) {
        throw new Error(`Hosted Playwright environment addition is not allowed: ${name}`);
      }
      childEnvironment[name] = value;
    }

    Object.assign(childEnvironment, {
      APPDATA: config,
      HOME: home,
      LOCALAPPDATA: cache,
      PLAYWRIGHT_BROWSERS_PATH: browserPath,
      TEMP: temporary,
      TMP: temporary,
      TMPDIR: temporary,
      USERPROFILE: home,
      XDG_CACHE_HOME: cache,
      XDG_CONFIG_HOME: config,
      XDG_DATA_HOME: data,
      XDG_STATE_HOME: state,
    });
    if (fixtureConfirmationFile) {
      childEnvironment.HOSTED_FIXTURE_CONFIRMATION_FILE = fixtureConfirmationFile;
    }

    return Object.freeze({
      cleanup,
      environment: Object.freeze(childEnvironment),
      fixtureConfirmationFile,
      sandboxRoot,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
