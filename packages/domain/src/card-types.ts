import {
  diagramHotspotSchema,
  drawingStrokeSchema,
  imageOcclusionRegionSchema,
  type DiagramHotspot,
  type DrawingStroke,
  type ImageOcclusionRegion,
} from "./geometry";
import { extractRichDocumentText, richDocumentSchema, type RichDocument } from "./rich-document";
import { parseTemplate, validateAndScopeTemplateCss } from "./template";
import {
  DomainValidationError,
  createRuntimeSchema,
  hasOnlyKeys,
  issue,
  readArray,
  readBoolean,
  readLiteral,
  readNumber,
  readOneOf,
  readRecord,
  readString,
  type RuntimeSchema,
  type SchemaParser,
  type ValidationIssue,
} from "./validation";

export const CARD_SCHEMA_VERSION = 1 as const;
export const cardKinds = [
  "basic",
  "basic_reversed",
  "optional_reversed",
  "bidirectional",
  "custom",
  "typed_answer",
  "cloze",
  "image_occlusion",
  "multiple_choice",
  "select_all",
  "true_false",
  "ordering",
  "list_answer",
  "diagram",
  "audio_prompt",
  "pronunciation",
  "drawing",
] as const;

export type CardKind = (typeof cardKinds)[number];

interface CardDataBase<TKind extends CardKind> {
  readonly kind: TKind;
  readonly schemaVersion: typeof CARD_SCHEMA_VERSION;
}

export interface BasicCardData extends CardDataBase<"basic"> {
  readonly front: RichDocument;
  readonly back: RichDocument;
}

export interface BasicReversedCardData extends CardDataBase<"basic_reversed"> {
  readonly front: RichDocument;
  readonly back: RichDocument;
}

export interface OptionalReversedCardData extends CardDataBase<"optional_reversed"> {
  readonly front: RichDocument;
  readonly back: RichDocument;
  readonly reverseEnabled: boolean;
}

export interface BidirectionalCardData extends CardDataBase<"bidirectional"> {
  readonly sideA: RichDocument;
  readonly sideB: RichDocument;
}

export interface CustomTemplateDefinition {
  readonly semanticKey: string;
  readonly name: string;
  readonly frontTemplate: string;
  readonly backTemplate: string;
  readonly stylingCss?: string;
  readonly generationCondition?: {
    readonly field: string;
    readonly when: "nonempty" | "empty";
  };
}

export interface CustomCardData extends CardDataBase<"custom"> {
  readonly fields: Readonly<Record<string, RichDocument>>;
  readonly templates: readonly CustomTemplateDefinition[];
}

export interface TypedAnswerCardData extends CardDataBase<"typed_answer"> {
  readonly prompt: RichDocument;
  readonly answer: RichDocument;
  readonly acceptedAnswers: readonly string[];
  readonly caseSensitive: boolean;
  readonly language?: string;
}

export interface ClozeRange {
  readonly from: number;
  readonly to: number;
}

export interface ClozeDefinition {
  readonly semanticKey: string;
  readonly ranges: readonly ClozeRange[];
  readonly hint?: string;
}

export interface ClozeCardData extends CardDataBase<"cloze"> {
  readonly text: RichDocument;
  readonly clozes: readonly ClozeDefinition[];
}

export interface ImageOcclusionCardData extends CardDataBase<"image_occlusion"> {
  readonly imageAssetId: string;
  readonly imageAlt: string;
  readonly mode: "hide_one_reveal_others" | "hide_all_reveal_one";
  readonly occlusions: readonly ImageOcclusionRegion[];
}

export interface ChoiceDefinition {
  readonly semanticKey: string;
  readonly content: RichDocument;
  readonly isCorrect: boolean;
  readonly position: number;
  readonly feedback?: RichDocument;
}

export interface MultipleChoiceCardData extends CardDataBase<"multiple_choice"> {
  readonly prompt: RichDocument;
  readonly choices: readonly ChoiceDefinition[];
}

export interface SelectAllCardData extends CardDataBase<"select_all"> {
  readonly prompt: RichDocument;
  readonly choices: readonly ChoiceDefinition[];
}

export interface TrueFalseCardData extends CardDataBase<"true_false"> {
  readonly statement: RichDocument;
  readonly answer: boolean;
  readonly explanation?: RichDocument;
}

export interface OrderingItem {
  readonly semanticKey: string;
  readonly content: RichDocument;
  readonly position: number;
}

export interface OrderingCardData extends CardDataBase<"ordering"> {
  readonly prompt: RichDocument;
  readonly orderingItems: readonly OrderingItem[];
}

export interface ListAnswerItem {
  readonly semanticKey: string;
  readonly answer: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
  readonly position: number;
}

export interface ListAnswerCardData extends CardDataBase<"list_answer"> {
  readonly prompt: RichDocument;
  readonly listItems: readonly ListAnswerItem[];
  readonly orderMatters: boolean;
}

export interface DiagramCardData extends CardDataBase<"diagram"> {
  readonly imageAssetId: string;
  readonly imageAlt: string;
  readonly hotspots: readonly DiagramHotspot[];
}

export interface AudioPromptData {
  readonly assetId: string;
  readonly transcript: string;
  readonly answer: RichDocument;
}

export interface AudioPromptCardData extends CardDataBase<"audio_prompt"> {
  readonly audioPrompt: AudioPromptData;
  readonly playbackSpeed: number;
}

export interface PronunciationPromptData {
  readonly text: string;
  readonly language: string;
  readonly referenceAssetId?: string;
  readonly ttsAllowed: boolean;
  readonly fallbackAnswer?: string;
}

export interface PronunciationCardData extends CardDataBase<"pronunciation"> {
  readonly pronunciationPrompt: PronunciationPromptData;
  readonly selfReview: true;
}

