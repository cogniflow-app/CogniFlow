import {
  CARD_SCHEMA_VERSION,
  cardAuthoringSchema,
  cardKinds,
  emptyRichDocument,
  generateCardBlueprints,
  type CustomCardData,
} from "@lumen/domain";
import { describe, expect, it } from "vitest";

import { cardFixtures } from "../../../packages/domain/tests/content-fixtures";
import { customNoteTypeDefinition, serializeNote } from "../lib/content/note-serialization";
import { CARD_TYPE_CODES } from "../lib/content/view-models";

const document = (text: string) => ({
  ...emptyRichDocument("en"),
  content: [{ content: [{ text, type: "text" as const }], type: "paragraph" as const }],
});

function jsonBoundary(value: unknown): unknown {
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw new TypeError("The mutation transport must be JSON serializable.");
  return JSON.parse(encoded) as unknown;
}

function persistedAuthoringData(transport: unknown): unknown {
  if (typeof transport !== "object" || transport === null || !("authoringData" in transport)) {
    throw new TypeError("The mutation transport must include authoringData.");
  }
  return transport.authoringData;
}

describe("all card-type authoring persistence", () => {
  it("round-trips every catalog kind through mutation JSON and repository regeneration", () => {
    expect(CARD_TYPE_CODES).toHaveLength(17);
    expect(CARD_TYPE_CODES).toEqual(cardKinds);
    expect(Object.keys(cardFixtures).sort()).toEqual([...cardKinds].sort());

    const reopenedKinds = CARD_TYPE_CODES.map((kind) => {
      const expected = cardAuthoringSchema.parse(cardFixtures[kind]);
      const serialized = serializeNote(expected, `fixture:${kind}`);
      const databaseTransport = jsonBoundary(serialized.transport);
      const persistedJson = persistedAuthoringData(databaseTransport);
      const reopened = cardAuthoringSchema.parse(persistedJson);

      expect(reopened, kind).toEqual(expected);
      expect(serialized.fields, kind).not.toEqual({});

      const generated = generateCardBlueprints(reopened);
      expect(generated.length, kind).toBeGreaterThan(0);
      for (const card of generated) {
        expect(card.cardKind, `${kind}:${card.semanticKey}`).toBe(kind);
        expect(card.renderer.kind, `${kind}:${card.semanticKey}`).toBe(kind);
        expect(
          card.renderer.accessibility.promptText.trim().length,
          `${kind}:${card.semanticKey} preview`,
        ).toBeGreaterThan(0);
        expect(
          card.renderer.accessibility.nonvisualAlternative.trim().length,
          `${kind}:${card.semanticKey} nonvisual preview`,
        ).toBeGreaterThan(0);
      }

      return reopened.kind;
    });

    expect(reopenedKinds).toEqual(CARD_TYPE_CODES);
  });
});

describe("custom note type serialization", () => {
  it("derives stable field order and answer identity after jsonb reorders object keys", () => {
    const templates = [
      {
        backTemplate: "{{FrontSide}}<hr>{{Back}}",
        frontTemplate: "{{Front}}",
        name: "Recall",
        semanticKey: "recall",
      },
    ] as const;
    const initial: CustomCardData = {
      fields: { Front: document("Question"), Back: document("Answer"), Hint: document("Hint") },
      kind: "custom",
      schemaVersion: CARD_SCHEMA_VERSION,
      templates,
    };
    const jsonbLikeReopen: CustomCardData = {
      ...initial,
      fields: {
        Back: initial.fields.Back!,
        Hint: initial.fields.Hint!,
        Front: initial.fields.Front!,
      },
    };

    const initialDefinition = customNoteTypeDefinition(initial);
    const reopenedDefinition = customNoteTypeDefinition(jsonbLikeReopen);

    expect(reopenedDefinition).toEqual(initialDefinition);
    expect(initialDefinition.fields.map((field) => field.fieldKey)).toEqual([
      "Front",
      "Back",
      "Hint",
    ]);
    expect(initialDefinition.fields.every((field) => field.required === false)).toBe(true);
    expect(initialDefinition.templates[0]?.answerFieldKey).toBe("Back");
  });

  it("does not invent required custom fields that the domain permits to be empty", () => {
    const data: CustomCardData = {
      fields: { Front: emptyRichDocument("en"), Back: document("Answer") },
      kind: "custom",
      schemaVersion: CARD_SCHEMA_VERSION,
      templates: [
        {
          backTemplate: "{{FrontSide}}<hr>{{Back}}",
          frontTemplate: "{{Front}}",
          name: "Recall",
          semanticKey: "recall",
        },
      ],
    };

    const definition = customNoteTypeDefinition(data);

    expect(definition.fields).toEqual([
      expect.objectContaining({ fieldKey: "Front", required: false }),
      expect.objectContaining({ fieldKey: "Back", required: false }),
    ]);
    expect(serializeNote(data, "").fields.Front?.plainText).toBe("");
  });

  it("persists custom list and media values with matching typed field definitions", () => {
    const data: CustomCardData = {
      fields: {
        Front: document("Classify the examples"),
        Items: ["alpha", "beta"],
        Illustration: {
          alt: "A labeled classification diagram",
          assetId: "0190d9f0-0000-7000-8000-000000000099",
          kind: "media",
          mediaKind: "image",
        },
      },
      kind: "custom",
      schemaVersion: CARD_SCHEMA_VERSION,
      templates: [
        {
          backTemplate: "{{FrontSide}}",
          frontTemplate:
            "{{Front}}{{#each Items}}<span>{{item}}</span>{{/each}}{{media Illustration}}",
          name: "Typed fields",
          semanticKey: "typed-fields",
        },
      ],
    };

    const definition = customNoteTypeDefinition(data);
    const serialized = serializeNote(data, "");

    expect(definition.fields).toEqual([
      expect.objectContaining({ fieldKey: "Front", fieldType: "rich_text" }),
      expect.objectContaining({ fieldKey: "Illustration", fieldType: "media" }),
      expect.objectContaining({ fieldKey: "Items", fieldType: "list" }),
    ]);
    expect(serialized.fields.Items).toMatchObject({
      doc: { items: ["alpha", "beta"], kind: "list" },
      plainText: "alpha beta",
    });
    expect(serialized.fields.Illustration).toMatchObject({
      doc: {
        kind: "media",
        mediaKind: "image",
        assetId: "0190d9f0-0000-7000-8000-000000000099",
      },
      plainText: "A labeled classification diagram",
    });
    expect(serialized.transport.authoringData).toEqual(data);
  });
});
