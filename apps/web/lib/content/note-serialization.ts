import {
  emptyRichDocument,
  extractRichDocumentText,
  isCustomFieldList,
  isCustomFieldMedia,
  parseTemplate,
  type CardAuthoringData,
  type CustomFieldValue,
  type RichDocument,
} from "@lumen/domain";

interface SerializedListField {
  readonly items: readonly string[];
  readonly kind: "list";
}

interface SerializedField {
  readonly doc:
    RichDocument | SerializedListField | Extract<CustomFieldValue, { readonly kind: "media" }>;
  readonly normalizedText: string;
  readonly plainText: string;
}

export interface SerializedNote {
  readonly fields: Readonly<Record<string, SerializedField>>;
  readonly noteTypeCode: string;
  readonly transport: {
    readonly authoringData: CardAuthoringData;
    readonly sourceReference?: string;
    readonly sourceReferences: readonly unknown[];
  };
}

function textDocument(value: string): RichDocument {
  const normalized = value.normalize("NFKC").trim();
  return normalized
    ? Object.freeze({
        schemaVersion: 2,
        type: "doc",
        attrs: Object.freeze({ language: "en" }),
        content: Object.freeze([
          Object.freeze({
            type: "paragraph",
            content: Object.freeze([Object.freeze({ type: "text", text: normalized })]),
          }),
        ]),
      })
    : emptyRichDocument("en");
}

function field(value: RichDocument | boolean | number | string | undefined): SerializedField {
  const doc =
    typeof value === "object" && value !== null ? value : textDocument(String(value ?? ""));
  const plainText =
    typeof value === "object" && value !== null
      ? extractRichDocumentText(value)
      : String(value ?? "")
          .normalize("NFKC")
          .trim();
  return Object.freeze({
    doc,
    normalizedText: plainText.toLocaleLowerCase().replace(/\s+/gu, " ").trim(),
    plainText,
  });
}

function customField(value: CustomFieldValue): SerializedField {
  if (isCustomFieldList(value)) {
    const items = Object.freeze([...value]);
    const plainText = items.join(" ").normalize("NFKC").replace(/\s+/gu, " ").trim();
    return Object.freeze({
      doc: Object.freeze({ items, kind: "list" }),
      normalizedText: plainText.toLocaleLowerCase(),
      plainText,
    });
  }
  if (isCustomFieldMedia(value)) {
    const plainText = value.alt.normalize("NFKC").replace(/\s+/gu, " ").trim();
    return Object.freeze({
      doc: value,
      normalizedText: plainText.toLocaleLowerCase(),
      plainText,
    });
  }
  return field(value);
}

function customFieldType(value: CustomFieldValue): "list" | "media" | "rich_text" {
  if (isCustomFieldList(value)) return "list";
  return isCustomFieldMedia(value) ? "media" : "rich_text";
}

function firstFeedback(
  data: Extract<CardAuthoringData, { kind: "multiple_choice" | "select_all" }>,
): RichDocument {
  return data.choices.find((choice) => choice.feedback)?.feedback ?? emptyRichDocument("en");
}

