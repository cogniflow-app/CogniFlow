// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createHostedAcceptanceCleanupSql,
  createHostedAcceptanceIdentity,
  parsePreviewSecretKey,
} from "../scripts/run-hosted-content-acceptance.mjs";

const runId = "6d0cf9b2-165e-45d4-8d47-3624e42b9084";

describe("hosted content acceptance guard", () => {
  it("builds a reserved, non-personal fixture identity from a UUIDv4", () => {
    expect(createHostedAcceptanceIdentity(runId)).toEqual({
      email: "phase02-preview-6d0cf9b2165e45d48d473624e42b9084@example.test",
      runId,
    });
    expect(() => createHostedAcceptanceIdentity("'; drop table auth.users; --")).toThrow(/UUIDv4/u);
  });

  it("selects a server key without echoing it into an error", () => {
    expect(
      parsePreviewSecretKey(
        JSON.stringify([
          { api_key: "public-key-that-is-long-enough", name: "default", type: "publishable" },
          { api_key: "server-key-that-is-long-enough", name: "default", type: "secret" },
        ]),
      ),
    ).toBe("server-key-that-is-long-enough");
    expect(() => parsePreviewSecretKey("not-json")).toThrow(/invalid API-key inventory/u);
  });

  it("uses only the established deletion transactions for fixture cleanup", () => {
    const sql = createHostedAcceptanceCleanupSql(runId);
    expect(sql).toContain("public.admin_reject_provisional_account");
    expect(sql).toContain("public.admin_request_account_deletion");
    expect(sql).toContain("public.admin_process_account_deletion");
    expect(sql).toContain("lumen_hosted_acceptance");
    expect(sql).not.toMatch(/truncate|drop table|delete\s+from\s+public\.decks/iu);
  });
});
