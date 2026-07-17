import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildNoteFieldInput,
  checkOptimisticVersion,
  classifyContentChange,
  generateCardBlueprints,
  projectPublicDeck,
  type PublicDeckProjectionSource,
} from "../src/index";
import { cardFixtures, rich } from "./content-fixtures";

describe("content change impact", () => {
  it("distinguishes cosmetic, metadata, semantic, and structural edits", () => {
    const formattedFront = {
      ...rich("Capital of France"),
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Capital of France",
              marks: [{ type: "bold" as const }],
            },
          ],
        },
      ],
    };
    expect(
      classifyContentChange(cardFixtures.basic, { ...cardFixtures.basic, front: formattedFront }),
    ).toMatchObject({ impact: "cosmetic", defaultScheduleChoice: "preserve" });
    expect(
      classifyContentChange(cardFixtures.cloze, {
        ...cardFixtures.cloze,
        clozes: cardFixtures.cloze.clozes.map((cloze, index) =>
          index === 0 ? { ...cloze, hint: "Updated hint" } : cloze,
        ),
      }),
    ).toMatchObject({ impact: "metadata", defaultScheduleChoice: "preserve" });
    expect(
      classifyContentChange(cardFixtures.basic, { ...cardFixtures.basic, back: rich("Lyon") }),
    ).toMatchObject({ impact: "answer_semantic", defaultScheduleChoice: "learner_choice" });
    expect(
      classifyContentChange(cardFixtures.optional_reversed, {
        ...cardFixtures.optional_reversed,
        reverseEnabled: false,
      }),
    ).toMatchObject({ impact: "generation_structure", material: true });
  });
});

describe("typed conflicts and canonical note fields", () => {
  it("derives searchable text from sanitized JSON", () => {
    const result = buildNoteFieldInput(
      {
        ...rich("ignored"),
        content: [
          { type: "paragraph", content: [{ type: "text", text: "  Café   au lait  " }] },
          { type: "script", text: "steal()" },
        ],
      },
      { position: 2 },
    );
    expect(result.field.plainText).toBe("Café   au lait");
    expect(result.field.normalizedText).toBe("café au lait");
    expect(result.field.position).toBe(2);
    expect(result.warnings).not.toHaveLength(0);
  });

  it("returns an actionable optimistic version conflict", () => {
    expect(
      checkOptimisticVersion({
        resourceType: "note",
        resourceId: "note-1",
        expectedVersion: 4,
        actualVersion: 5,
      }),
    ).toEqual({
      ok: false,
      conflict: expect.objectContaining({
        code: "version_conflict",
        expectedVersion: 4,
        actualVersion: 5,
        canRetry: true,
      }),
    });
  });
});

function publicSource(
  privateMarker: string,
  visibility: "private" | "public" | "unlisted" = "public",
): PublicDeckProjectionSource {
  const generated = generateCardBlueprints(cardFixtures.basic)[0]!;
  return {
    publicId: "public-deck-1",
    slug: "geography-basics",
    title: "Geography basics",
    description: rich("A public deck"),
    visibility,
    license: "cc_by",
    creator: { handle: "teacher", displayName: "Teacher" },
    publishedAt: "2026-07-16T12:00:00.000Z",
    publishedVersion: 2,
    cards: [
      {
        publicId: "public-card-1",
        ordinal: 0,
        kind: "basic",
        generationKey: generated.generationKey,
        renderer: generated.renderer,
        active: true,
        contentVersion: 2,
      },
      {
        publicId: "draft-card",
        ordinal: 1,
        kind: "basic",
        generationKey: `${generated.generationKey}-draft`,
        renderer: generated.renderer,
        active: true,
        contentVersion: 3,
      },
    ],
    media: [
      {
        publicId: "public-media",
        kind: "image",
        mimeType: "image/webp",
        altText: "Map",
        width: 100,
        height: 100,
        deliveryRef: "/media/public/public-media",
        published: true,
      },
      {
        publicId: "private-media",
        kind: "image",
        mimeType: "image/png",
        altText: privateMarker,
        deliveryRef: privateMarker,
        published: false,
      },
    ],
    ownerAccountId: privateMarker,
    memberAccountIds: [privateMarker],
    revisions: [{ privateMarker }],
    draftMetadata: { privateMarker },
  };
}

describe("public projection privacy", () => {
  it("allowlists current published content and strips private/draft data", () => {
    const result = projectPublicDeck(publicSource("PRIVATE-MARKER"));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected public projection");
    expect(result.value.cards.map((card) => card.publicId)).toEqual(["public-card-1"]);
    expect(result.value.media.map((asset) => asset.publicId)).toEqual(["public-media"]);
    expect(JSON.stringify(result.value)).not.toContain("PRIVATE-MARKER");
    expect(result.value.noIndex).toBe(false);
  });

  it("does not project unreferenced custom note fields", () => {
    const marker = "PRIVATE-CUSTOM-SOURCE";
    const custom = generateCardBlueprints({
      ...cardFixtures.custom,
      fields: { ...cardFixtures.custom.fields, PrivateSource: rich(marker) },
    })[0]!;
    const source = publicSource("owner-secret");
    const result = projectPublicDeck({
      ...source,
      cards: [
        {
          publicId: "public-custom-card",
          ordinal: 0,
          kind: "custom",
          generationKey: custom.generationKey,
          renderer: custom.renderer,
          active: true,
          contentVersion: 2,
        },
      ],
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected custom public projection");
    expect(JSON.stringify(result.value)).not.toContain(marker);
  });

  it("marks unlisted projections noindex and rejects private sources neutrally", () => {
    const unlisted = projectPublicDeck(publicSource("secret", "unlisted"));
    expect(unlisted).toMatchObject({ ok: true, value: { noIndex: true } });
    expect(projectPublicDeck(publicSource("secret", "private"))).toMatchObject({
      ok: false,
      conflict: { code: "not_found" },
    });
  });

  it("never copies arbitrary private markers as a property", () => {
    fc.assert(
      fc.property(fc.uuid(), (value) => {
        const marker = `PRIVATE-${value}`;
        const result = projectPublicDeck(publicSource(marker));
        expect(result).toMatchObject({ ok: true });
        if (!result.ok) return;
        expect(JSON.stringify(result.value)).not.toContain(JSON.stringify(marker));
      }),
      { numRuns: 100 },
    );
  });
});
