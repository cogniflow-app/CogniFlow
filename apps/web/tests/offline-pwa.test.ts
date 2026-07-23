import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../app/manifest";

const root = resolve(import.meta.dirname, "../../..");
const serviceWorker = readFileSync(resolve(root, "apps/web/public/sw.js"), "utf8");

describe("Phase 05 PWA boundary", () => {
  it("publishes a standalone branded manifest with reproducible icons and shortcuts", () => {
    const value = manifest();
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/app?source=pwa");
    expect(value.scope).toBe("/");
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", src: "/pwa/icons/icon-192.png" }),
        expect.objectContaining({
          purpose: "maskable",
          sizes: "512x512",
          src: "/pwa/icons/icon-maskable-512.png",
        }),
      ]),
    );
    expect(value.shortcuts?.map((shortcut) => shortcut.url)).toEqual([
      "/app/study",
      "/app",
      "/app/offline",
    ]);
    for (const icon of value.icons ?? []) {
      expect(existsSync(resolve(root, "apps/web/public", String(icon.src).slice(1)))).toBe(true);
    }
    expect(existsSync(resolve(root, "apps/web/public/pwa/icon-source.svg"))).toBe(true);
  });

  it("uses separate static/public caches and never caches private navigation or mutations", () => {
    expect(serviceWorker).toContain("lumen-static-");
    expect(serviceWorker).toContain("lumen-public-");
    expect(serviceWorker).not.toContain("lumen-private-${VERSION}");
    expect(serviceWorker).toContain('fetch(request, { cache: "no-store" })');
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain('policy.includes("no-store")');
    expect(serviceWorker).toContain('policy.includes("private")');
    expect(serviceWorker).toContain('response.headers.has("set-cookie")');
    expect(serviceWorker).toContain('"/api/"');
    expect(serviceWorker).toContain('"/auth/"');
    expect(serviceWorker).toContain('"/app/settings"');
  });

  it("precaches the neutral shell, discovers its build assets, and applies updates deliberately", () => {
    expect(serviceWorker).toContain('const OFFLINE_SHELL = "/offline"');
    expect(serviceWorker).toContain("markup.matchAll");
    expect(serviceWorker).toContain("Promise.allSettled");
    expect(serviceWorker).toContain('event.data.type === "SKIP_WAITING"');
    expect(serviceWorker).toContain('event.tag !== "lumen-sync-v1"');
    expect(serviceWorker).not.toContain("self.skipWaiting();\n});");
  });
});