export interface DrawingReferenceLayer {
  readonly semanticKey: string;
  readonly assetId?: string;
  readonly strokes: readonly DrawingStroke[];
  readonly opacity: number;
  readonly position: number;
}

export interface DrawingCardData extends CardDataBase<"drawing"> {
  readonly prompt: RichDocument;
  readonly drawingLayers: readonly DrawingReferenceLayer[];
  readonly fallbackAnswer: string;
  readonly evaluation: "self_review";
}

export type CardAuthoringData =
  | BasicCardData
  | BasicReversedCardData
  | OptionalReversedCardData
  | BidirectionalCardData
  | CustomCardData
  | TypedAnswerCardData
  | ClozeCardData
  | ImageOcclusionCardData
  | MultipleChoiceCardData
  | SelectAllCardData
  | TrueFalseCardData
  | OrderingCardData
  | ListAnswerCardData
  | DiagramCardData
  | AudioPromptCardData
  | PronunciationCardData
  | DrawingCardData;

export interface CardTypeDefinition<TKind extends CardKind = CardKind> {
  readonly kind: TKind;
  readonly label: string;
  readonly description: string;
  readonly bulkImportKey: string;
  readonly accessibleInteraction: string;
}

const SEMANTIC_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const MAX_TEMPLATE_LENGTH = 50_000;

function parseDocument(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): RichDocument | undefined {
  const parsed = richDocumentSchema.safeParse(input);
  if (!parsed.success) {
    for (const child of parsed.issues) {
      issues.push({
        ...child,
        path: child.path === "$" ? path : `${path}${child.path.slice(1)}`,
      });
    }
    return undefined;
  }
  return parsed.data;
}

function requireDocumentContent(
  document: RichDocument,
  path: string,
  issues: ValidationIssue[],
): boolean {
  if (extractRichDocumentText(document).trim()) return true;
  issue(issues, path, "empty_content", "Required card content cannot be empty");
  return false;
}

function parseBase<TKind extends CardKind>(
  record: Readonly<Record<string, unknown>>,
  kind: TKind,
  path: string,
  issues: ValidationIssue[],
): boolean {
  const parsedKind = readLiteral(record.kind, kind, `${path}.kind`, issues);
  const version = readLiteral(
    record.schemaVersion,
    CARD_SCHEMA_VERSION,
    `${path}.schemaVersion`,
    issues,
  );
  return parsedKind !== undefined && version !== undefined;
}

function readAssetId(input: unknown, path: string, issues: ValidationIssue[]): string | undefined {
  return readString(input, path, issues, { min: 1, max: 128, pattern: ASSET_ID_PATTERN });
}

function readSemanticKey(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  return readString(input, path, issues, { min: 1, max: 128, pattern: SEMANTIC_KEY_PATTERN });
}

function validateUniqueKeys(
  values: readonly { readonly semanticKey: string }[],
  path: string,
  issues: ValidationIssue[],
): boolean {
  const seen = new Set<string>();
  let valid = true;
  for (const [index, value] of values.entries()) {
    if (seen.has(value.semanticKey)) {
      issue(
        issues,
        `${path}[${index}].semanticKey`,
        "duplicate_semantic_key",
        "Semantic keys must be unique",
      );
      valid = false;
    }
    seen.add(value.semanticKey);
  }
  return valid;
}

function validatePositions(
  values: readonly { readonly position: number }[],
  path: string,
  issues: ValidationIssue[],
): boolean {
  const positions = [...values.map((value) => value.position)].sort((a, b) => a - b);
  const valid = positions.every((position, index) => position === index);
  if (!valid) {
    issue(issues, path, "invalid_positions", "Positions must be unique and contiguous from zero");
  }
  return valid;
}

function pairSchema<TKind extends "basic" | "basic_reversed">(
  kind: TKind,
): RuntimeSchema<TKind extends "basic" ? BasicCardData : BasicReversedCardData> {
  type Pair = TKind extends "basic" ? BasicCardData : BasicReversedCardData;
  return createRuntimeSchema<Pair>(`${kind} card`, (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "front", "back"], path, issues);
    const base = parseBase(record, kind, path, issues);
    const front = parseDocument(record.front, `${path}.front`, issues);
    const back = parseDocument(record.back, `${path}.back`, issues);
    if (!base || !front || !back) return undefined;
    if (
      !requireDocumentContent(front, `${path}.front`, issues) ||
      !requireDocumentContent(back, `${path}.back`, issues)
    ) {
      return undefined;
    }
    return Object.freeze({
      kind,
      schemaVersion: CARD_SCHEMA_VERSION,
      front,
      back,
    }) as unknown as Pair;
  });
}

export const basicCardSchema = pairSchema("basic");
export const basicReversedCardSchema = pairSchema("basic_reversed");

export const optionalReversedCardSchema = createRuntimeSchema<OptionalReversedCardData>(
  "optional reversed card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "front", "back", "reverseEnabled"], path, issues);
    const base = parseBase(record, "optional_reversed", path, issues);
    const front = parseDocument(record.front, `${path}.front`, issues);
    const back = parseDocument(record.back, `${path}.back`, issues);
    const reverseEnabled = readBoolean(record.reverseEnabled, `${path}.reverseEnabled`, issues);
    if (!base || !front || !back || reverseEnabled === undefined) return undefined;
    if (
      !requireDocumentContent(front, `${path}.front`, issues) ||
      !requireDocumentContent(back, `${path}.back`, issues)
    ) {
      return undefined;
    }
    return Object.freeze({
      kind: "optional_reversed",
      schemaVersion: CARD_SCHEMA_VERSION,
      front,
      back,
      reverseEnabled,
    });
  },
);

