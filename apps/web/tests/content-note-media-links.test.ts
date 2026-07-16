// @vitest-environment node

import { describe, expect, it } from "vitest";

import { collectMediaLinks } from "../app/api/content/decks/[deckId]/notes/route";

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
});
