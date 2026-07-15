import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = existsSync(resolve(process.cwd(), "src/browser.ts"))
  ? process.cwd()
  : resolve(process.cwd(), "packages/database");

describe("database client boundaries", () => {
  it("keeps the browser entry free of secret environment names", async () => {
    const source = await readFile(resolve(packageRoot, "src/browser.ts"), "utf8");

    expect(source).not.toContain("SUPABASE_SECRET_KEY");
    expect(source).not.toContain("server-env");
  });

  it.each(["server.ts", "route.ts", "test.ts"])("marks %s as a server-only entry", async (file) => {
    const source = await readFile(resolve(packageRoot, "src", file), "utf8");

    expect(source).toMatch(/import ["']server-only["']/u);
  });
});