export const bidirectionalCardSchema = createRuntimeSchema<BidirectionalCardData>(
  "bidirectional card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "sideA", "sideB"], path, issues);
    const base = parseBase(record, "bidirectional", path, issues);
    const sideA = parseDocument(record.sideA, `${path}.sideA`, issues);
    const sideB = parseDocument(record.sideB, `${path}.sideB`, issues);
    if (!base || !sideA || !sideB) return undefined;
    if (
      !requireDocumentContent(sideA, `${path}.sideA`, issues) ||
      !requireDocumentContent(sideB, `${path}.sideB`, issues)
    ) {
      return undefined;
    }
    return Object.freeze({
      kind: "bidirectional",
      schemaVersion: CARD_SCHEMA_VERSION,
      sideA,
      sideB,
    });
  },
);

const parseCustomTemplate: SchemaParser<CustomTemplateDefinition> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(
    record,
    ["semanticKey", "name", "frontTemplate", "backTemplate", "stylingCss", "generationCondition"],
    path,
    issues,
  );
  const semanticKey = readSemanticKey(record.semanticKey, `${path}.semanticKey`, issues);
  const name = readString(record.name, `${path}.name`, issues, { min: 1, max: 120 });
  const frontTemplate = readString(record.frontTemplate, `${path}.frontTemplate`, issues, {
    min: 1,
    max: MAX_TEMPLATE_LENGTH,
    trim: false,
  });
  const backTemplate = readString(record.backTemplate, `${path}.backTemplate`, issues, {
    min: 1,
    max: MAX_TEMPLATE_LENGTH,
    trim: false,
  });
  const stylingCss =
    record.stylingCss === undefined
      ? undefined
      : readString(record.stylingCss, `${path}.stylingCss`, issues, {
          max: 20_000,
          trim: false,
        });
  const rawCondition =
    record.generationCondition === undefined
      ? undefined
      : readRecord(record.generationCondition, `${path}.generationCondition`, issues);
  let generationCondition: CustomTemplateDefinition["generationCondition"];
  if (rawCondition) {
    hasOnlyKeys(rawCondition, ["field", "when"], `${path}.generationCondition`, issues);
    const field = readString(rawCondition.field, `${path}.generationCondition.field`, issues, {
      min: 1,
      max: 64,
      pattern: FIELD_KEY_PATTERN,
    });
    const when = readOneOf(
      rawCondition.when,
      ["nonempty", "empty"] as const,
      `${path}.generationCondition.when`,
      issues,
    );
    if (field && when) generationCondition = Object.freeze({ field, when });
  }
  if (!semanticKey || !name || frontTemplate === undefined || backTemplate === undefined)
    return undefined;
  return Object.freeze({
    semanticKey,
    name,
    frontTemplate,
    backTemplate,
    ...(stylingCss ? { stylingCss } : {}),
    ...(generationCondition ? { generationCondition } : {}),
  });
};

export const customCardSchema = createRuntimeSchema<CustomCardData>(
  "custom card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "fields", "templates"], path, issues);
    const base = parseBase(record, "custom", path, issues);
    const fieldRecord = readRecord(record.fields, `${path}.fields`, issues);
    const fields: Record<string, RichDocument> = {};
    if (fieldRecord) {
      const entries = Object.entries(fieldRecord);
      if (entries.length === 0 || entries.length > 100) {
        issue(issues, `${path}.fields`, "invalid_length", "Custom cards require 1 to 100 fields");
      }
      for (const [key, value] of entries) {
        if (
          !FIELD_KEY_PATTERN.test(key) ||
          ["__proto__", "prototype", "constructor"].includes(key)
        ) {
          issue(issues, `${path}.fields.${key}`, "unsafe_field_key", "Invalid custom field key");
          continue;
        }
        const document = parseDocument(value, `${path}.fields.${key}`, issues);
        if (document) fields[key] = document;
      }
    }
    const templates = readArray(
      record.templates,
      `${path}.templates`,
      issues,
      parseCustomTemplate,
      {
        min: 1,
        max: 20,
      },
    );
    if (
      !base ||
      !fieldRecord ||
      !templates ||
      !validateUniqueKeys(templates, `${path}.templates`, issues)
    ) {
      return undefined;
    }
    if (!Object.values(fields).some((document) => extractRichDocumentText(document).trim())) {
      issue(
        issues,
        `${path}.fields`,
        "empty_content",
        "At least one custom field must contain content",
      );
    }
    for (const [index, template] of templates.entries()) {
      try {
        const front = parseTemplate(template.frontTemplate);
        const back = parseTemplate(template.backTemplate);
        const missing = [...new Set([...front.referencedFields, ...back.referencedFields])].filter(
          (field) => !(field in fields),
        );
        if (
          template.generationCondition &&
          !(template.generationCondition.field in fields) &&
          !missing.includes(template.generationCondition.field)
        ) {
          missing.push(template.generationCondition.field);
        }
        for (const field of missing) {
          issue(
            issues,
            `${path}.templates[${index}]`,
            "unknown_template_field",
            `Template references unknown field ${JSON.stringify(field)}`,
          );
        }
        if (template.stylingCss) {
          validateAndScopeTemplateCss(template.stylingCss, `template-${index}`);
        }
      } catch (error) {
        if (error instanceof DomainValidationError) {
          for (const child of error.issues) {
            issues.push({
              ...child,
              path: `${path}.templates[${index}]${child.path === "$" ? "" : child.path.slice(1)}`,
            });
          }
        } else {
          throw error;
        }
      }
    }
    if (issues.length > 0) return undefined;
    return Object.freeze({
      kind: "custom",
      schemaVersion: CARD_SCHEMA_VERSION,
      fields: Object.freeze(fields),
      templates: Object.freeze(templates),
    });
  },
);

