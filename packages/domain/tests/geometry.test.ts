import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  diagramHotspotSchema,
  imageOcclusionRegionSchema,
  normalizedShapeSchema,
} from "../src/index";

describe("normalized image and diagram geometry", () => {
  it("round-trips rectangle, ellipse, and polygon geometry through JSON", () => {
    const shapes = [
      { kind: "rectangle", x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      { kind: "ellipse", centerX: 0.5, centerY: 0.5, radiusX: 0.2, radiusY: 0.3 },
      {
        kind: "polygon",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.8, y: 0.1 },
          { x: 0.4, y: 0.9 },
        ],
      },
    ];
    for (const shape of shapes) {
      const parsed = normalizedShapeSchema.parse(JSON.parse(JSON.stringify(shape)) as unknown);
      expect(parsed).toEqual(shape);
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it("rejects geometry outside normalized coordinates and degenerate polygons", () => {
    expect(
      normalizedShapeSchema.safeParse({
        kind: "rectangle",
        x: 0.9,
        y: 0.1,
        width: 0.2,
        height: 0.2,
      }),
    ).toMatchObject({ success: false });
    expect(
      normalizedShapeSchema.safeParse({
        kind: "ellipse",
        centerX: 0.1,
        centerY: 0.1,
        radiusX: 0.2,
        radiusY: 0.2,
      }),
    ).toMatchObject({ success: false });
    expect(
      normalizedShapeSchema.safeParse({
        kind: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.5 },
          { x: 1, y: 1 },
        ],
      }),
    ).toMatchObject({ success: false });
  });

  it("validates accessible region metadata and unique aliases", () => {
    expect(
      imageOcclusionRegionSchema.safeParse({
        semanticKey: "mask-1",
        groupKey: "group-1",
        shape: { kind: "rectangle", x: 0, y: 0, width: 0.5, height: 0.5 },
        label: "Region one",
        altText: "Top-left region",
      }),
    ).toMatchObject({ success: true });
    expect(
      diagramHotspotSchema.safeParse({
        semanticKey: "nucleus",
        shape: { kind: "rectangle", x: 0, y: 0, width: 0.5, height: 0.5 },
        label: "Nucleus",
        aliases: ["nucleus"],
        promptDirection: "both",
      }),
    ).toMatchObject({ success: false });
  });

  it("accepts any generated rectangle wholly inside the normalized plane", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0.0001, max: 0.1, noNaN: true }),
        fc.double({ min: 0.0001, max: 0.1, noNaN: true }),
        (x, y, width, height) => {
          expect(
            normalizedShapeSchema.safeParse({ kind: "rectangle", x, y, width, height }),
          ).toMatchObject({ success: true });
        },
      ),
      { numRuns: 100 },
    );
  });
});
