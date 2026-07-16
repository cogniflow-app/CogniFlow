// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseSupabaseStatusEnvironment } from "../scripts/local-supabase-environment.mjs";

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
});