export const typedAnswerCardSchema = createRuntimeSchema<TypedAnswerCardData>(
  "typed-answer card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "prompt", "answer", "acceptedAnswers", "caseSensitive", "language"],
      path,
      issues,
    );
    const base = parseBase(record, "typed_answer", path, issues);
    const prompt = parseDocument(record.prompt, `${path}.prompt`, issues);
    const answer = parseDocument(record.answer, `${path}.answer`, issues);
    const acceptedAnswers = readArray(
      record.acceptedAnswers,
      `${path}.acceptedAnswers`,
      issues,
      (value, valuePath, valueIssues) =>
        readString(value, valuePath, valueIssues, { min: 1, max: 1_000 }),
      { min: 1, max: 100 },
    );
    const caseSensitive = readBoolean(record.caseSensitive, `${path}.caseSensitive`, issues);
    const language =
      record.language === undefined
        ? undefined
        : readString(record.language, `${path}.language`, issues, {
            min: 2,
            max: 72,
            pattern: LANGUAGE_PATTERN,
          });
    if (!base || !prompt || !answer || !acceptedAnswers || caseSensitive === undefined)
      return undefined;
    if (
      !requireDocumentContent(prompt, `${path}.prompt`, issues) ||
      !requireDocumentContent(answer, `${path}.answer`, issues)
    ) {
      return undefined;
    }
    const normalized = acceptedAnswers.map((value) =>
      caseSensitive ? value.normalize("NFKC") : value.normalize("NFKC").toLocaleLowerCase(),
    );
    if (new Set(normalized).size !== normalized.length) {
      issue(
        issues,
        `${path}.acceptedAnswers`,
        "duplicate_answer",
        "Accepted answers must be unique",
      );
      return undefined;
    }
    return Object.freeze({
      kind: "typed_answer",
      schemaVersion: CARD_SCHEMA_VERSION,
      prompt,
      answer,
      acceptedAnswers: Object.freeze(acceptedAnswers),
      caseSensitive,
      ...(language ? { language } : {}),
    });
  },
);

const parseClozeRange: SchemaParser<ClozeRange> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["from", "to"], path, issues);
  const from = readNumber(record.from, `${path}.from`, issues, {
    min: 0,
    max: 100_000,
    integer: true,
  });
  const to = readNumber(record.to, `${path}.to`, issues, { min: 1, max: 100_000, integer: true });
  if (from === undefined || to === undefined) return undefined;
  if (to <= from)
    return issue(issues, path, "invalid_range", "Cloze range end must follow its start");
  return Object.freeze({ from, to });
};

const parseCloze: SchemaParser<ClozeDefinition> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["semanticKey", "ranges", "hint"], path, issues);
  const semanticKey = readSemanticKey(record.semanticKey, `${path}.semanticKey`, issues);
  const ranges = readArray(record.ranges, `${path}.ranges`, issues, parseClozeRange, {
    min: 1,
    max: 50,
  });
  const hint =
    record.hint === undefined
      ? undefined
      : readString(record.hint, `${path}.hint`, issues, { min: 1, max: 500 });
  if (!semanticKey || !ranges) return undefined;
  const distinct = new Set(ranges.map((range) => `${range.from}:${range.to}`));
  if (distinct.size !== ranges.length) {
    issue(
      issues,
      `${path}.ranges`,
      "duplicate_range",
      "Cloze ranges within a group must be unique",
    );
    return undefined;
  }
  return Object.freeze({ semanticKey, ranges: Object.freeze(ranges), ...(hint ? { hint } : {}) });
};

export const clozeCardSchema = createRuntimeSchema<ClozeCardData>(
  "cloze card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "text", "clozes"], path, issues);
    const base = parseBase(record, "cloze", path, issues);
    const text = parseDocument(record.text, `${path}.text`, issues);
    const clozes = readArray(record.clozes, `${path}.clozes`, issues, parseCloze, {
      min: 1,
      max: 100,
    });
    if (!base || !text || !clozes || !validateUniqueKeys(clozes, `${path}.clozes`, issues))
      return undefined;
    const length = extractRichDocumentText(text).length;
    for (const [groupIndex, cloze] of clozes.entries()) {
      for (const [rangeIndex, range] of cloze.ranges.entries()) {
        if (range.to > length) {
          issue(
            issues,
            `${path}.clozes[${groupIndex}].ranges[${rangeIndex}]`,
            "range_out_of_bounds",
            "Cloze range exceeds the document's plain text",
          );
        }
      }
    }
    if (issues.length > 0) return undefined;
    return Object.freeze({
      kind: "cloze",
      schemaVersion: CARD_SCHEMA_VERSION,
      text,
      clozes: Object.freeze(clozes),
    });
  },
);

export const imageOcclusionCardSchema = createRuntimeSchema<ImageOcclusionCardData>(
  "image-occlusion card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "imageAssetId", "imageAlt", "mode", "occlusions"],
      path,
      issues,
    );
    const base = parseBase(record, "image_occlusion", path, issues);
    const imageAssetId = readAssetId(record.imageAssetId, `${path}.imageAssetId`, issues);
    const imageAlt = readString(record.imageAlt, `${path}.imageAlt`, issues, {
      min: 1,
      max: 1_000,
    });
    const mode = readOneOf(
      record.mode,
      ["hide_one_reveal_others", "hide_all_reveal_one"] as const,
      `${path}.mode`,
      issues,
    );
    const occlusions = readArray(
      record.occlusions,
      `${path}.occlusions`,
      issues,
      (value, valuePath, valueIssues) => {
        const parsed = imageOcclusionRegionSchema.safeParse(value);
        if (parsed.success) return parsed.data;
        parsed.issues.forEach((child) =>
          valueIssues.push({
            ...child,
            path: child.path === "$" ? valuePath : `${valuePath}${child.path.slice(1)}`,
          }),
        );
        return undefined;
      },
      { min: 1, max: 500 },
    );
    if (!base || !imageAssetId || !imageAlt || !mode || !occlusions) return undefined;
    if (!validateUniqueKeys(occlusions, `${path}.occlusions`, issues)) return undefined;
    return Object.freeze({
      kind: "image_occlusion",
      schemaVersion: CARD_SCHEMA_VERSION,
      imageAssetId,
      imageAlt,
      mode,
      occlusions: Object.freeze(occlusions),
    });
  },
);

