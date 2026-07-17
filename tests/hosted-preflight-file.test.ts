// @vitest-environment node

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertHostedPreflightAttestation,
  consumeHostedPreflightFile,
  createHostedPreflightAttestation,
  createHostedPreflightFile,
  destroyHostedPreflightFile,
} from "../scripts/hosted-preflight.cjs";

const previewUrl =
  "https://cogniflow-git-codex-phase-02-ab12cd-cogniflow-app-3471s-projects.vercel.app";

function attestation(): string {
  return createHostedPreflightAttestation({
    baseURL: previewUrl,
    bypassCookie: {
      domain: new URL(previewUrl).hostname,
      expires: -1,
      httpOnly: true,
      name: "_vercel_jwt",
      path: "/",
      sameSite: "Lax",
      secure: true,
      value: "private-scoped-cookie-value-that-is-long-enough",
    },
    ownership: {
      deploymentId: "dpl_ownedPreview123",
      projectId: "prj_ownedProject123",
      teamId: "team_ownedTeam123",
    },
    target: "preview",
  });
}

describe("hosted preflight file boundary", () => {
  it("moves the scoped cookie through private one-use storage and removes it on consumption", () => {
    const encoded = attestation();
    const file = createHostedPreflightFile(encoded);
    const directory = dirname(file);
    try {
      expect(existsSync(file)).toBe(true);
      if (process.platform !== "win32") {
        expect(lstatSync(directory).mode & 0o077).toBe(0);
        expect(lstatSync(file).mode & 0o077).toBe(0);
      }
      const consumed = consumeHostedPreflightFile(file);
      expect(consumed).toBe(encoded);
      expect(existsSync(file)).toBe(false);
      expect(existsSync(directory)).toBe(false);
      expect(
        assertHostedPreflightAttestation(consumed, {
          baseURL: previewUrl,
          requiresOwnership: true,
          target: "preview",
        }).storageState?.cookies,
      ).toEqual([expect.objectContaining({ name: "_vercel_jwt" })]);
    } finally {
      destroyHostedPreflightFile(file);
    }
  });

  it("rejects and destroys a preflight file whose permissions were widened", () => {
    const file = createHostedPreflightFile(attestation());
    const directory = dirname(file);
    if (process.platform === "win32") {
      destroyHostedPreflightFile(file);
      return;
    }
    chmodSync(file, 0o644);
    expect(() => consumeHostedPreflightFile(file)).toThrow(/permissions are not private/u);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(directory)).toBe(false);
  });

  it("rejects a symlink swap without reading or deleting the target", () => {
    const targetDirectory = mkdtempSync(join(tmpdir(), "lumen-hosted-target-"));
    const target = join(targetDirectory, "operator-credential");
    writeFileSync(target, "must-remain-private", { mode: 0o600 });
    const file = createHostedPreflightFile(attestation());
    try {
      unlinkSync(file);
      symlinkSync(target, file);
      expect(() => consumeHostedPreflightFile(file)).toThrow(/regular file/u);
      expect(readFileSync(target, "utf8")).toBe("must-remain-private");
    } finally {
      destroyHostedPreflightFile(file);
      rmSync(targetDirectory, { force: true, recursive: true });
    }
  });

  it("does not follow a replaced runtime-directory symlink during rejection cleanup", () => {
    const targetDirectory = mkdtempSync(join(tmpdir(), "lumen-hosted-directory-target-"));
    const target = join(targetDirectory, "attestation");
    writeFileSync(target, "must-remain-private", { mode: 0o600 });
    const file = createHostedPreflightFile(attestation());
    const runtimeDirectory = dirname(file);
    const movedRuntimeDirectory = `${runtimeDirectory}-moved`;
    try {
      renameSync(runtimeDirectory, movedRuntimeDirectory);
      symlinkSync(targetDirectory, runtimeDirectory, "dir");
      expect(() => consumeHostedPreflightFile(file)).toThrow(/must be a directory/u);
      expect(readFileSync(target, "utf8")).toBe("must-remain-private");
    } finally {
      if (existsSync(runtimeDirectory) && lstatSync(runtimeDirectory).isSymbolicLink()) {
        unlinkSync(runtimeDirectory);
      }
      rmSync(movedRuntimeDirectory, { force: true, recursive: true });
      rmSync(targetDirectory, { force: true, recursive: true });
    }
  });

  it("will not consume or delete an arbitrary path outside its generated runtime directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "not-a-hosted-preflight-"));
    const file = join(directory, "credential");
    writeFileSync(file, "operator-value", { mode: 0o600 });
    try {
      expect(() => consumeHostedPreflightFile(file)).toThrow(/outside its private runtime/u);
      expect(readFileSync(file, "utf8")).toBe("operator-value");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rejects invalid or oversized values before creating a file", () => {
    expect(() => createHostedPreflightFile("not+base64url")).toThrow(/attestation is invalid/u);
    expect(() => createHostedPreflightFile("a".repeat(8_193))).toThrow(/attestation is invalid/u);
  });
});
