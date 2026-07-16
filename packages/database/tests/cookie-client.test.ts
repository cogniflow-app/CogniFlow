import { describe, expect, it, vi } from "vitest";
import { createMemoryCookieStore } from "@lumen/test-utils";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(() => ({})) }));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { createCookieDatabaseClient } from "../src/cookie-client";

const environment = {
  supabaseUrl: "http://127.0.0.1:54321",
  supabasePublishableKey: "sb_publishable_local_test",
  secureCookies: false,
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

  it("uses the application deployment decision for Secure auth cookies", () => {
    createCookieDatabaseClient({ getAll: () => [] }, { ...environment, secureCookies: true });

    expect(mocks.createServerClient).toHaveBeenLastCalledWith(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
      expect.objectContaining({
        cookieOptions: expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          secure: true,
        }),
      }),
    );
  });
});