const parseChoice: SchemaParser<ChoiceDefinition> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(
    record,
    ["semanticKey", "content", "isCorrect", "position", "feedback"],
    path,
    issues,
  );
  const semanticKey = readSemanticKey(record.semanticKey, `${path}.semanticKey`, issues);
  const content = parseDocument(record.content, `${path}.content`, issues);
  const isCorrect = readBoolean(record.isCorrect, `${path}.isCorrect`, issues);
  const position = readNumber(record.position, `${path}.position`, issues, {
    min: 0,
    max: 99,
    integer: true,
  });
  const feedback =
    record.feedback === undefined
      ? undefined
      : parseDocument(record.feedback, `${path}.feedback`, issues);
  if (!semanticKey || !content || isCorrect === undefined || position === undefined)
    return undefined;
  if (!requireDocumentContent(content, `${path}.content`, issues)) return undefined;
  return Object.freeze({
    semanticKey,
    content,
    isCorrect,
    position,
    ...(feedback ? { feedback } : {}),
  });
};

function choiceCardSchema<TKind extends "multiple_choice" | "select_all">(
  kind: TKind,
): RuntimeSchema<TKind extends "multiple_choice" ? MultipleChoiceCardData : SelectAllCardData> {
  type ChoiceCard = TKind extends "multiple_choice" ? MultipleChoiceCardData : SelectAllCardData;
  return createRuntimeSchema<ChoiceCard>(`${kind} card`, (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "prompt", "choices"], path, issues);
    const base = parseBase(record, kind, path, issues);
    const prompt = parseDocument(record.prompt, `${path}.prompt`, issues);
    const choices = readArray(record.choices, `${path}.choices`, issues, parseChoice, {
      min: 2,
      max: 20,
    });
    if (!base || !prompt || !choices) return undefined;
    if (!requireDocumentContent(prompt, `${path}.prompt`, issues)) return undefined;
    const correctCount = choices.filter((choice) => choice.isCorrect).length;
    if (kind === "multiple_choice" && correctCount !== 1) {
      issue(
        issues,
        `${path}.choices`,
        "invalid_correct_count",
        "Multiple choice requires exactly one correct answer",
      );
    }
    if (kind === "select_all" && (correctCount < 1 || correctCount === choices.length)) {
      issue(
        issues,
        `${path}.choices`,
        "invalid_correct_count",
        "Select-all requires both correct and incorrect choices",
      );
    }
    const normalizedChoices = choices.map((choice) =>
      extractRichDocumentText(choice.content).normalize("NFKC").toLocaleLowerCase(),
    );
    if (new Set(normalizedChoices).size !== normalizedChoices.length) {
      issue(issues, `${path}.choices`, "duplicate_choice", "Choice text must be unique");
    }
    validateUniqueKeys(choices, `${path}.choices`, issues);
    validatePositions(choices, `${path}.choices`, issues);
    if (issues.length > 0) return undefined;
    return Object.freeze({
      kind,
      schemaVersion: CARD_SCHEMA_VERSION,
      prompt,
      choices: Object.freeze([...choices].sort((left, right) => left.position - right.position)),
    }) as unknown as ChoiceCard;
  });
}

export const multipleChoiceCardSchema = choiceCardSchema("multiple_choice");
export const selectAllCardSchema = choiceCardSchema("select_all");

export const trueFalseCardSchema = createRuntimeSchema<TrueFalseCardData>(
  "true/false card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "statement", "answer", "explanation"],
      path,
      issues,
    );
    const base = parseBase(record, "true_false", path, issues);
    const statement = parseDocument(record.statement, `${path}.statement`, issues);
    const answer = readBoolean(record.answer, `${path}.answer`, issues);
    const explanation =
      record.explanation === undefined
        ? undefined
        : parseDocument(record.explanation, `${path}.explanation`, issues);
    if (!base || !statement || answer === undefined) return undefined;
    if (!requireDocumentContent(statement, `${path}.statement`, issues)) return undefined;
    return Object.freeze({
      kind: "true_false",
      schemaVersion: CARD_SCHEMA_VERSION,
      statement,
      answer,
      ...(explanation ? { explanation } : {}),
    });
  },
);

const parseOrderingItem: SchemaParser<OrderingItem> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["semanticKey", "content", "position"], path, issues);
  const semanticKey = readSemanticKey(record.semanticKey, `${path}.semanticKey`, issues);
  const content = parseDocument(record.content, `${path}.content`, issues);
  const position = readNumber(record.position, `${path}.position`, issues, {
    min: 0,
    max: 499,
    integer: true,
  });
  if (!semanticKey || !content || position === undefined) return undefined;
  if (!requireDocumentContent(content, `${path}.content`, issues)) return undefined;
  return Object.freeze({ semanticKey, content, position });
};

export const orderingCardSchema = createRuntimeSchema<OrderingCardData>(
  "ordering card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "prompt", "orderingItems"], path, issues);
    const base = parseBase(record, "ordering", path, issues);
    const prompt = parseDocument(record.prompt, `${path}.prompt`, issues);
    const orderingItems = readArray(
      record.orderingItems,
      `${path}.orderingItems`,
      issues,
      parseOrderingItem,
      { min: 2, max: 500 },
    );
    if (!base || !prompt || !orderingItems) return undefined;
    if (!requireDocumentContent(prompt, `${path}.prompt`, issues)) return undefined;
    validateUniqueKeys(orderingItems, `${path}.orderingItems`, issues);
    validatePositions(orderingItems, `${path}.orderingItems`, issues);
    if (issues.length > 0) return undefined;
    return Object.freeze({
      kind: "ordering",
      schemaVersion: CARD_SCHEMA_VERSION,
      prompt,
      orderingItems: Object.freeze(
        [...orderingItems].sort((left, right) => left.position - right.position),
      ),
    });
  },
);

