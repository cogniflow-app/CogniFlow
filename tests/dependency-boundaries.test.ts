// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protectedConfigurationEntries = [
  "@lumen/config/server-capabilities",
  "@lumen/config/server-environment-parser",
] as const;

describe("client/server dependency boundary configuration", () => {
  it.each(protectedConfigurationEntries)(
    "protects %s in both boundary enforcers",
    async (entry) => {
      const [eslintConfiguration, boundaryScanner] = await Promise.all([
        readFile(resolve("eslint.config.mjs"), "utf8"),
        readFile(resolve("scripts/check-boundaries.mjs"), "utf8"),
      ]);

      expect(eslintConfiguration).toContain(`\"${entry}\"`);
      expect(boundaryScanner).toContain(`\"${entry}\"`);
    },
  );
});
