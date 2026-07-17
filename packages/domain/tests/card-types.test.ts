import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CARD_SCHEMA_VERSION,
  cardAuthoringSchema,
  cardKinds,
  cardTypeSchemas,
  generateCardBlueprints,
  parseTemplate,
  reconcileGeneratedCards,
  renderTemplate,
  systemCardTypeDefinitions,
  type BasicCardData,
  type CardAuthoringData,
  type RuntimeSchema,
} from "../src/index";
import { cardFixtures, rich } from "./content-fixtures";

describe("all card-type runtime schemas", () => {
  it("ships a schema, authoring definition, and renderer contract for all 17 types", () => {
    expect(cardKinds).toHaveLength(17);
    expect(Object.keys(cardTypeSchemas).sort()).toEqual([...cardKinds].sort());
    expect(systemCardTypeDefinitions.map((definition) => definition.kind).sort()).toEqual(
      [...cardKinds].sort(),
    );

    for (const kind of cardKinds) {
      const fixture = cardFixtures[kind];
      const schema = cardTypeSchemas[kind] as RuntimeSchema<CardAuthoringData>;
      expect(schema.safeParse(fixture), kind).toMatchObject({ success: true });
      const parsed = cardAuthoringSchema.parse(fixture);
      const generated = generateCardBlueprints(parsed);
      expect(generated.length, kind).toBeGreaterThan(0);
      expect(
        generated.every((card) => card.cardKind === kind),
        kind,
      ).toBe(true);
      expect(
        generated.every((card) => card.renderer.kind === kind),
        kind,
      ).toBe(true);
      expect(
        generated.every((card) => card.renderer.accessibility.nonvisualAlternative.length > 0),
        kind,
      ).toBe(true);
    }
  });

  it("rejects malformed type-specific answers and unsafe extension keys", () => {
    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.multiple_choice,
        choices: [
          { semanticKey: "one", content: rich("one"), isCorrect: true, position: 0 },
          { semanticKey: "two", content: rich("two"), isCorrect: true, position: 1 },
        ],
      }),
    ).toMatchObject({ success: false });

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.custom,
        templates: [{ ...cardFixtures.custom.templates[0], semanticKey: "Uppercase" }],
      }),
    ).toMatchObject({ success: false });

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.custom,
        fields: Object.fromEntries(
          Array.from({ length: 65 }, (_, index) => [`Field${String(index)}`, rich("value")]),
        ),
      }),
    ).toMatchObject({ success: false });

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.basic,
        front: rich(""),
      }),
    ).toMatchObject({ success: false });

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.basic,
        onload: "alert(1)",
      }),
    ).toMatchObject({ success: false });

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.pronunciation,
        pronunciationPrompt: {
          text: "test",
          language: "en",
          ttsAllowed: false,
        },
      }),
    ).toMatchObject({ success: false });

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.custom,
        templates: [
          {
            semanticKey: "unsafe",
            name: "Unsafe",
            frontTemplate: "{{constructor}}",
            backTemplate: "{{front}}",
            stylingCss: '@import url("https://evil.example/style.css");',
          },
        ],
      }),
    ).toMatchObject({ success: false });
  });

  it("accepts multiple and overlapping cloze groups while rejecting out-of-bounds ranges", () => {
    const overlapping = {
      ...cardFixtures.cloze,
      clozes: [
        { semanticKey: "phrase", ranges: [{ from: 0, to: 11 }] },
        { semanticKey: "word", ranges: [{ from: 6, to: 11 }] },
      ],
    };
    expect(cardAuthoringSchema.safeParse(overlapping)).toMatchObject({ success: true });
    expect(generateCardBlueprints(cardAuthoringSchema.parse(overlapping))).toHaveLength(2);

    expect(
      cardAuthoringSchema.safeParse({
        ...cardFixtures.cloze,
        clozes: [{ semanticKey: "outside", ranges: [{ from: 0, to: 9_999 }] }],
      }),
    ).toMatchObject({ success: false });
  });
});