const parseListItem: SchemaParser<ListAnswerItem> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["semanticKey", "answer", "aliases", "required", "position"], path, issues);
  const semanticKey = readSemanticKey(record.semanticKey, `${path}.semanticKey`, issues);
  const answer = readString(record.answer, `${path}.answer`, issues, { min: 1, max: 2_000 });
  const aliases = readArray(
    record.aliases ?? [],
    `${path}.aliases`,
    issues,
    (value, valuePath, valueIssues) =>
      readString(value, valuePath, valueIssues, { min: 1, max: 2_000 }),
    { max: 100 },
  );
  const required = readBoolean(record.required, `${path}.required`, issues);
  const position = readNumber(record.position, `${path}.position`, issues, {
    min: 0,
    max: 499,
    integer: true,
  });
  if (!semanticKey || !answer || !aliases || required === undefined || position === undefined)
    return undefined;
  const normalizedAnswer = answer.normalize("NFKC").toLocaleLowerCase();
  const normalizedAliases = aliases.map((alias) => alias.normalize("NFKC").toLocaleLowerCase());
  if (
    normalizedAliases.includes(normalizedAnswer) ||
    new Set(normalizedAliases).size !== normalizedAliases.length
  ) {
    issue(
      issues,
      `${path}.aliases`,
      "duplicate_alias",
      "Aliases must be unique and differ from the answer",
    );
    return undefined;
  }
  return Object.freeze({
    semanticKey,
    answer,
    aliases: Object.freeze(aliases),
    required,
    position,
  });
};

export const listAnswerCardSchema = createRuntimeSchema<ListAnswerCardData>(
  "list-answer card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "prompt", "listItems", "orderMatters"],
      path,
      issues,
    );
    const base = parseBase(record, "list_answer", path, issues);
    const prompt = parseDocument(record.prompt, `${path}.prompt`, issues);
    const listItems = readArray(record.listItems, `${path}.listItems`, issues, parseListItem, {
      min: 1,
      max: 500,
    });
    const orderMatters = readBoolean(record.orderMatters, `${path}.orderMatters`, issues);
    if (!base || !prompt || !listItems || orderMatters === undefined) return undefined;
    if (!requireDocumentContent(prompt, `${path}.prompt`, issues)) return undefined;
    validateUniqueKeys(listItems, `${path}.listItems`, issues);
    validatePositions(listItems, `${path}.listItems`, issues);
    if (!listItems.some((item) => item.required)) {
      issue(
        issues,
        `${path}.listItems`,
        "missing_required_answer",
        "At least one list item must be required",
      );
    }
    if (issues.length > 0) return undefined;
    return Object.freeze({
      kind: "list_answer",
      schemaVersion: CARD_SCHEMA_VERSION,
      prompt,
      listItems: Object.freeze(
        [...listItems].sort((left, right) => left.position - right.position),
      ),
      orderMatters,
    });
  },
);

export const diagramCardSchema = createRuntimeSchema<DiagramCardData>(
  "diagram card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "imageAssetId", "imageAlt", "hotspots"],
      path,
      issues,
    );
    const base = parseBase(record, "diagram", path, issues);
    const imageAssetId = readAssetId(record.imageAssetId, `${path}.imageAssetId`, issues);
    const imageAlt = readString(record.imageAlt, `${path}.imageAlt`, issues, {
      min: 1,
      max: 1_000,
    });
    const hotspots = readArray(
      record.hotspots,
      `${path}.hotspots`,
      issues,
      (value, valuePath, valueIssues) => {
        const parsed = diagramHotspotSchema.safeParse(value);
        if (parsed.success) return parsed.data;
        parsed.issues.forEach((child) =>
          valueIssues.push({
            ...child,
            path: child.path === "$" ? valuePath : `${valuePath}${child.path.slice(1)}`,
          }),
        );
        return undefined;
      },
      { min: 1, max: 500 },
    );
    if (!base || !imageAssetId || !imageAlt || !hotspots) return undefined;
    if (!validateUniqueKeys(hotspots, `${path}.hotspots`, issues)) return undefined;
    return Object.freeze({
      kind: "diagram",
      schemaVersion: CARD_SCHEMA_VERSION,
      imageAssetId,
      imageAlt,
      hotspots: Object.freeze(hotspots),
    });
  },
);

export const audioPromptCardSchema = createRuntimeSchema<AudioPromptCardData>(
  "audio-prompt card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["kind", "schemaVersion", "audioPrompt", "playbackSpeed"], path, issues);
    const base = parseBase(record, "audio_prompt", path, issues);
    const audio = readRecord(record.audioPrompt, `${path}.audioPrompt`, issues);
    let audioPrompt: AudioPromptData | undefined;
    if (audio) {
      hasOnlyKeys(audio, ["assetId", "transcript", "answer"], `${path}.audioPrompt`, issues);
      const assetId = readAssetId(audio.assetId, `${path}.audioPrompt.assetId`, issues);
      const transcript = readString(audio.transcript, `${path}.audioPrompt.transcript`, issues, {
        min: 1,
        max: 20_000,
      });
      const answer = parseDocument(audio.answer, `${path}.audioPrompt.answer`, issues);
      if (assetId && transcript && answer)
        audioPrompt = Object.freeze({ assetId, transcript, answer });
    }
    const playbackSpeed = readNumber(record.playbackSpeed, `${path}.playbackSpeed`, issues, {
      min: 0.5,
      max: 2,
    });
    if (!base || !audioPrompt || playbackSpeed === undefined) return undefined;
    if (!requireDocumentContent(audioPrompt.answer, `${path}.audioPrompt.answer`, issues)) {
      return undefined;
    }
    return Object.freeze({
      kind: "audio_prompt",
      schemaVersion: CARD_SCHEMA_VERSION,
      audioPrompt,
      playbackSpeed,
    });
  },
);

