// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  assertBetaPromotionState,
  assertCommittedMigrationFileSet,
  assertDeployableMigrationHistory,
  assertExactMigrationHistory,
  assertEmptyHostedStorage,
  assertPreviewPromotionState,
  createHostedDatabaseCommandPlan,
  HOSTED_DATABASE_TARGETS,
  migrationVersionsFromFileNames,
  parseHostedDatabaseArguments,
  parseMigrationList,
} from "../scripts/hosted-database.mjs";

const versions = ["20260714000000", "20260715000000", "20260715001000"];

function history(localVersions: readonly string[], remoteVersions: readonly string[]) {
  const allVersions = [...new Set([...localVersions, ...remoteVersions])].sort();
  return allVersions.map((version) => ({
    local: localVersions.includes(version) ? version : null,
    remote: remoteVersions.includes(version) ? version : null,
  }));
}

describe("hosted database command guards", () => {
  it("accepts only fixed actions and fixed hosted targets", () => {
    expect(parseHostedDatabaseArguments(["deploy", "preview"])).toMatchObject({
      action: "deploy",
      targetName: "preview",
      target: HOSTED_DATABASE_TARGETS.preview,
    });
    expect(parseHostedDatabaseArguments(["verify", "beta"])).toMatchObject({
      target: HOSTED_DATABASE_TARGETS.beta,
    });
    expect(() => parseHostedDatabaseArguments(["reset", "beta"])).toThrow(/deploy or verify/u);
    expect(() => parseHostedDatabaseArguments(["deploy", "production"])).toThrow(
      /preview or beta/u,
    );
    expect(() => parseHostedDatabaseArguments(["deploy"])).toThrow(/Usage/u);
  });

  it("derives sorted unique migration versions from strictly named files", () => {
    expect(
      migrationVersionsFromFileNames([
        "20260715000000_identity.sql",
        "README.md",
        "20260714000000_foundation.sql",
      ]),
    ).toEqual(["20260714000000", "20260715000000"]);
    expect(() => migrationVersionsFromFileNames(["unsafe.sql"])).toThrow(/Invalid migration/u);
    expect(() =>
      migrationVersionsFromFileNames(["20260714000000_a.sql", "20260714000000_b.sql"]),
    ).toThrow(/unique/u);
  });

  it("rejects any on-disk migration that is not in the committed file set", () => {
    expect(() =>
      assertCommittedMigrationFileSet(
        ["20260714000000_foundation.sql", "20260715000000_identity.sql"],
        ["20260714000000_foundation.sql", "20260715000000_identity.sql"],
      ),
    ).not.toThrow();
    expect(() =>
      assertCommittedMigrationFileSet(
        [
          "20260714000000_foundation.sql",
          "20260715000000_identity.sql",
          "20260715999999_locally_ignored.sql",
        ],
        ["20260714000000_foundation.sql", "20260715000000_identity.sql"],
      ),
    ).toThrow(/committed regular file/u);
    expect(() =>
      assertCommittedMigrationFileSet(
        ["20260714000000_foundation.sql"],
        ["20260714000000_foundation.sql", "20260715000000_missing.sql"],
      ),
    ).toThrow(/committed regular file/u);
  });

  it("parses machine-readable migration rows without accepting malformed versions", () => {
    expect(
      parseMigrationList(
        JSON.stringify({
          migrations: [
            { local: versions[0], remote: versions[0] },
            { local: versions[1], remote: null },
          ],
        }),
      ),
    ).toEqual([
      { local: versions[0], remote: versions[0] },
      { local: versions[1], remote: null },
    ]);
    expect(() => parseMigrationList("not-json")).toThrow(/valid JSON/u);
    expect(() => parseMigrationList('{"migrations":[{"local":"bad"}]}')).toThrow(/invalid local/u);
  });

  it("permits only a remote prefix before deployment and exact parity afterward", () => {
    expect(() =>
      assertDeployableMigrationHistory(history(versions, versions.slice(0, 1)), versions),
    ).not.toThrow();
    expect(() => assertExactMigrationHistory(history(versions, versions), versions)).not.toThrow();
    expect(() =>
      assertDeployableMigrationHistory(history(versions, [versions[0], versions[2]]), versions),
    ).toThrow(/Remote migration history/u);
    expect(() =>
      assertDeployableMigrationHistory(
        history(versions, [...versions, "20260715999999"]),
        versions,
      ),
    ).toThrow(/absent from local/u);
    expect(() =>
      assertExactMigrationHistory(history(versions, versions.slice(0, 2)), versions),
    ).toThrow(/Remote migration history/u);
  });

  it("requires main, a clean worktree, and exact origin/main parity for Beta", () => {
    expect(() =>
      assertBetaPromotionState({ branch: "main", status: "", head: "abc", originMain: "abc" }),
    ).not.toThrow();
    expect(() =>
      assertBetaPromotionState({ branch: "feature", status: "", head: "abc", originMain: "abc" }),
    ).toThrow(/main branch/u);
    expect(() =>
      assertBetaPromotionState({
        branch: "main",
        status: " M file",
        head: "abc",
        originMain: "abc",
      }),
    ).toThrow(/clean worktree/u);
    expect(() =>
      assertBetaPromotionState({ branch: "main", status: "", head: "abc", originMain: "def" }),
    ).toThrow(/origin\/main/u);
  });

  it("requires the committed migration tree to be tracked and clean for Preview", () => {
    expect(() => assertPreviewPromotionState({ migrationStatus: "" })).not.toThrow();
    expect(() =>
      assertPreviewPromotionState({
        migrationStatus: "?? supabase/migrations/20260715999999_untracked.sql",
      }),
    ).toThrow(/tracked and clean/u);
    expect(() =>
      assertPreviewPromotionState({
        migrationStatus: " M supabase/migrations/20260715000000_identity_privacy_schema.sql",
      }),
    ).toThrow(/tracked and clean/u);
  });

  it("builds plans with no seed, reset, repair, include-all, or config-push path", () => {
    for (const action of ["deploy", "verify"] as const) {
      for (const target of ["preview", "beta"] as const) {
        const plan = createHostedDatabaseCommandPlan(action, target);
        const flattened = plan.flat().join(" ");
        expect(flattened).toContain(HOSTED_DATABASE_TARGETS[target].projectRef);
        expect(flattened).not.toMatch(
          /include-seed|include-all|\bseed\b|\breset\b|\brepair\b|config push/u,
        );
      }
    }

    expect(createHostedDatabaseCommandPlan("deploy", "preview")).toContainEqual([
      "supabase",
      "db",
      "push",
      "--linked",
      "--dry-run",
    ]);
    expect(createHostedDatabaseCommandPlan("verify", "preview")).toContainEqual([
      "node",
      "scripts/generate-database-types.mjs",
      "--check",
      "--linked",
    ]);
  });

  it("requires an empty hosted storage inventory", () => {
    expect(() => assertEmptyHostedStorage('{"paths":[],"message":""}')).not.toThrow();
    expect(() => assertEmptyHostedStorage('{"paths":[{"name":"unexpected"}]}')).toThrow(
      /outside the Phase 01 contract/u,
    );
    expect(() => assertEmptyHostedStorage("not-json")).toThrow(/valid JSON/u);
  });
});
