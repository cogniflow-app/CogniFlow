import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@lumen/config/server-env", () => ({
  getServerEnvironment: () => ({
    public: {
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_local_test",
    },
    supabaseSecretKey: "test-secret-key-with-sufficient-length",
  }),
}));
vi.mock("@lumen/config/public-env", () => ({
  readPublicEnvironment: () => ({
    supabaseUrl: "http://127.0.0.1:54321",
    supabasePublishableKey: "sb_publishable_local_test",
  }),
}));

import { createBrowserDatabaseClient } from "../src/browser";
import { createRouteDatabaseClient } from "../src/route";
import { createPrivilegedDatabaseClient, createServerDatabaseClient } from "../src/server";
import { createTestDatabaseClient } from "../src/test";

describe("database client factories", () => {
  it("constructs the browser client with publishable configuration", () => {
    expect(createBrowserDatabaseClient()).toBeDefined();
  });

  it("constructs cookie-aware server and route clients", () => {
    const cookies = {
      getAll: () => [],
      setAll: vi.fn(),
    };

    expect(createServerDatabaseClient(cookies)).toBeDefined();
    expect(createRouteDatabaseClient(cookies)).toBeDefined();
  });

  it("constructs privileged clients only through explicit server/test paths", () => {
    expect(createPrivilegedDatabaseClient()).toBeDefined();
    expect(
      createTestDatabaseClient({
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseSecretKey: "test-secret-key-with-sufficient-length",
      }),
    ).toBeDefined();
  });
});
