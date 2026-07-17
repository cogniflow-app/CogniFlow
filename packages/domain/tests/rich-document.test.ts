import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CURRENT_RICH_DOCUMENT_VERSION,
  extractRichDocumentText,
  migrateRichDocument,
  renderRichDocumentHtml,
  richDocumentSchema,
  sanitizeRichDocument,
} from "../src/index";
import { rich } from "./content-fixtures";

describe("versioned rich documents", () => {
  it("migrates schema v1 math nodes and then sanitizes into the current version", () => {
    const migrated = migrateRichDocument({
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Area " }] },
        { type: "math", text: "A=\\pi r^2" },
      ],
    });
    const sanitized = sanitizeRichDocument(migrated);
    expect(sanitized.document.schemaVersion).toBe(CURRENT_RICH_DOCUMENT_VERSION);
    expect(sanitized.document.content[1]).toEqual({
      type: "inlineMath",
      attrs: { latex: "A=\\pi r^2" },
    });
    expect(extractRichDocumentText(sanitized.document)).toBe("Area\nA=\\pi r^2");
  });

  it("removes unknown nodes, unsafe links, unsafe videos, and inaccessible media", () => {
    const sanitized = sanitizeRichDocument({
      type: "doc",
      schemaVersion: 2,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "safe",
              marks: [
                { type: "bold" },
                { type: "link", attrs: { href: "javascript:alert(1)", title: "bad" } },
              ],
            },
          ],
        },
        { type: "script", attrs: { src: "https://evil.example" } },
        { type: "image", attrs: { assetId: "asset", alt: "" } },
        {
          type: "externalVideo",
          attrs: {
            url: "https://evil.example/embed/1",
            title: "evil",
            privacyEnhanced: false,
          },
        },
      ],
    });

    expect(sanitized.warnings.length).toBeGreaterThanOrEqual(4);
    expect(sanitized.document.content).toHaveLength(1);
    expect(JSON.stringify(sanitized.document)).not.toContain("javascript:");
    const html = renderRichDocumentHtml(sanitized.document);
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector("script,img,iframe,video")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("safe");
  });

  it("retains only privacy-enhanced allowlisted external embeds as inert renderer placeholders", () => {
    const sanitized = sanitizeRichDocument({
      type: "doc",
      schemaVersion: 2,
      content: [
        {
          type: "externalVideo",
          attrs: {
            url: "https://www.youtube-nocookie.com/embed/abc123?autoplay=1",
            title: "Lesson video",
          },
        },
      ],
    });
    expect(sanitized.document.content[0]).toEqual({
      type: "externalVideo",
      attrs: {
        provider: "youtube_nocookie",
        url: "https://www.youtube-nocookie.com/embed/abc123",
        title: "Lesson video",
        privacyEnhanced: true,
      },
    });
    const html = renderRichDocumentHtml(sanitized.document);
    expect(html).toContain("data-lumen-video-provider");
    expect(html).not.toContain("<iframe");
  });

  it("rejects unsafe input at the strict schema boundary while exposing a recovery sanitizer", () => {
    const unsafe = {
      ...rich("hello"),
      content: [{ type: "unknown", html: "<script>alert(1)</script>" }],
    };
    expect(richDocumentSchema.safeParse(unsafe)).toMatchObject({ success: false });
    expect(sanitizeRichDocument(unsafe).document.content).toEqual([]);
    expect(richDocumentSchema.safeParse({ ...rich("future"), schemaVersion: 999 })).toMatchObject({
      success: false,
    });
  });

  it("renders arbitrary text as text rather than executable markup", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (value) => {
        const document = rich(value);
        const html = renderRichDocumentHtml(document);
        const container = window.document.createElement("div");
        container.innerHTML = html;
        expect(container.textContent).toBe(value);
        expect(container.querySelector("script,iframe,img,svg,object,embed")).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