export function serializeNote(
  authoringData: CardAuthoringData,
  sourceReference: string,
  noteTypeCodeOverride?: string,
): SerializedNote {
  let noteTypeCode = noteTypeCodeOverride ?? authoringData.kind;
  let fields: Readonly<Record<string, SerializedField>>;
  switch (authoringData.kind) {
    case "basic":
    case "basic_reversed":
      fields = { Front: field(authoringData.front), Back: field(authoringData.back) };
      break;
    case "optional_reversed":
      fields = {
        Front: field(authoringData.front),
        Back: field(authoringData.back),
        AddReverse: field(authoringData.reverseEnabled ? "yes" : ""),
      };
      break;
    case "bidirectional":
      fields = { SideA: field(authoringData.sideA), SideB: field(authoringData.sideB) };
      break;
    case "custom":
      noteTypeCode = noteTypeCodeOverride ?? "custom_multi_field";
      fields = Object.fromEntries(
        Object.entries(authoringData.fields).map(([key, value]) => [key, customField(value)]),
      );
      break;
    case "typed_answer":
      fields = {
        Prompt: field(authoringData.prompt),
        Answer: field(
          authoringData.acceptedAnswers[0] ?? extractRichDocumentText(authoringData.answer),
        ),
      };
      break;
    case "cloze":
      fields = { Text: field(authoringData.text), Extra: field("") };
      break;
    case "image_occlusion":
      fields = {
        Prompt: field(authoringData.imageAlt),
        ImageAlt: field(authoringData.imageAlt),
        Extra: field(""),
      };
      break;
    case "multiple_choice":
    case "select_all":
      fields = {
        Prompt: field(authoringData.prompt),
        Explanation: field(firstFeedback(authoringData)),
      };
      break;
    case "true_false":
      fields = {
        Statement: field(authoringData.statement),
        Explanation: field(authoringData.explanation),
      };
      break;
    case "ordering":
      fields = { Prompt: field(authoringData.prompt), Explanation: field("") };
      break;
    case "list_answer":
      fields = { Prompt: field(authoringData.prompt), Explanation: field("") };
      break;
    case "diagram":
      fields = {
        Prompt: field(authoringData.imageAlt),
        ImageAlt: field(authoringData.imageAlt),
        Extra: field(""),
      };
      break;
    case "audio_prompt":
      fields = {
        Prompt: field(authoringData.audioPrompt.transcript),
        Answer: field(authoringData.audioPrompt.answer),
        Transcript: field(authoringData.audioPrompt.transcript),
      };
      break;
    case "pronunciation":
      fields = {
        Text: field(authoringData.pronunciationPrompt.text),
        Translation: field(authoringData.pronunciationPrompt.fallbackAnswer),
        Transcript: field(authoringData.pronunciationPrompt.text),
      };
      break;
    case "drawing":
      fields = {
        Prompt: field(authoringData.prompt),
        Answer: field(authoringData.fallbackAnswer),
        AlternativeText: field(authoringData.fallbackAnswer),
      };
      break;
  }
  return Object.freeze({
    fields: Object.freeze(fields),
    noteTypeCode,
    transport: Object.freeze({
      authoringData,
      ...(sourceReference ? { sourceReference } : {}),
      sourceReferences: Object.freeze([]),
    }),
  });
}

export function customNoteTypeDefinition(data: Extract<CardAuthoringData, { kind: "custom" }>) {
  const availableFields = new Set(Object.keys(data.fields));
  const fieldKeys: string[] = [];
  const appendField = (key: string) => {
    if (availableFields.has(key) && !fieldKeys.includes(key)) fieldKeys.push(key);
  };
  for (const template of data.templates) {
    for (const key of parseTemplate(template.frontTemplate).referencedFields) appendField(key);
    for (const key of parseTemplate(template.backTemplate).referencedFields) appendField(key);
    if (template.generationCondition) appendField(template.generationCondition.field);
  }
  for (const key of [...availableFields].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    appendField(key);
  }

  return Object.freeze({
    description: "User-authored safe multi-field card type.",
    displayName: "Custom multi-field",
    fields: Object.freeze(
      fieldKeys.map((fieldKey, position) => {
        const fieldValue = data.fields[fieldKey];
        if (!fieldValue) throw new Error(`Custom field ${fieldKey} is missing.`);
        return Object.freeze({
          fieldKey,
          fieldType: customFieldType(fieldValue),
          label: fieldKey,
          position,
          required: false,
        });
      }),
    ),
    templates: Object.freeze(
      data.templates.map((template, ordinal) => {
        const frontFields = new Set(parseTemplate(template.frontTemplate).referencedFields);
        const backFields = parseTemplate(template.backTemplate).referencedFields.filter((key) =>
          availableFields.has(key),
        );
        const answerFieldKey =
          backFields.find((key) => !frontFields.has(key)) ??
          backFields[0] ??
          fieldKeys[1] ??
          fieldKeys[0];
        if (!answerFieldKey) throw new Error("A custom template requires at least one field.");
        return Object.freeze({
          answerFieldKey,
          backTemplate: template.backTemplate,
          frontTemplate: template.frontTemplate,
          ...(template.generationCondition
            ? { generationCondition: template.generationCondition }
            : {}),
          name: template.name,
          ordinal,
          schemaVersion: 1,
          stylingCss: template.stylingCss,
          templateKey: template.semanticKey,
        });
      }),
    ),
  });
}
