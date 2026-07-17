import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import hostedPreflightContract from "./hosted-preflight.cjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const LINK_PATH = resolve(repositoryRoot, ".vercel/project.json");
const MAX_API_RESPONSE_BYTES = 1_048_576;

export const { assertHostedPreflightAttestation, createHostedPreflightAttestation } =
  hostedPreflightContract;

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function ownershipError(message) {
  return new Error(`Vercel deployment ownership could not be authenticated: ${message}`);
}

function validateLinkedProject(value) {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.projectId !== "string" ||
    !/^prj_[A-Za-z0-9]+$/u.test(candidate.projectId) ||
    typeof candidate.orgId !== "string" ||
    !/^(?:team|user)_[A-Za-z0-9]+$/u.test(candidate.orgId) ||
    (candidate.projectName !== undefined &&
      (typeof candidate.projectName !== "string" || !candidate.projectName.trim()))
  ) {
    throw ownershipError("the linked project metadata is invalid.");
  }
  return Object.freeze({
    orgId: candidate.orgId,
    projectId: candidate.projectId,
    projectName: candidate.projectName?.trim() || null,
  });
}

function linkedProjectFromEnvironment(environment) {
  const projectId = environment.VERCEL_PROJECT_ID?.trim();
  const orgId = environment.VERCEL_ORG_ID?.trim();
  if (!projectId && !orgId) return null;
  if (!projectId || !orgId) {
    throw ownershipError("VERCEL_PROJECT_ID and VERCEL_ORG_ID must be supplied together.");
  }
  return validateLinkedProject({ orgId, projectId });
}

export async function readLinkedVercelProject(
  environment = process.env,
  readFileImplementation = readFile,
) {
  const fromEnvironment = linkedProjectFromEnvironment(environment);
  let fromFile = null;
  try {
    fromFile = validateLinkedProject(JSON.parse(await readFileImplementation(LINK_PATH, "utf8")));
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) {
      if (error instanceof SyntaxError) {
        throw ownershipError(".vercel/project.json is not valid JSON.");
      }
      throw error;
    }
  }

  if (
    fromEnvironment &&
    fromFile &&
    (fromEnvironment.projectId !== fromFile.projectId || fromEnvironment.orgId !== fromFile.orgId)
  ) {
    throw ownershipError("the CI project/team IDs disagree with .vercel/project.json.");
  }
  const selected = fromFile ?? fromEnvironment;
  if (!selected) {
    throw ownershipError(
      "link the repository with Vercel or set VERCEL_PROJECT_ID and VERCEL_ORG_ID in CI.",
    );
  }
  return selected;
}

function vercelCliAuthPaths(environment, platform, homeDirectory) {
  if (platform === "darwin") {
    return [join(homeDirectory, "Library", "Application Support", "com.vercel.cli", "auth.json")];
  }
  if (platform === "win32") {
    const appData = environment.APPDATA?.trim();
    return appData ? [join(appData, "com.vercel.cli", "auth.json")] : [];
  }
  const dataHome = environment.XDG_DATA_HOME?.trim() || join(homeDirectory, ".local", "share");
  return [join(dataHome, "com.vercel.cli", "auth.json")];
}

export async function readVercelAccessToken(
  environment = process.env,
  {
    homeDirectory = homedir(),
    nowImplementation = Date.now,
    platform = process.platform,
    readFileImplementation = readFile,
  } = {},
) {
  const environmentToken = environment.VERCEL_TOKEN?.trim();
  if (environmentToken) return environmentToken;

  for (const authPath of vercelCliAuthPaths(environment, platform, homeDirectory)) {
    try {
      const auth = record(JSON.parse(await readFileImplementation(authPath, "utf8")));
      if (
        typeof auth?.token !== "string" ||
        !auth.token.trim() ||
        typeof auth.refreshToken !== "string" ||
        !auth.refreshToken.trim() ||
        typeof auth.expiresAt !== "number" ||
        !Number.isSafeInteger(auth.expiresAt) ||
        auth.expiresAt <= 0
      ) {
        throw ownershipError("the Vercel CLI authentication file has an invalid OAuth session.");
      }
      if (auth.expiresAt <= Math.floor(nowImplementation() / 1_000)) {
        throw ownershipError(
          "the Vercel CLI access token has expired; refresh the authenticated CLI immediately before the hosted run.",
        );
      }
      return auth.token.trim();
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") continue;
      if (error instanceof SyntaxError) {
        throw ownershipError("the Vercel CLI authentication file is not valid JSON.");
      }
      throw error;
    }
  }

  throw ownershipError("set VERCEL_TOKEN in CI or authenticate the local Vercel CLI.");
}