export const pronunciationCardSchema = createRuntimeSchema<PronunciationCardData>(
  "pronunciation card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "pronunciationPrompt", "selfReview"],
      path,
      issues,
    );
    const base = parseBase(record, "pronunciation", path, issues);
    const prompt = readRecord(record.pronunciationPrompt, `${path}.pronunciationPrompt`, issues);
    let pronunciationPrompt: PronunciationPromptData | undefined;
    if (prompt) {
      hasOnlyKeys(
        prompt,
        ["text", "language", "referenceAssetId", "ttsAllowed", "fallbackAnswer"],
        `${path}.pronunciationPrompt`,
        issues,
      );
      const text = readString(prompt.text, `${path}.pronunciationPrompt.text`, issues, {
        min: 1,
        max: 10_000,
      });
      const language = readString(prompt.language, `${path}.pronunciationPrompt.language`, issues, {
        min: 2,
        max: 72,
        pattern: LANGUAGE_PATTERN,
      });
      const referenceAssetId =
        prompt.referenceAssetId === undefined
          ? undefined
          : readAssetId(
              prompt.referenceAssetId,
              `${path}.pronunciationPrompt.referenceAssetId`,
              issues,
            );
      const ttsAllowed = readBoolean(
        prompt.ttsAllowed,
        `${path}.pronunciationPrompt.ttsAllowed`,
        issues,
      );
      const fallbackAnswer =
        prompt.fallbackAnswer === undefined
          ? undefined
          : readString(
              prompt.fallbackAnswer,
              `${path}.pronunciationPrompt.fallbackAnswer`,
              issues,
              {
                min: 1,
                max: 10_000,
              },
            );
      if (text && language && ttsAllowed !== undefined && (referenceAssetId || ttsAllowed)) {
        pronunciationPrompt = Object.freeze({
          text,
          language,
          ...(referenceAssetId ? { referenceAssetId } : {}),
          ttsAllowed,
          ...(fallbackAnswer ? { fallbackAnswer } : {}),
        });
      } else if (text && language && !referenceAssetId && !ttsAllowed) {
        issue(
          issues,
          `${path}.pronunciationPrompt`,
          "missing_audio_source",
          "Pronunciation requires reference audio or local text-to-speech",
        );
      }
    }
    const selfReview = readLiteral(record.selfReview, true, `${path}.selfReview`, issues);
    if (!base || !pronunciationPrompt || !selfReview) return undefined;
    return Object.freeze({
      kind: "pronunciation",
      schemaVersion: CARD_SCHEMA_VERSION,
      pronunciationPrompt,
      selfReview: true,
    });
  },
);

const parseDrawingLayer: SchemaParser<DrawingReferenceLayer> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["semanticKey", "assetId", "strokes", "opacity", "position"], path, issues);
  const semanticKey = readSemanticKey(record.semanticKey, `${path}.semanticKey`, issues);
  const assetId =
    record.assetId === undefined
      ? undefined
      : readAssetId(record.assetId, `${path}.assetId`, issues);
  const strokes = readArray(
    record.strokes ?? [],
    `${path}.strokes`,
    issues,
    (value, valuePath, valueIssues) => {
      const parsed = drawingStrokeSchema.safeParse(value);
      if (parsed.success) return parsed.data;
      parsed.issues.forEach((child) =>
        valueIssues.push({
          ...child,
          path: child.path === "$" ? valuePath : `${valuePath}${child.path.slice(1)}`,
        }),
      );
      return undefined;
    },
    { max: 1_000 },
  );
  const opacity = readNumber(record.opacity, `${path}.opacity`, issues, { min: 0, max: 1 });
  const position = readNumber(record.position, `${path}.position`, issues, {
    min: 0,
    max: 99,
    integer: true,
  });
  if (!semanticKey || !strokes || opacity === undefined || position === undefined) return undefined;
  if (!assetId && strokes.length === 0) {
    issue(
      issues,
      path,
      "empty_layer",
      "A drawing reference layer needs an asset or vector strokes",
    );
    return undefined;
  }
  return Object.freeze({
    semanticKey,
    ...(assetId ? { assetId } : {}),
    strokes: Object.freeze(strokes),
    opacity,
    position,
  });
};

export const drawingCardSchema = createRuntimeSchema<DrawingCardData>(
  "drawing card",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(
      record,
      ["kind", "schemaVersion", "prompt", "drawingLayers", "fallbackAnswer", "evaluation"],
      path,
      issues,
    );
    const base = parseBase(record, "drawing", path, issues);
    const prompt = parseDocument(record.prompt, `${path}.prompt`, issues);
    const drawingLayers = readArray(
      record.drawingLayers ?? [],
      `${path}.drawingLayers`,
      issues,
      parseDrawingLayer,
      { max: 100 },
    );
    const fallbackAnswer = readString(record.fallbackAnswer, `${path}.fallbackAnswer`, issues, {
      min: 1,
      max: 10_000,
    });
    const evaluation = readLiteral(record.evaluation, "self_review", `${path}.evaluation`, issues);
    if (!base || !prompt || !drawingLayers || !fallbackAnswer || !evaluation) return undefined;
    if (!requireDocumentContent(prompt, `${path}.prompt`, issues)) return undefined;
    validateUniqueKeys(drawingLayers, `${path}.drawingLayers`, issues);
    validatePositions(drawingLayers, `${path}.drawingLayers`, issues);
    if (issues.length > 0) return undefined;
    return Object.freeze({
      kind: "drawing",
      schemaVersion: CARD_SCHEMA_VERSION,
      prompt,
      drawingLayers: Object.freeze(
        [...drawingLayers].sort((left, right) => left.position - right.position),
      ),
      fallbackAnswer,
      evaluation: "self_review",
    });
  },
);

