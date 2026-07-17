/* eslint-disable @typescript-eslint/no-require-imports -- Playwright loads this shared contract from TS config and Node ESM runners. */
const {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, isAbsolute, join, resolve } = require("node:path");

const MAX_ATTESTATION_BYTES = 8_192;
const PREFLIGHT_DIRECTORY_PREFIX = "lumen-hosted-preflight-";
const PREFLIGHT_FILE_NAME = "attestation";

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function createHostedPreflightAttestation({
  baseURL,
  bypassCookie = null,
  ownership = null,
  target,
}) {
  const payload = {
    baseURL,
    bypassCookie,
    deploymentId: ownership?.deploymentId ?? null,
    nonce: globalThis.crypto.randomUUID(),
    projectId: ownership?.projectId ?? null,
    target,
    teamId: ownership?.teamId ?? null,
    verification: ownership ? "vercel-api" : "public-health",
    version: 1,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function validateEncodedAttestation(encoded) {
  if (
    typeof encoded !== "string" ||
    !encoded ||
    Buffer.byteLength(encoded, "utf8") > MAX_ATTESTATION_BYTES ||
    !/^[A-Za-z0-9_-]+$/u.test(encoded)
  ) {
    throw new Error("Hosted preflight attestation is invalid.");
  }
}

function assertHostedPreflightPath(filePath) {
  if (typeof filePath !== "string" || !isAbsolute(filePath) || resolve(filePath) !== filePath) {
    throw new Error("Hosted preflight file path is invalid.");
  }
  const directory = dirname(filePath);
  if (
    basename(filePath) !== PREFLIGHT_FILE_NAME ||
    !basename(directory).startsWith(PREFLIGHT_DIRECTORY_PREFIX) ||
    dirname(directory) !== resolve(tmpdir())
  ) {
    throw new Error("Hosted preflight file path is outside its private runtime directory.");
  }
  return directory;
}

function assertPrivateFile(stat, label, expectedMode) {
  if (label === "file" && !stat.isFile()) {
    throw new Error("Hosted preflight attestation must be a regular file.");
  }
  if (label === "directory" && !stat.isDirectory()) {
    throw new Error("Hosted preflight runtime path must be a directory.");
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error(`Hosted preflight ${label} permissions are not private.`);
  }
  if (process.platform !== "win32" && (stat.mode & 0o700) !== expectedMode) {
    throw new Error(`Hosted preflight ${label} permissions are invalid.`);
  }
  if (
    typeof process.getuid === "function" &&
    typeof stat.uid === "number" &&
    stat.uid !== process.getuid()
  ) {
    throw new Error(`Hosted preflight ${label} is owned by another account.`);
  }
}

function destroyHostedPreflightFile(filePath) {
  if (typeof filePath !== "string") return;
  let directory;
  try {
    directory = assertHostedPreflightPath(filePath);
    const directoryStat = lstatSync(directory);
    if (!directoryStat.isDirectory()) return;
    if (
      typeof process.getuid === "function" &&
      typeof directoryStat.uid === "number" &&
      directoryStat.uid !== process.getuid()
    ) {
      return;
    }
  } catch {
    return;
  }
  try {
    const fileStat = lstatSync(filePath);
    if (fileStat.isFile() || fileStat.isSymbolicLink()) unlinkSync(filePath);
  } catch {
    // The one-use file may already be gone; never broaden cleanup to other directory contents.
  }
  try {
    rmdirSync(directory);
  } catch {
    // Leave a non-empty or concurrently replaced directory for operator inspection.
  }
}

function createHostedPreflightFile(encoded) {
  validateEncodedAttestation(encoded);
  const directory = mkdtempSync(join(resolve(tmpdir()), PREFLIGHT_DIRECTORY_PREFIX));
  const filePath = join(directory, PREFLIGHT_FILE_NAME);
  let descriptor;
  try {
    chmodSync(directory, 0o700);
    descriptor = openSync(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descriptor, encoded, { encoding: "utf8" });
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(filePath, 0o600);
    assertPrivateFile(lstatSync(directory), "directory", 0o700);
    assertPrivateFile(lstatSync(filePath), "file", 0o600);
    return filePath;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    destroyHostedPreflightFile(filePath);
    throw error;
  }
}

function consumeHostedPreflightFile(filePath) {
  const directory = assertHostedPreflightPath(filePath);
  let descriptor;
  try {
    const directoryStat = lstatSync(directory);
    const fileStat = lstatSync(filePath);
    assertPrivateFile(directoryStat, "directory", 0o700);
    assertPrivateFile(fileStat, "file", 0o600);
    if (fileStat.size <= 0 || fileStat.size > MAX_ATTESTATION_BYTES) {
      throw new Error("Hosted preflight attestation file has an invalid size.");
    }
    descriptor = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const openedStat = fstatSync(descriptor);
    assertPrivateFile(openedStat, "file", 0o600);
    if (openedStat.dev !== fileStat.dev || openedStat.ino !== fileStat.ino) {
      throw new Error("Hosted preflight attestation changed before it could be consumed.");
    }
    const encoded = readFileSync(descriptor, "utf8");
    validateEncodedAttestation(encoded);
    return encoded;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    destroyHostedPreflightFile(filePath);
  }
}

function assertHostedPreflightAttestation(encoded, { baseURL, requiresOwnership, target }) {
  if (
    typeof encoded !== "string" ||
    !encoded ||
    encoded.length > MAX_ATTESTATION_BYTES ||
    !/^[A-Za-z0-9_-]+$/u.test(encoded)
  ) {
    throw new Error("Hosted Playwright must be started through its guarded runner.");
  }
  let payload;
  try {
    payload = record(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  } catch {
    throw new Error("Hosted Playwright received an invalid runner preflight attestation.");
  }
  const ownershipIsValid =
    payload?.verification === "vercel-api" &&
    typeof payload.deploymentId === "string" &&
    /^dpl_[A-Za-z0-9]+$/u.test(payload.deploymentId) &&
    typeof payload.projectId === "string" &&
    /^prj_[A-Za-z0-9]+$/u.test(payload.projectId) &&
    typeof payload.teamId === "string" &&
    /^(?:team|user)_[A-Za-z0-9]+$/u.test(payload.teamId);
  const hostname = new URL(baseURL).hostname;
  const bypassCookie = record(payload?.bypassCookie);
  const bypassCookieIsValid =
    bypassCookie === null ||
    (ownershipIsValid &&
      bypassCookie.domain === hostname &&
      bypassCookie.expires === -1 &&
      bypassCookie.httpOnly === true &&
      bypassCookie.name === "_vercel_jwt" &&
      bypassCookie.path === "/" &&
      bypassCookie.sameSite === "Lax" &&
      bypassCookie.secure === true &&
      typeof bypassCookie.value === "string" &&
      bypassCookie.value.length >= 16 &&
      bypassCookie.value.length <= 4_096 &&
      !/[\u0000-\u0020;\u007f]/u.test(bypassCookie.value));
  if (
    payload?.version !== 1 ||
    payload.baseURL !== baseURL ||
    payload.target !== target ||
    typeof payload.nonce !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      payload.nonce,
    ) ||
    !bypassCookieIsValid ||
    (requiresOwnership && !ownershipIsValid) ||
    (!requiresOwnership &&
      payload.verification !== "public-health" &&
      payload.verification !== "vercel-api")
  ) {
    throw new Error("Hosted Playwright preflight does not match its exact deployment target.");
  }
  return Object.freeze({
    baseURL: payload.baseURL,
    deploymentId: ownershipIsValid ? payload.deploymentId : null,
    projectId: ownershipIsValid ? payload.projectId : null,
    target: payload.target,
    teamId: ownershipIsValid ? payload.teamId : null,
    verification: payload.verification,
    storageState:
      bypassCookie && bypassCookieIsValid
        ? Object.freeze({ cookies: [Object.freeze({ ...bypassCookie })], origins: [] })
        : undefined,
  });
}

module.exports = {
  assertHostedPreflightAttestation,
  consumeHostedPreflightFile,
  createHostedPreflightAttestation,
  createHostedPreflightFile,
  destroyHostedPreflightFile,
};