function deploymentHostnames(deployment) {
  const hostnames = new Set();
  for (const value of [
    deployment.url,
    ...(Array.isArray(deployment.alias) ? deployment.alias : []),
    ...(Array.isArray(deployment.automaticAliases) ? deployment.automaticAliases : []),
    ...(Array.isArray(deployment.userAliases) ? deployment.userAliases : []),
  ]) {
    if (typeof value === "string" && value.trim()) hostnames.add(value.trim().toLowerCase());
  }
  return hostnames;
}

export function assertVercelDeploymentMetadata(value, { baseURL, linkedProject, target }) {
  const deployment = record(value);
  const project = record(deployment?.project);
  const team = record(deployment?.team);
  const requestedHostname = new URL(baseURL).hostname.toLowerCase();
  const expectedTarget = target === "preview" ? null : "production";
  if (
    !deployment ||
    typeof deployment.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/u.test(deployment.id) ||
    deployment.readyState !== "READY" ||
    deployment.target !== expectedTarget ||
    deployment.projectId !== linkedProject.projectId ||
    project?.id !== linkedProject.projectId ||
    team?.id !== linkedProject.orgId ||
    deployment.ownerId !== linkedProject.orgId ||
    (linkedProject.projectName &&
      (deployment.name !== linkedProject.projectName ||
        project.name !== linkedProject.projectName)) ||
    !deploymentHostnames(deployment).has(requestedHostname)
  ) {
    throw ownershipError("the deployment does not belong to the linked project/team and target.");
  }

  return Object.freeze({
    baseURL,
    deploymentId: deployment.id,
    projectName: linkedProject.projectName,
    projectId: linkedProject.projectId,
    target,
    teamId: linkedProject.orgId,
  });
}

function validBypassToken(value) {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 4_096 &&
    !/[\u0000-\u0020;\u007f]/u.test(value)
  );
}

export function selectVercelAutomationBypass(value, ownership) {
  const project = record(value);
  const protectionBypass = record(project?.protectionBypass);
  if (
    !project ||
    project.id !== ownership?.projectId ||
    project.accountId !== ownership?.teamId ||
    (ownership?.projectName && project.name !== ownership.projectName) ||
    !protectionBypass
  ) {
    throw ownershipError("the project bypass inventory does not match the linked project/team.");
  }

  const candidates = Object.entries(protectionBypass).filter(
    ([, metadata]) => record(metadata)?.scope === "automation-bypass",
  );
  if (candidates.length !== 1 || !validBypassToken(candidates[0]?.[0])) {
    throw ownershipError(
      "the linked project must expose exactly one existing automation bypass token.",
    );
  }
  return candidates[0][0];
}

export async function resolveVercelAutomationBypass(
  ownership,
  environment = process.env,
  {
    fetchImplementation = fetch,
    homeDirectory = homedir(),
    nowImplementation = Date.now,
    platform = process.platform,
    readFileImplementation = readFile,
  } = {},
) {
  if (
    !ownership ||
    typeof ownership.projectId !== "string" ||
    typeof ownership.teamId !== "string"
  ) {
    throw ownershipError("deployment ownership must be authenticated before reading a bypass.");
  }
  const accessToken = await readVercelAccessToken(environment, {
    homeDirectory,
    nowImplementation,
    platform,
    readFileImplementation,
  });
  const endpoint = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(ownership.projectId)}`,
  );
  endpoint.searchParams.set("teamId", ownership.teamId);
  const response = await fetchImplementation(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw ownershipError("the authenticated Vercel project lookup failed.");
  }
  const serialized = await response.text();
  if (Buffer.byteLength(serialized, "utf8") > MAX_API_RESPONSE_BYTES) {
    throw ownershipError("the Vercel project response exceeded its size limit.");
  }
  let project;
  try {
    project = JSON.parse(serialized);
  } catch {
    throw ownershipError("the Vercel project response was invalid.");
  }
  const configured = selectVercelAutomationBypass(project, ownership);
  const override = environment.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (override !== undefined && (!validBypassToken(override) || override !== configured)) {
    throw ownershipError(
      "the supplied automation bypass does not match the linked project's existing token.",
    );
  }
  return override ?? configured;
}

export async function authenticateVercelDeploymentOwnership(
  baseURL,
  target,
  environment = process.env,
  {
    fetchImplementation = fetch,
    homeDirectory = homedir(),
    nowImplementation = Date.now,
    platform = process.platform,
    readFileImplementation = readFile,
  } = {},
) {
  const parsed = new URL(baseURL);
  if (parsed.origin !== baseURL || (target !== "preview" && target !== "production")) {
    throw ownershipError("the requested origin or target is invalid.");
  }
  const linkedProject = await readLinkedVercelProject(environment, readFileImplementation);
  const accessToken = await readVercelAccessToken(environment, {
    homeDirectory,
    nowImplementation,
    platform,
    readFileImplementation,
  });
  const endpoint = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(parsed.hostname)}`,
  );
  endpoint.searchParams.set("teamId", linkedProject.orgId);

  const response = await fetchImplementation(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw ownershipError("the authenticated Vercel deployment lookup failed.");
  }
  const serialized = await response.text();
  if (Buffer.byteLength(serialized, "utf8") > MAX_API_RESPONSE_BYTES) {
    throw ownershipError("the Vercel deployment response exceeded its size limit.");
  }
  let deployment;
  try {
    deployment = JSON.parse(serialized);
  } catch {
    throw ownershipError("the Vercel deployment response was invalid.");
  }
  return assertVercelDeploymentMetadata(deployment, { baseURL, linkedProject, target });
}

