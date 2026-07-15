import { describe, expect, it, vi } from "vitest";
import { createMemoryCookieStore } from "@lumen/test-utils";

import { createCookieDatabaseClient } from "../src/cookie-client";

const environment = {
  supabaseUrl: "http://127.0.0.1:54321",
  supabasePublishableKey: "sb_publishable_local_test",
};

describe("cookie-aware database client", () => {
  it("constructs without exposing a server credential", () => {
    const client = createCookieDatabaseClient(
      {
        getAll: () => [],
      },
      environment,
    );

    expect(client).toBeDefined();
  });

  it("accepts a mutable cookie adapter for auth refreshes", () => {
    const cookies = createMemoryCookieStore({ session: "test" });
    const setAll = vi.spyOn(cookies, "setAll");
    const client = createCookieDatabaseClient(cookies, environment);

    expect(client).toBeDefined();
    expect(setAll).not.toHaveBeenCalled();
  });
});
