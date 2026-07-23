// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  ensureLocalSupabaseGateway,
  parseSupabaseStatusEnvironment,
} from "../scripts/local-supabase-environment.mjs";

describe("local Supabase environment parser", () => {
  it("maps current publishable and secret key names without returning unrelated values", () => {
    const environment = parseSupabaseStatusEnvironment(`
API_URL="http://127.0.0.1:54321"
DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
PUBLISHABLE_KEY="fixture-publishable"
SECRET_KEY="fixture-secret-value"
JWT_SECRET="must-not-be-forwarded"
`);

    expect(environment).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
      SUPABASE_SECRET_KEY: "fixture-secret-value",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(JSON.stringify(environment)).not.toContain("must-not-be-forwarded");
  });

  it("supports legacy local key names and rejects incomplete output", () => {
    expect(
      parseSupabaseStatusEnvironment(`
API_URL=http://127.0.0.1:54321
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
ANON_KEY=legacy-publishable
SERVICE_ROLE_KEY=legacy-secret
`),
    ).toMatchObject({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "legacy-publishable",
      SUPABASE_SECRET_KEY: "legacy-secret",
    });
    expect(() => parseSupabaseStatusEnvironment("API_URL=http://127.0.0.1:54321")).toThrow(
      /required application value/u,
    );
    expect(() => parseSupabaseStatusEnvironment('API_URL="bad\\q"\n')).toThrow(/malformed quoted/u);
  });

  it("refreshes only the named local gateway when Auth has stale container routing", async () => {
    const fetchResults = [false, false, true];
    const executions: Array<{
      readonly executable: string;
      readonly arguments_: readonly string[];
    }> = [];

    const result = await ensureLocalSupabaseGateway(
      {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      },
      {
        execFileImplementation: async (executable: string, arguments_: readonly string[]) => {
          executions.push({ arguments_, executable });
          return { stderr: "", stdout: "" };
        },
        fetchImplementation: async () =>
          new Response(null, { status: fetchResults.shift() ? 200 : 502 }),
        readFileImplementation: async () => 'project_id = "lumen-local"\n',
        waitImplementation: async () => undefined,
      },
    );

    expect(result).toEqual({ refreshed: true });
    expect(executions).toEqual([
      {
        arguments_: ["restart", "supabase_kong_lumen-local"],
        executable: "docker",
      },
    ]);
  });

  it("does not touch Docker when local Auth is already healthy", async () => {
    let executed = false;
    const result = await ensureLocalSupabaseGateway(
      {
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      },
      {
        execFileImplementation: async () => {
          executed = true;
          return { stderr: "", stdout: "" };
        },
        fetchImplementation: async () => new Response(null, { status: 200 }),
      },
    );

    expect(result).toEqual({ refreshed: false });
    expect(executed).toBe(false);
  });
});