describe("deterministic semantic card generation", () => {
  it("generates stable direction and group siblings", () => {
    expect(
      generateCardBlueprints(cardFixtures.basic_reversed).map((card) => card.semanticKey),
    ).toEqual(["forward", "reverse"]);
    expect(
      generateCardBlueprints(cardFixtures.optional_reversed).map((card) => card.semanticKey),
    ).toEqual(["forward", "reverse"]);
    expect(
      generateCardBlueprints(cardFixtures.bidirectional).map((card) => card.semanticKey),
    ).toEqual(["a_to_b", "b_to_a"]);
    expect(generateCardBlueprints(cardFixtures.image_occlusion)).toHaveLength(1);
    expect(generateCardBlueprints(cardFixtures.diagram).map((card) => card.semanticKey)).toEqual([
      "nucleus:region_to_label",
      "nucleus:label_to_region",
    ]);
    expect(
      generateCardBlueprints(cardFixtures.diagram)[0]?.renderer.accessibility.nonvisualAlternative,
    ).toContain("Large round structure near the center of the cell");
  });

  it("exposes only fields referenced by a safe custom renderer template", () => {
    const generated = generateCardBlueprints({
      ...cardFixtures.custom,
      fields: { ...cardFixtures.custom.fields, PrivateSource: rich("not on this card") },
    });
    expect(generated[0]?.renderer).toMatchObject({
      kind: "custom",
      fields: { Term: rich("osmosis"), Definition: rich("movement across a membrane") },
    });
    if (generated[0]?.renderer.kind !== "custom") throw new Error("expected custom renderer");
    expect(generated[0].renderer.fields).not.toHaveProperty("PrivateSource");
  });

  it("carries typed list and media fields through custom generation and safe helpers", () => {
    const typedCustom = cardAuthoringSchema.parse({
      ...cardFixtures.custom,
      fields: {
        ...cardFixtures.custom.fields,
        Items: ["hypotonic", "isotonic", "hypertonic"],
        Illustration: {
          alt: "Osmosis across a cell membrane",
          assetId: "0190d9f0-0000-7000-8000-000000000099",
          kind: "media",
          mediaKind: "image",
        },
      },
      templates: [
        {
          ...cardFixtures.custom.templates[0],
          frontTemplate:
            "{{Term}}{{#each Items}}<span>{{item}}</span>{{/each}}{{media Illustration}}",
        },
      ],
    });
    if (typedCustom.kind !== "custom") throw new Error("expected custom card");

    const generated = generateCardBlueprints(typedCustom);
    const renderer = generated[0]?.renderer;
    if (renderer?.kind !== "custom") throw new Error("expected custom renderer");
    const rendered = renderTemplate(parseTemplate(renderer.template.frontTemplate), {
      fields: renderer.fields,
    });

    expect(renderer.fields.Items).toEqual(["hypotonic", "isotonic", "hypertonic"]);
    expect(renderer.fields.Illustration).toEqual(
      expect.objectContaining({
        alt: "Osmosis across a cell membrane",
        kind: "media",
        mediaKind: "image",
      }),
    );
    expect(rendered.html).toContain("hypotonic");
    expect(rendered.html).toContain('data-lumen-asset="0190d9f0-0000-7000-8000-000000000099"');
    expect(renderer.accessibility.promptText).toContain("Osmosis across a cell membrane");

    expect(
      cardAuthoringSchema.safeParse({
        ...typedCustom,
        fields: {
          ...typedCustom.fields,
          Illustration: {
            alt: "Missing discriminator",
            assetId: "0190d9f0-0000-7000-8000-000000000099",
            kind: "media",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("applies bounded custom generation conditions without changing semantic identities", () => {
    const conditional = {
      ...cardFixtures.custom,
      fields: { ...cardFixtures.custom.fields, AddReverse: rich("") },
      templates: [
        ...cardFixtures.custom.templates,
        {
          semanticKey: "conditional-reverse",
          name: "Conditional reverse",
          frontTemplate: "{{Definition}}",
          backTemplate: "{{Term}}",
          generationCondition: { field: "AddReverse", when: "nonempty" as const },
        },
      ],
    };
    expect(generateCardBlueprints(conditional).map((card) => card.semanticKey)).toEqual([
      "definition",
    ]);
    expect(
      generateCardBlueprints({
        ...conditional,
        fields: { ...conditional.fields, AddReverse: rich("yes") },
      }).map((card) => card.semanticKey),
    ).toEqual(["definition", "conditional-reverse"]);
  });

  it("is deterministic for arbitrary safe basic-card text", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }).filter((value) => value.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 500 }).filter((value) => value.trim().length > 0),
        (front, back) => {
          const card: BasicCardData = {
            kind: "basic",
            schemaVersion: CARD_SCHEMA_VERSION,
            front: rich(front),
            back: rich(back),
          };
          expect(generateCardBlueprints(card)).toEqual(generateCardBlueprints(card));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("preserves IDs, reactivates semantic cards, and deactivates obsolete siblings", () => {
    const desired = generateCardBlueprints(cardFixtures.basic_reversed);
    const first = desired[0]!;
    const second = desired[1]!;
    const reconciled = reconcileGeneratedCards({
      existing: [
        {
          id: "card-forward",
          cardKind: first.cardKind,
          semanticKey: first.semanticKey,
          generationKey: first.generationKey,
          ordinal: 0,
          contentVersion: 1,
          active: true,
        },
        {
          id: "card-reverse",
          cardKind: second.cardKind,
          semanticKey: second.semanticKey,
          generationKey: second.generationKey,
          ordinal: 1,
          contentVersion: 1,
          active: false,
        },
      ],
      desired,
      contentVersion: 2,
    });

    expect(reconciled).toMatchObject({ ok: true });
    if (!reconciled.ok) throw new Error("expected reconciliation success");
    expect(reconciled.active).toEqual([
      expect.objectContaining({ id: "card-forward", disposition: "preserved" }),
      expect.objectContaining({ id: "card-reverse", disposition: "reactivated" }),
    ]);

    const optionalDesired = generateCardBlueprints(cardFixtures.optional_reversed);
    const forwardOnly = generateCardBlueprints({
      ...cardFixtures.optional_reversed,
      reverseEnabled: false,
    });
    const deactivation = reconcileGeneratedCards({
      existing: optionalDesired.map((entry) => ({
        id: entry.semanticKey === "forward" ? "card-forward" : "card-reverse",
        cardKind: entry.cardKind,
        semanticKey: entry.semanticKey,
        generationKey: entry.generationKey,
        ordinal: entry.ordinal,
        contentVersion: 2,
        active: true,
      })),
      desired: forwardOnly,
      contentVersion: 3,
    });
    expect(deactivation).toMatchObject({ ok: true });
    if (!deactivation.ok) throw new Error("expected reconciliation success");
    expect(deactivation.active[0]?.id).toBe("card-forward");
    expect(deactivation.deactivated).toEqual([
      expect.objectContaining({ id: "card-reverse", disposition: "deactivated" }),
    ]);
  });

  it("returns a typed conflict rather than repurposing a corrupt semantic identity", () => {
    const desired = generateCardBlueprints(cardFixtures.basic);
    const blueprint = desired[0]!;
    const result = reconcileGeneratedCards({
      existing: [
        {
          id: "stored-card",
          cardKind: "basic",
          semanticKey: "different",
          generationKey: blueprint.generationKey,
          ordinal: 0,
          contentVersion: 1,
          active: true,
        },
      ],
      desired,
      contentVersion: 2,
    });
    expect(result).toEqual({
      ok: false,
      conflicts: [
        expect.objectContaining({ code: "identity_mismatch", existingCardIds: ["stored-card"] }),
      ],
    });
  });
});