export function parseVercelBypassCookie(setCookieHeaders, baseURL) {
  if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) {
    throw new Error("Vercel did not return the requested scoped bypass cookie.");
  }
  const hostname = new URL(baseURL).hostname;
  const candidates = [];
  for (const serialized of setCookieHeaders) {
    if (typeof serialized !== "string" || serialized.length > 8_192) continue;
    const [pair, ...rawAttributes] = serialized.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (
      name !== "_vercel_jwt" ||
      value.length < 16 ||
      value.length > 4_096 ||
      /[\u0000-\u0020;\u007f]/u.test(value)
    ) {
      continue;
    }
    const attributes = new Map();
    for (const rawAttribute of rawAttributes) {
      const [rawName, ...rawValue] = rawAttribute.trim().split("=");
      if (rawName) attributes.set(rawName.toLowerCase(), rawValue.join("=").trim());
    }
    if (
      attributes.has("domain") ||
      attributes.get("path") !== "/" ||
      !attributes.has("secure") ||
      !attributes.has("httponly") ||
      attributes.get("samesite")?.toLowerCase() !== "lax"
    ) {
      continue;
    }
    candidates.push(
      Object.freeze({
        domain: hostname,
        expires: -1,
        httpOnly: true,
        name,
        path: "/",
        sameSite: "Lax",
        secure: true,
        value,
      }),
    );
  }
  if (candidates.length !== 1) {
    throw new Error("Vercel returned an invalid or ambiguous scoped bypass cookie.");
  }
  return candidates[0];
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

export async function fetchHostedHealthWithScopedBypass(
  baseURL,
  bypass,
  fetchImplementation = fetch,
) {
  const healthUrl = `${baseURL}/api/health`;
  if (!bypass) {
    return Object.freeze({
      bypassCookie: null,
      response: await fetchImplementation(healthUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      }),
    });
  }

  const bootstrap = await fetchImplementation(healthUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "x-vercel-protection-bypass": bypass,
      "x-vercel-set-bypass-cookie": "true",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const setCookieHeaders = getSetCookieHeaders(bootstrap.headers);
  if (setCookieHeaders.length === 0 && bootstrap.ok) {
    return Object.freeze({ bypassCookie: null, response: bootstrap });
  }
  const bypassCookie = parseVercelBypassCookie(setCookieHeaders, baseURL);
  if (bootstrap.status >= 300 && bootstrap.status < 400) {
    const location = bootstrap.headers.get("location");
    let redirected;
    try {
      redirected = location ? new URL(location, healthUrl) : null;
    } catch {
      redirected = null;
    }
    if (
      !redirected ||
      redirected.origin !== baseURL ||
      redirected.pathname !== "/api/health" ||
      redirected.search ||
      redirected.hash
    ) {
      throw new Error("Vercel returned an unsafe bypass-cookie redirect.");
    }
  } else if (!bootstrap.ok) {
    throw new Error("Vercel bypass-cookie bootstrap failed.");
  }

  const response = await fetchImplementation(healthUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Cookie: `${bypassCookie.name}=${bypassCookie.value}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  return Object.freeze({ bypassCookie, response });
}
