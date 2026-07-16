// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  isTrustedVercelAutomationOrigin,
  normalizeHostedBaseUrl,
  resolveHostedSmokeRun,
} from "../scripts/run-hosted-smoke.mjs";

describe("hosted smoke runner", () => {
  it("normalizes an explicit hosted HTTPS origin", () => {
    expect(normalizeHostedBaseUrl(" https://preview.example.test/ ")).toBe(
      "https://preview.example.test",
    );
    expect(
      resolveHostedSmokeRun(["preview"], {
        HOSTED_PREVIEW_URL: "https://preview.example.test",
      }),
    ).toEqual({ baseURL: "https://preview.example.test", target: "preview" });
  });

  it.each([
    "http://preview.example.test",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://preview.local",
    "https://preview.example.test:444",
    "https://preview.example.test/path",
    "https://preview.example.test?target=other",
    "https://user:password@preview.example.test",
  ])("rejects a non-hosted or non-origin URL: %s", (value) => {
    expect(() => normalizeHostedBaseUrl(value)).toThrow(/non-local HTTPS origin/u);
  });

  it("supports a deliberate URL override and rejects ambiguous arguments", () => {
    expect(
      resolveHostedSmokeRun(["production", "--url", "https://production.example.test"], {
        HOSTED_PRODUCTION_URL: "https://ignored.example.test",
      }),
    ).toEqual({ baseURL: "https://production.example.test", target: "production" });
    expect(() => resolveHostedSmokeRun([], {})).toThrow(/preview or production/u);
    expect(() => resolveHostedSmokeRun(["toString"], {})).toThrow(/preview or production/u);
    expect(() => resolveHostedSmokeRun(["preview"], {})).toThrow(/base URL is required/u);
    expect(() =>
      resolveHostedSmokeRun(["preview", "--url", "https://one.example.test", "--url"], {}),
    ).toThrow(/unknown or repeated option/iu);
  });

  it("sends an automation bypass only to this repository's trusted project origins", () => {
    expect(isTrustedVercelAutomationOrigin("https://recallflash.com")).toBe(true);
    expect(isTrustedVercelAutomationOrigin("https://cogniflow-pearl.vercel.app")).toBe(true);
    expect(
      isTrustedVercelAutomationOrigin(
        "https://cogniflow-abc123-cogniflow-app-3471s-projects.vercel.app",
      ),
    ).toBe(true);
    expect(isTrustedVercelAutomationOrigin("https://www.recallflash.com")).toBe(false);
    expect(isTrustedVercelAutomationOrigin("http://recallflash.com")).toBe(false);
    expect(isTrustedVercelAutomationOrigin("https://recallflash.com:444")).toBe(false);
    expect(isTrustedVercelAutomationOrigin("https://attacker.vercel.app")).toBe(false);
    expect(
      isTrustedVercelAutomationOrigin(
        "https://cogniflow-evil-extra-cogniflow-app-3471s-projects.vercel.app",
      ),
    ).toBe(false);
    expect(() =>
      resolveHostedSmokeRun(["preview", "--url", "https://attacker.example"], {
        VERCEL_AUTOMATION_BYPASS_SECRET: "operator-secret",
      }),
    ).toThrow(/trusted project origins/u);
  });
});
