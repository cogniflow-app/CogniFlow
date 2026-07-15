import { describe, expect, it } from "vitest";

import {
  createEnvironmentFixture,
  createMemoryCookieStore,
  createRuntimeFixture,
} from "../src/index";

describe("test fixtures", () => {
  it("applies explicit environment overrides", () => {
    expect(createEnvironmentFixture({ ENABLE_CHILD_PROFILES: "true" })).toMatchObject({
      ENABLE_CHILD_PROFILES: "true",
      NODE_ENV: "test",
    });
  });

  it("creates normalized runtime data", () => {
    expect(createRuntimeFixture({ provider: "cloudflare" })).toMatchObject({
      provider: "cloudflare",
      runtime: "nodejs",
    });
  });

  it("provides an isolated mutable cookie store", () => {
    const cookies = createMemoryCookieStore({ first: "one" });
    cookies.setAll([{ name: "second", value: "two" }]);

    expect(cookies.getAll()).toEqual([
      { name: "first", value: "one" },
      { name: "second", value: "two" },
    ]);
  });
});
