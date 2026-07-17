// @vitest-environment node

import { describe, expect, it } from "vitest";

import { collectMediaLinks, InvalidMediaReferenceError } from "../lib/content/media-links";

describe("note media link collection", () => {
  it("links rich-image annotation assets and drawing reference layers with their note", () => {
    const imageId = "0190d9f0-0000-7000-8000-000000000101";
    const annotationId = "0190d9f0-0000-7000-8000-000000000102";
    const referenceId = "0190d9f0-0000-7000-8000-000000000103";

    const links = collectMediaLinks({
      content: [
        {
          attrs: {
            alt: "Cell membrane",
            annotationAssetId: annotationId,
            assetId: imageId,
          },
          type: "image",
        },
      ],
      drawingLayers: [{ assetId: referenceId, opacity: 0.5, strokes: [] }],
    });

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId: imageId, altText: "Cell membrane" }),
        expect.objectContaining({ assetId: annotationId, altText: "Cell membrane annotation" }),
        expect.objectContaining({ assetId: referenceId }),
      ]),
    );
    expect(links).toHaveLength(3);
  });

  it.each([
    ["generic identifier", { assetId: "bogus", alt: "Broken" }, "authoringData.assetId"],
    [
      "hyphen-shaped identifier",
      { imageAssetId: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", imageAlt: "Broken" },
      "authoringData.imageAssetId",
    ],
    [
      "annotation identifier",
      { content: [{ attrs: { annotationAssetId: "not-an-asset" } }] },
      "authoringData.content[0].attrs.annotationAssetId",
    ],
  ])("rejects a non-UUID %s instead of silently dropping it", (_label, value, path) => {
    expect(() => collectMediaLinks(value)).toThrowError(InvalidMediaReferenceError);
    try {
      collectMediaLinks(value);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMediaReferenceError);
      expect((error as InvalidMediaReferenceError).paths).toContain(path);
    }
  });

  it("bounds derived reference text without truncating the authored payload", () => {
    const transcript = `  ${"🎧".repeat(1_100)}  `;
    const value = {
      audioPrompt: {
        assetId: "0190d9f0-0000-7000-8000-000000000104",
        transcript,
      },
    };

    const [link] = collectMediaLinks(value);

    expect([...String(link?.altText)].length).toBe(1_000);
    expect(value.audioPrompt.transcript).toBe(transcript);
  });
});
