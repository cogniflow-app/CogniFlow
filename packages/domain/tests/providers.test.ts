import { describe, expect, it } from "vitest";

import {
  createRuntimeDescriptor,
  createRuntimeHealth,
  summarizeProviderAvailability,
} from "../src/index";

describe("provider portability contracts", () => {
  it("summarizes providers deterministically without provider configuration", () => {
    expect(
      summarizeProviderAvailability([
        { kind: "realtime", provider: "supabase", status: "available" },
        { kind: "ai", provider: "none", status: "disabled" },
        { kind: "runtime", provider: "local", status: "available" },
      ]),
    ).toEqual({
      available: ["realtime", "runtime"],
      degraded: [],
      disabled: ["ai"],
    });
  });

  it("builds a stable health projection", () => {
    const descriptor = createRuntimeDescriptor({
      provider: "vercel",
      runtime: "nodejs",
      buildVersion: " 0.0.0 ",
      commitSha: " abc123 ",
    });

    expect(createRuntimeHealth(descriptor, new Date("2026-07-14T12:00:00Z"))).toEqual({
      status: "ok",
      checkedAt: "2026-07-14T12:00:00.000Z",
      buildVersion: "0.0.0",
      provider: "vercel",
      runtime: "nodejs",
    });
  });

  it("rejects an empty build version", () => {
    expect(() =>
      createRuntimeDescriptor({
        provider: "local",
        runtime: "nodejs",
        buildVersion: " ",
      }),
    ).toThrow(/buildVersion/u);
  });
});