export const cardTypeSchemas = Object.freeze({
  basic: basicCardSchema,
  basic_reversed: basicReversedCardSchema,
  optional_reversed: optionalReversedCardSchema,
  bidirectional: bidirectionalCardSchema,
  custom: customCardSchema,
  typed_answer: typedAnswerCardSchema,
  cloze: clozeCardSchema,
  image_occlusion: imageOcclusionCardSchema,
  multiple_choice: multipleChoiceCardSchema,
  select_all: selectAllCardSchema,
  true_false: trueFalseCardSchema,
  ordering: orderingCardSchema,
  list_answer: listAnswerCardSchema,
  diagram: diagramCardSchema,
  audio_prompt: audioPromptCardSchema,
  pronunciation: pronunciationCardSchema,
  drawing: drawingCardSchema,
} satisfies {
  readonly [TKind in CardKind]: RuntimeSchema<Extract<CardAuthoringData, { readonly kind: TKind }>>;
});

export const cardAuthoringSchema = createRuntimeSchema<CardAuthoringData>(
  "card authoring data",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    const kind = readOneOf(record.kind, cardKinds, `${path}.kind`, issues);
    if (!kind) return undefined;
    const schema = cardTypeSchemas[kind] as RuntimeSchema<CardAuthoringData>;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      parsed.issues.forEach((child) => issues.push(child));
      return undefined;
    }
    return parsed.data;
  },
);

export const systemCardTypeDefinitions: readonly CardTypeDefinition[] = Object.freeze([
  {
    kind: "basic",
    label: "Basic",
    description: "Front-to-back recall",
    bulkImportKey: "basic",
    accessibleInteraction: "Read the prompt, then reveal the answer",
  },
  {
    kind: "basic_reversed",
    label: "Basic + reversed",
    description: "Two directional sibling cards",
    bulkImportKey: "basic_reversed",
    accessibleInteraction: "Read either side, then reveal its paired side",
  },
  {
    kind: "optional_reversed",
    label: "Optional reversed",
    description: "Create a reverse sibling only when enabled",
    bulkImportKey: "optional_reversed",
    accessibleInteraction: "Read either enabled direction, then reveal the answer",
  },
  {
    kind: "bidirectional",
    label: "Bidirectional",
    description: "Symmetric recall in both directions",
    bulkImportKey: "bidirectional",
    accessibleInteraction: "Recall the paired concept from either side",
  },
  {
    kind: "custom",
    label: "Custom template",
    description: "Safe multi-field generated cards",
    bulkImportKey: "custom",
    accessibleInteraction: "Follow the template's labeled prompt and answer",
  },
  {
    kind: "typed_answer",
    label: "Typed answer",
    description: "Enter an answer before revealing",
    bulkImportKey: "typed_answer",
    accessibleInteraction: "Type an answer in a labeled text field",
  },
  {
    kind: "cloze",
    label: "Cloze deletion",
    description: "Recall one or more hidden spans",
    bulkImportKey: "cloze",
    accessibleInteraction: "Hidden spans are announced as blanks with optional hints",
  },
  {
    kind: "image_occlusion",
    label: "Image occlusion",
    description: "Recall masked image regions",
    bulkImportKey: "image_occlusion",
    accessibleInteraction: "Use the labeled region list instead of pointing on the image",
  },
  {
    kind: "multiple_choice",
    label: "Multiple choice",
    description: "Choose one correct answer",
    bulkImportKey: "multiple_choice",
    accessibleInteraction: "Select one option from a radio group",
  },
  {
    kind: "select_all",
    label: "Select all",
    description: "Choose every correct answer",
    bulkImportKey: "select_all",
    accessibleInteraction: "Toggle options in a checkbox group",
  },
  {
    kind: "true_false",
    label: "True / false",
    description: "Judge a statement",
    bulkImportKey: "true_false",
    accessibleInteraction: "Choose True or False from a radio group",
  },
  {
    kind: "ordering",
    label: "Ordering",
    description: "Arrange items into sequence",
    bulkImportKey: "ordering",
    accessibleInteraction: "Use move-up and move-down controls rather than dragging",
  },
  {
    kind: "list_answer",
    label: "List answer",
    description: "Recall a set of answers",
    bulkImportKey: "list_answer",
    accessibleInteraction: "Enter one list item per labeled row",
  },
  {
    kind: "diagram",
    label: "Diagram hotspot",
    description: "Name or locate diagram regions",
    bulkImportKey: "diagram",
    accessibleInteraction: "Use the textual hotspot list and labels",
  },
  {
    kind: "audio_prompt",
    label: "Audio prompt",
    description: "Recall from audio with transcript fallback",
    bulkImportKey: "audio_prompt",
    accessibleInteraction: "Play audio or read its transcript",
  },
  {
    kind: "pronunciation",
    label: "Pronunciation",
    description: "Speak and self-review pronunciation",
    bulkImportKey: "pronunciation",
    accessibleInteraction: "Use reference audio or text-to-speech and a typed fallback",
  },
  {
    kind: "drawing",
    label: "Drawing",
    description: "Draw or handwrite, then self-review",
    bulkImportKey: "drawing",
    accessibleInteraction: "Use the typed nonvisual answer alternative",
  },
]);
