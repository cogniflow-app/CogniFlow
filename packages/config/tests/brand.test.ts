import { describe, expect, it } from "vitest";

import { createBrandConfig } from "../src/index";

describe("brand configuration", () => {
  it("uses the centralized safe default", () => {
    expect(createBrandConfig({}).name).toBe("Lumen");
  });

  it("normalizes a configured public name", () => {
    expect(createBrandConfig({ NEXT_PUBLIC_APP_NAME: "  Recall Garden  " })).toMatchObject({
      name: "Recall Garden",
      shortName: "Recall Garden",
    });
  });
});
