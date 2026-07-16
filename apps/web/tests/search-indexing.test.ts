import { describe, expect, it } from "vitest";

import robots from "../app/robots";
import { shouldPreventSearchIndexing } from "../lib/search-indexing";

describe("search indexing policy", () => {
  it("blocks both beta production and ephemeral previews", () => {
    expect(shouldPreventSearchIndexing({ DEPLOYMENT_PROFILE: "vercel_beta" })).toBe(true);
    expect(shouldPreventSearchIndexing({ VERCEL_ENV: "preview" })).toBe(true);
  });

  it("does not silently block a future explicitly launched profile", () => {
    expect(shouldPreventSearchIndexing({ DEPLOYMENT_PROFILE: "cloudflare" })).toBe(false);
  });

  it("renders a global robots exclusion for beta", () => {
    const previous = process.env.DEPLOYMENT_PROFILE;
    process.env.DEPLOYMENT_PROFILE = "vercel_beta";
    try {
      expect(robots()).toEqual({ rules: { disallow: "/", userAgent: "*" } });
    } finally {
      if (previous === undefined) delete process.env.DEPLOYMENT_PROFILE;
      else process.env.DEPLOYMENT_PROFILE = previous;
    }
  });
});
