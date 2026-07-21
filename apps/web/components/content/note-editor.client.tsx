"use client";

import {
  CARD_SCHEMA_VERSION,
  cardAuthoringSchema,
  emptyRichDocument,
  extractRichDocumentText,
  generateCardBlueprints,
  isCustomFieldList,
  isCustomFieldMedia,
  type BasicCardData,
  type BasicReversedCardData,
  type CardAuthoringData,
  type ChoiceDefinition,
  type ClozeCardData,
  type CustomCardData,
  type CustomFieldValue,
  type DiagramCardData,
  type DrawingReferenceLayer,
  type DrawingStroke,
  type ImageOcclusionCardData,
  type ListAnswerCardData,
  type OrderingCardData,
  type PronunciationCardData,
  type RichDocument,
  type SelectAllCardData,
  type AudioPromptCardData,
  type ValidationIssue,
} from "@lumen/domain";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  Badge,
  Button,
  Checkbox,
  Dialog,
  FormField,
  Input,
  Select,
  Textarea,
} from "@lumen/ui";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { CARD_TYPE_BY_CODE, CARD_TYPE_DESCRIPTORS } from "@/lib/content/card-types";
import {
  conflictRecoveryMessage,
  ContentApiRequestError,
  PendingContentMutations,
  performContentMutation,
} from "@/lib/content/client-mutations";
import type { CardTypeCode, ContentMutationResult, NoteSummary } from "@/lib/content/view-models";
import { DrawingEditor } from "./drawing-editor.client";
import { MediaUploader, type UploadedMediaAsset } from "./media-uploader.client";
import { RichEditor } from "./rich-editor.client";
import { StudyCardRenderer } from "./study-card-renderer.client";
import { VisualRegionEditor, type VisualRegion } from "./visual-region-editor.client";

type SaveState = "conflict" | "dirty" | "error" | "idle" | "reloading" | "saved" | "saving";
type FieldErrors = Readonly<Record<string, string>>;
const NO_FIELD_ERRORS: FieldErrors = Object.freeze({});
const TEMPLATE_STYLING_ERROR_CODES = new Set([
  "invalid_declaration",
  "invalid_scope",
  "invalid_selector",
  "invalid_stylesheet",
  "nested_rule",
  "unsafe_at_rule",
  "unsafe_property",
  "unsafe_selector",
  "unsafe_value",
]);

function addFriendlyError(errors: Record<string, string>, path: string, message: string): void {
  errors[path] ??= message;
}

function friendlyFieldErrors(
  data: CardAuthoringData,
  issues: readonly ValidationIssue[],
): FieldErrors {
  const errors: Record<string, string> = {};

  for (const issue of issues) {
    const path = issue.path.replace(/^\$\.?/u, "");
    const visualRegion = /^(occlusions|hotspots)\[(\d+)\](?:\.(.+))?$/u.exec(path);
    if (visualRegion) {
      const [, collection = "", index = "", nested = ""] = visualRegion;
      const base = `${collection}[${index}]`;
      if (nested === "label" || nested.startsWith("label.")) {
        addFriendlyError(errors, `${base}.label`, "Add a short label for this region.");
      } else if (nested === "altText" || nested.startsWith("altText.")) {
        addFriendlyError(
          errors,
          `${base}.altText`,
          "Describe this region’s location in the image.",
        );
      } else if (
        nested === "groupKey" ||
        nested.startsWith("groupKey.") ||
        nested === "semanticKey" ||
        nested.startsWith("semanticKey.")
      ) {
        addFriendlyError(
          errors,
          `${base}.groupKey`,
          "Use letters, numbers, hyphens, or underscores for the group name.",
        );
      } else if (nested === "aliases" || nested.startsWith("aliases[")) {
        addFriendlyError(
          errors,
          `${base}.aliases`,
          issue.code === "duplicate_alias"
            ? "Use distinct aliases that differ from the label."
            : "Check the accepted aliases for this region.",
        );
      } else if (nested === "promptDirection" || nested.startsWith("promptDirection.")) {
        addFriendlyError(errors, `${base}.promptDirection`, "Choose how this region is studied.");
      } else {
        addFriendlyError(errors, `${base}.shape`, "Keep this region inside the image.");
      }
      continue;
    }

    const choice = /^choices\[(\d+)\](?:\.(.+))?$/u.exec(path);
    if (choice) {
      const [, index = "", nested = ""] = choice;
      addFriendlyError(
        errors,
        `choices[${index}].${nested.startsWith("feedback") ? "feedback" : "content"}`,
        nested.startsWith("feedback")
          ? `Check the feedback for choice ${String(Number(index) + 1)}.`
          : `Add content to choice ${String(Number(index) + 1)}.`,
      );
      continue;
    }

    const orderingItem = /^orderingItems\[(\d+)\](?:\.(.+))?$/u.exec(path);
    if (orderingItem) {
      const [, index = ""] = orderingItem;
      addFriendlyError(
        errors,
        `orderingItems[${index}].content`,
        `Add content to step ${String(Number(index) + 1)}.`,
      );
      continue;
    }

    const listItem = /^listItems\[(\d+)\](?:\.(.+))?$/u.exec(path);
    if (listItem) {
      const [, index = "", nested = ""] = listItem;
      const key = nested.startsWith("aliases") ? "aliases" : "answer";
      addFriendlyError(
        errors,
        `listItems[${index}].${key}`,
        key === "aliases"
          ? "Use distinct aliases that differ from this answer."
          : `Add answer ${String(Number(index) + 1)}.`,
      );
      continue;
    }

    const cloze = /^clozes\[(\d+)\](?:\.(.+))?$/u.exec(path);
    if (cloze) {
      const [, index = "", nested = ""] = cloze;
      const range = /^ranges\[(\d+)\](?:\.(from|to))?$/u.exec(nested);
      if (range) {
        const [, rangeIndex = "", edge] = range;
        const key = edge === "from" ? "from" : "to";
        addFriendlyError(
          errors,
          `clozes[${index}].ranges[${rangeIndex}].${key}`,
          key === "from" ? "Use a valid blank start." : "End the blank after its start.",
        );
      } else {
        addFriendlyError(
          errors,
          `clozes[${index}].semanticKey`,
          "Add a unique group name using letters, numbers, hyphens, or underscores.",
        );
      }
      continue;
    }

    const customField = /^fields\.([A-Za-z][A-Za-z0-9_]*)(?:\.(.+))?$/u.exec(path);
    if (customField) {
      const [, fieldName = "", nested = ""] = customField;
      addFriendlyError(
        errors,
        nested === "alt" ? `fields.${fieldName}.alt` : `fields.${fieldName}`,
        nested === "alt"
          ? `Add alternative text for ${fieldName}.`
          : `Add valid content to ${fieldName}.`,
      );
      continue;
    }

    const template = /^templates\[(\d+)\](?:\.(.+))?$/u.exec(path);
    if (template) {
      const [, index = "", nested] = template;
      const key =
        nested === "name" ||
        nested === "frontTemplate" ||
        nested === "backTemplate" ||
        nested === "stylingCss"
          ? nested
          : TEMPLATE_STYLING_ERROR_CODES.has(issue.code) || nested?.startsWith("rules[")
            ? "stylingCss"
            : "frontTemplate";
      const label =
        key === "name"
          ? "Add a name for this card layout."
          : key === "backTemplate"
            ? "Complete the back layout."
            : key === "stylingCss"
              ? "Check this card’s styling."
              : issue.code === "unknown_template_field"
                ? "Use only fields that exist in this card."
                : "Complete the front layout.";
      addFriendlyError(errors, `templates[${index}].${key}`, label);
      continue;
    }

    const directMessages: Readonly<Record<string, string>> = {
      acceptedAnswers:
        issue.code === "duplicate_answer"
          ? "Use a different value for each accepted answer."
          : "Add at least one accepted answer.",
      answer: "Add an answer.",
      back: "Add content to the back.",
      choices:
        issue.code === "duplicate_choice"
          ? "Use different text for each answer choice."
          : "Choose the correct answer choices.",
      clozes: "Add at least one blank.",
      drawingLayers: "Check the drawing reference.",
      fallbackAnswer: "Add a typed alternative for the drawing.",
      fields: "Add content to at least one card field.",
      front: "Add content to the front.",
      hotspots: "Add at least one region.",
      imageAlt: "Add a short description of the image.",
      imageAssetId: "Add an image.",
      language: "Use a valid language code, such as en or en-US.",
      listItems: "Add at least one required answer.",
      occlusions: "Draw at least one mask.",
      orderingItems: "Add at least two steps.",
      prompt: "Add a prompt.",
      sideA: "Add the first concept.",
      sideB: "Add the second concept.",
      statement: "Add a statement.",
      templates: "Add at least one card layout.",
      text: "Add the cloze passage.",
    };
    if (path === "fields" && data.kind === "custom") {
      const firstField = Object.keys(data.fields)[0];
      addFriendlyError(
        errors,
        firstField ? `fields.${firstField}` : "fields",
        "Add content to at least one card field.",
      );
      continue;
    }
    const direct = Object.entries(directMessages).find(
      ([candidate]) =>
        path === candidate || path.startsWith(`${candidate}.`) || path.startsWith(`${candidate}[`),
    );
    if (direct) {
      addFriendlyError(errors, direct[0], direct[1]);
      continue;
    }

    const audioField = /^audioPrompt\.(assetId|transcript|answer)(?:\.|$)/u.exec(path)?.[1];
    if (audioField) {
      addFriendlyError(
        errors,
        `audioPrompt.${audioField}`,
        audioField === "assetId"
          ? "Add an audio prompt."
          : audioField === "transcript"
            ? "Add a transcript for the audio."
            : "Add an answer.",
      );
      continue;
    }
    if (path === "playbackSpeed") {
      addFriendlyError(errors, path, "Choose a playback speed from 0.5 to 2.");
      continue;
    }

    const pronunciationField = /^pronunciationPrompt\.(text|language|fallbackAnswer)(?:\.|$)/u.exec(
      path,
    )?.[1];
    if (pronunciationField) {
      addFriendlyError(
        errors,
        `pronunciationPrompt.${pronunciationField}`,
        pronunciationField === "text"
          ? "Add the text to pronounce."
          : pronunciationField === "language"
            ? "Use a valid language code, such as en or en-US."
            : "Add a typed fallback answer.",
      );
      continue;
    }
    if (path === "pronunciationPrompt") {
      addFriendlyError(errors, path, "Allow local text-to-speech or attach reference audio.");
      continue;
    }

    addFriendlyError(errors, "_form", `Check the ${data.kind.replaceAll("_", " ")} card fields.`);
  }

  const requireRichContent = (path: string, document: RichDocument, message: string): void => {
    if (!extractRichDocumentText(document).trim()) addFriendlyError(errors, path, message);
  };
  switch (data.kind) {
    case "basic":
    case "basic_reversed":
    case "optional_reversed":
      requireRichContent("front", data.front, "Add content to the front.");
      requireRichContent("back", data.back, "Add content to the back.");
      break;
    case "bidirectional":
      requireRichContent("sideA", data.sideA, "Add the first concept.");
      requireRichContent("sideB", data.sideB, "Add the second concept.");
      break;
    case "typed_answer":
      requireRichContent("prompt", data.prompt, "Add a prompt.");
      requireRichContent("answer", data.answer, "Add an answer.");
      break;
    case "cloze":
      requireRichContent("text", data.text, "Add the cloze passage.");
      break;
    case "multiple_choice":
    case "select_all":
      requireRichContent("prompt", data.prompt, "Add a prompt.");
      data.choices.forEach((choice, index) =>
        requireRichContent(
          `choices[${String(index)}].content`,
          choice.content,
          `Add content to choice ${String(index + 1)}.`,
        ),
      );
      break;
    case "true_false":
      requireRichContent("statement", data.statement, "Add a statement.");
      break;
    case "ordering":
      requireRichContent("prompt", data.prompt, "Add a prompt.");
      data.orderingItems.forEach((item, index) =>
        requireRichContent(
          `orderingItems[${String(index)}].content`,
          item.content,
          `Add content to step ${String(index + 1)}.`,
        ),
      );
      break;
    case "list_answer":
      requireRichContent("prompt", data.prompt, "Add a prompt.");
      break;
    case "audio_prompt":
      requireRichContent("audioPrompt.answer", data.audioPrompt.answer, "Add an answer.");
      break;
    case "drawing":
      requireRichContent("prompt", data.prompt, "Add a prompt.");
      break;
    case "custom":
    case "diagram":
    case "image_occlusion":
    case "pronunciation":
      break;
  }

  return errors;
}

function initialData(kind: CardTypeCode): CardAuthoringData {
  const blank = () => emptyRichDocument("en");
  switch (kind) {
    case "basic":
    case "basic_reversed":
      return { kind, schemaVersion: CARD_SCHEMA_VERSION, front: blank(), back: blank() };
    case "optional_reversed":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        front: blank(),
        back: blank(),
        reverseEnabled: false,
      };
    case "bidirectional":
      return { kind, schemaVersion: CARD_SCHEMA_VERSION, sideA: blank(), sideB: blank() };
    case "custom":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        fields: { Front: blank(), Back: blank() },
        templates: [
          {
            semanticKey: "primary",
            name: "Primary",
            frontTemplate: "{{Front}}",
            backTemplate: "{{FrontSide}}<hr>{{Back}}",
          },
        ],
      };
    case "typed_answer":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        prompt: blank(),
        answer: blank(),
        acceptedAnswers: [""],
        caseSensitive: false,
        language: "en",
      };
    case "cloze":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        text: blank(),
        clozes: [{ semanticKey: "c1", ranges: [{ from: 0, to: 1 }] }],
      };
    case "image_occlusion":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        imageAssetId: "",
        imageAlt: "",
        mode: "hide_one_reveal_others",
        occlusions: [],
      };
    case "multiple_choice":
    case "select_all":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        prompt: blank(),
        choices: [
          { semanticKey: "choice-1", content: blank(), isCorrect: true, position: 0 },
          { semanticKey: "choice-2", content: blank(), isCorrect: false, position: 1 },
        ],
      };
    case "true_false":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        statement: blank(),
        answer: true,
        explanation: blank(),
      };
    case "ordering":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        prompt: blank(),
        orderingItems: [
          { semanticKey: "item-1", content: blank(), position: 0 },
          { semanticKey: "item-2", content: blank(), position: 1 },
        ],
      };
    case "list_answer":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        prompt: blank(),
        listItems: [
          { semanticKey: "item-1", answer: "", aliases: [], required: true, position: 0 },
        ],
        orderMatters: false,
      };
    case "diagram":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        imageAssetId: "",
        imageAlt: "",
        hotspots: [],
      };
    case "audio_prompt":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        audioPrompt: { assetId: "", transcript: "", answer: blank() },
        playbackSpeed: 1,
      };
    case "pronunciation":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        pronunciationPrompt: {
          text: "",
          language: "en",
          ttsAllowed: true,
          fallbackAnswer: "",
        },
        selfReview: true,
      };
    case "drawing":
      return {
        kind,
        schemaVersion: CARD_SCHEMA_VERSION,
        prompt: blank(),
        drawingLayers: [],
        fallbackAnswer: "",
        evaluation: "self_review",
      };
  }
}

function RichField({
  error,
  label,
  onChange,
  value,
}: {
  readonly error?: string | undefined;
  readonly label: string;
  readonly onChange: (value: RichDocument) => void;
  readonly value: RichDocument;
}) {
  const controlId = useId();
  return (
    <FormField controlId={controlId} error={error} label={label}>
      <RichEditor
        controlId={controlId}
        document={value}
        errorId={error ? `${controlId}-error` : undefined}
        invalid={Boolean(error)}
        label={label}
        {...(value.attrs?.language ? { language: value.attrs.language } : {})}
        onChange={onChange}
      />
    </FormField>
  );
}

function PairEditor({
  errors,
  labels,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly labels: readonly [string, string];
  readonly onChange: (value: BasicCardData | BasicReversedCardData) => void;
  readonly value: BasicCardData | BasicReversedCardData;
}) {
  return (
    <div className="grid gap-5">
      <RichField
        error={errors.front}
        label={labels[0]}
        onChange={(front) => onChange({ ...value, front })}
        value={value.front}
      />
      <RichField
        error={errors.back}
        label={labels[1]}
        onChange={(back) => onChange({ ...value, back })}
        value={value.back}
      />
    </div>
  );
}

function ChoiceEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: SelectAllCardData | CardAuthoringData) => void;
  readonly value: SelectAllCardData | Extract<CardAuthoringData, { kind: "multiple_choice" }>;
}) {
  function updateChoice(index: number, patch: Partial<ChoiceDefinition>) {
    const choices = value.choices.map((choice, choiceIndex) =>
      choiceIndex === index ? { ...choice, ...patch } : choice,
    );
    onChange({ ...value, choices } as typeof value);
  }
  function toggleCorrect(index: number, checked: boolean) {
    const choices = value.choices.map((choice, choiceIndex) => ({
      ...choice,
      isCorrect:
        value.kind === "multiple_choice"
          ? checked && choiceIndex === index
          : choiceIndex === index
            ? checked
            : choice.isCorrect,
    }));
    onChange({ ...value, choices } as typeof value);
  }
  return (
    <div className="grid gap-5">
      <RichField
        error={errors.prompt}
        label="Prompt"
        onChange={(prompt) => onChange({ ...value, prompt })}
        value={value.prompt}
      />
      <FormField className="repeatable-list" error={errors.choices} group label="Answer choices">
        {value.choices.map((choice, index) => (
          <div className="repeatable-row" key={choice.semanticKey}>
            <Checkbox
              checked={choice.isCorrect}
              label={value.kind === "multiple_choice" ? "Correct answer" : "Correct choice"}
              onCheckedChange={(checked) => toggleCorrect(index, checked === true)}
            />
            <RichField
              error={errors[`choices[${String(index)}].content`]}
              label={`Choice ${String(index + 1)}`}
              onChange={(content) => updateChoice(index, { content })}
              value={choice.content}
            />
            <RichField
              label="Feedback (optional)"
              onChange={(feedback) => updateChoice(index, { feedback })}
              value={choice.feedback ?? emptyRichDocument("en")}
            />
            <Button
              disabled={value.choices.length <= 2}
              onClick={() =>
                onChange({
                  ...value,
                  choices: value.choices
                    .filter((_, candidateIndex) => candidateIndex !== index)
                    .map((candidate, position) => ({ ...candidate, position })),
                } as typeof value)
              }
              variant="ghost"
            >
              Remove choice
            </Button>
          </div>
        ))}
        <Button
          onClick={() =>
            onChange({
              ...value,
              choices: [
                ...value.choices,
                {
                  semanticKey: `choice-${crypto.randomUUID()}`,
                  content: emptyRichDocument("en"),
                  isCorrect: false,
                  position: value.choices.length,
                },
              ],
            } as typeof value)
          }
          variant="secondary"
        >
          Add choice
        </Button>
      </FormField>
    </div>
  );
}

function CustomEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: CustomCardData) => void;
  readonly value: CustomCardData;
}) {
  const [newField, setNewField] = useState("");
  const [newFieldType, setNewFieldType] = useState<"list" | "media" | "rich_text">("rich_text");
  const [newMedia, setNewMedia] = useState<CustomFieldValue | null>(null);

  function mediaValue(asset: UploadedMediaAsset): CustomFieldValue {
    return Object.freeze({
      alt:
        asset.altText.trim() ||
        asset.transcript.trim() ||
        (asset.kind === "audio" ? "Audio attachment" : "Image attachment"),
      assetId: asset.id,
      kind: "media" as const,
      mediaKind: asset.kind,
    });
  }

  function addField(): void {
    const fieldValue: CustomFieldValue =
      newFieldType === "list"
        ? Object.freeze([])
        : newFieldType === "media"
          ? (newMedia ?? emptyRichDocument("en"))
          : emptyRichDocument("en");
    onChange({ ...value, fields: { ...value.fields, [newField]: fieldValue } });
    setNewField("");
    setNewFieldType("rich_text");
    setNewMedia(null);
  }

  return (
    <div className="grid gap-5">
      <section className="repeatable-list" aria-labelledby="custom-fields-heading">
        <h3 id="custom-fields-heading">Structured fields</h3>
        {Object.entries(value.fields).map(([key, field]) => (
          <div className="repeatable-row" key={key}>
            {isCustomFieldList(field) ? (
              <FormField
                label={`${key} (list)`}
                description="Enter one bounded template item per line."
                error={errors[`fields.${key}`]}
              >
                <Textarea
                  aria-label={`${key} list items`}
                  maxLength={200_000}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      fields: {
                        ...value.fields,
                        [key]: event.target.value
                          .split("\n")
                          .map((item) => item.normalize("NFKC").trim())
                          .filter(Boolean)
                          .slice(0, 100),
                      },
                    })
                  }
                  rows={4}
                  value={field.join("\n")}
                />
              </FormField>
            ) : isCustomFieldMedia(field) ? (
              <div className="grid gap-3" aria-label={`${key} media field`}>
                <FormField
                  error={errors[`fields.${key}.alt`] ?? errors[`fields.${key}`]}
                  label={`${key} media alternative text`}
                >
                  <Input
                    maxLength={2_000}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        fields: {
                          ...value.fields,
                          [key]: { ...field, alt: event.target.value },
                        },
                      })
                    }
                    value={field.alt}
                  />
                </FormField>
                <Badge tone="success">
                  Custom {field.mediaKind === "audio" ? "audio" : "image"} attached
                </Badge>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MediaUploader
                    kind="image"
                    label={`Replace ${key} with an image`}
                    onUploaded={(asset) =>
                      onChange({
                        ...value,
                        fields: { ...value.fields, [key]: mediaValue(asset) },
                      })
                    }
                  />
                  <MediaUploader
                    kind="audio"
                    label={`Replace ${key} with audio`}
                    onUploaded={(asset) =>
                      onChange({
                        ...value,
                        fields: { ...value.fields, [key]: mediaValue(asset) },
                      })
                    }
                  />
                </div>
              </div>
            ) : (
              <RichField
                error={errors[`fields.${key}`]}
                label={key}
                onChange={(document) =>
                  onChange({ ...value, fields: { ...value.fields, [key]: document } })
                }
                value={field}
              />
            )}
            <Button
              disabled={Object.keys(value.fields).length <= 1}
              onClick={() => {
                const fields = Object.fromEntries(
                  Object.entries(value.fields).filter(([candidate]) => candidate !== key),
                );
                onChange({ ...value, fields });
              }}
              variant="ghost"
            >
              Remove {key}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="New field name"
            onChange={(event) => setNewField(event.target.value.replace(/[^A-Za-z0-9_]/gu, ""))}
            placeholder="ExtraField"
            value={newField}
          />
          <Select
            aria-label="New field type"
            onValueChange={(fieldType) => {
              setNewFieldType(fieldType as typeof newFieldType);
              setNewMedia(null);
            }}
            options={[
              { label: "Rich text", value: "rich_text" },
              { label: "List", value: "list" },
              { label: "Media", value: "media" },
            ]}
            value={newFieldType}
          />
          <Button
            disabled={
              Object.keys(value.fields).length >= 64 ||
              !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(newField) ||
              newField in value.fields ||
              (newFieldType === "media" && newMedia === null)
            }
            onClick={addField}
            variant="secondary"
          >
            Add field
          </Button>
        </div>
        {newFieldType === "media" && (
          <div className="grid gap-3 sm:grid-cols-2" aria-label="New custom media value">
            <MediaUploader
              kind="image"
              label="New custom image field"
              onUploaded={(asset) => setNewMedia(mediaValue(asset))}
            />
            <MediaUploader
              kind="audio"
              label="New custom audio field"
              onUploaded={(asset) => setNewMedia(mediaValue(asset))}
            />
            {newMedia && <Badge tone="success">New custom media ready to add</Badge>}
          </div>
        )}
      </section>
      <section className="repeatable-list" aria-labelledby="templates-heading">
        <h3 id="templates-heading">Safe card templates</h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          Insert a field with {"{{FieldName}}"}; each layout controls what learners see before and
          after they reveal the answer.
        </p>
        {value.templates.map((template, index) => (
          <div className="repeatable-row" key={template.semanticKey}>
            <FormField error={errors[`templates[${String(index)}].name`]} label="Template name">
              <Input
                maxLength={120}
                value={template.name}
                onChange={(event) =>
                  onChange({
                    ...value,
                    templates: value.templates.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, name: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            <FormField
              error={errors[`templates[${String(index)}].frontTemplate`]}
              label="Front template"
            >
              <Textarea
                maxLength={50_000}
                rows={4}
                value={template.frontTemplate}
                onChange={(event) =>
                  onChange({
                    ...value,
                    templates: value.templates.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, frontTemplate: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            <FormField
              error={errors[`templates[${String(index)}].backTemplate`]}
              label="Back template"
            >
              <Textarea
                maxLength={50_000}
                rows={4}
                value={template.backTemplate}
                onChange={(event) =>
                  onChange({
                    ...value,
                    templates: value.templates.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, backTemplate: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            <FormField
              error={errors[`templates[${String(index)}].stylingCss`]}
              label="Scoped CSS (optional)"
            >
              <Textarea
                maxLength={20_000}
                rows={3}
                value={template.stylingCss ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    templates: value.templates.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, stylingCss: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
          </div>
        ))}
        <Button
          disabled={value.templates.length >= 20}
          onClick={() =>
            onChange({
              ...value,
              templates: [
                ...value.templates,
                {
                  semanticKey: `template-${crypto.randomUUID()}`,
                  name: `Template ${String(value.templates.length + 1)}`,
                  frontTemplate: "{{Front}}",
                  backTemplate: "{{FrontSide}}<hr>{{Back}}",
                },
              ],
            })
          }
          variant="secondary"
        >
          Add card layout
        </Button>
      </section>
    </div>
  );
}

function ClozeEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: ClozeCardData) => void;
  readonly value: ClozeCardData;
}) {
  return (
    <div className="grid gap-5">
      <RichField
        error={errors.text}
        label="Cloze passage"
        onChange={(text) => onChange({ ...value, text })}
        value={value.text}
      />
      <p className="m-0 text-sm text-[var(--color-text-muted)]">
        Mark the start and end of each blank. Reuse a group name when blanks should appear together.
      </p>
      <FormField className="repeatable-list" error={errors.clozes} group label="Deletion groups">
        {value.clozes.map((cloze, index) => (
          <div className="repeatable-row" key={cloze.semanticKey}>
            <FormField
              error={errors[`clozes[${String(index)}].semanticKey`]}
              label={`Group ${String(index + 1)} name`}
            >
              <Input
                value={cloze.semanticKey}
                onChange={(event) =>
                  onChange({
                    ...value,
                    clozes: value.clozes.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, semanticKey: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            {cloze.ranges.map((range, rangeIndex) => (
              <div
                className="grid grid-cols-2 gap-2"
                key={`${String(range.from)}-${String(range.to)}-${String(rangeIndex)}`}
              >
                <FormField
                  error={errors[`clozes[${String(index)}].ranges[${String(rangeIndex)}].from`]}
                  label="Start"
                >
                  <Input
                    min={0}
                    type="number"
                    value={range.from}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        clozes: value.clozes.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                ranges: candidate.ranges.map(
                                  (candidateRange, candidateRangeIndex) =>
                                    candidateRangeIndex === rangeIndex
                                      ? { ...candidateRange, from: Number(event.target.value) }
                                      : candidateRange,
                                ),
                              }
                            : candidate,
                        ),
                      })
                    }
                  />
                </FormField>
                <FormField
                  error={errors[`clozes[${String(index)}].ranges[${String(rangeIndex)}].to`]}
                  label="End"
                >
                  <Input
                    min={1}
                    type="number"
                    value={range.to}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        clozes: value.clozes.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                ranges: candidate.ranges.map(
                                  (candidateRange, candidateRangeIndex) =>
                                    candidateRangeIndex === rangeIndex
                                      ? { ...candidateRange, to: Number(event.target.value) }
                                      : candidateRange,
                                ),
                              }
                            : candidate,
                        ),
                      })
                    }
                  />
                </FormField>
              </div>
            ))}
            <FormField label="Hint (optional)">
              <Input
                value={cloze.hint ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    clozes: value.clozes.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, hint: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  onChange({
                    ...value,
                    clozes: value.clozes.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, ranges: [...candidate.ranges, { from: 0, to: 1 }] }
                        : candidate,
                    ),
                  })
                }
                variant="secondary"
              >
                Add overlapping range
              </Button>
              <Button
                disabled={value.clozes.length <= 1}
                onClick={() =>
                  onChange({
                    ...value,
                    clozes: value.clozes.filter((_, candidateIndex) => candidateIndex !== index),
                  })
                }
                variant="ghost"
              >
                Remove group
              </Button>
            </div>
          </div>
        ))}
        <Button
          onClick={() =>
            onChange({
              ...value,
              clozes: [
                ...value.clozes,
                {
                  semanticKey: `c${String(value.clozes.length + 1)}`,
                  ranges: [{ from: 0, to: 1 }],
                },
              ],
            })
          }
          variant="secondary"
        >
          Add cloze group
        </Button>
      </FormField>
    </div>
  );
}

function VisualEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: DiagramCardData | ImageOcclusionCardData) => void;
  readonly value: DiagramCardData | ImageOcclusionCardData;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [diagramRegionKeys, setDiagramRegionKeys] = useState<readonly string[]>(() =>
    value.kind === "diagram" ? value.hotspots.map((hotspot) => hotspot.semanticKey) : [],
  );
  useEffect(() => {
    if (!value.imageAssetId || imageUrl) return;
    const controller = new AbortController();
    void fetch(`/api/content/media/${encodeURIComponent(value.imageAssetId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .then((body) => {
        if (typeof body !== "object" || body === null || !("data" in body)) return;
        const data = body.data as Readonly<Record<string, unknown>>;
        if (typeof data.signedUrl === "string") setImageUrl(data.signedUrl);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [imageUrl, value.imageAssetId]);
  const regions: readonly VisualRegion[] =
    value.kind === "diagram"
      ? value.hotspots.map((hotspot, index) => ({
          ...hotspot,
          altText: hotspot.altText,
          groupKey: hotspot.semanticKey,
          semanticKey: diagramRegionKeys[index] ?? hotspot.semanticKey,
        }))
      : value.occlusions.map((region) => ({
          ...region,
          aliases: [],
          altText: region.altText ?? region.label,
          promptDirection: "region_to_label",
        }));
  const collection = value.kind === "diagram" ? "hotspots" : "occlusions";
  const regionErrors = regions.map((_, index) => ({
    aliases: errors[`${collection}[${String(index)}].aliases`],
    altText: errors[`${collection}[${String(index)}].altText`],
    groupKey: errors[`${collection}[${String(index)}].groupKey`],
    label: errors[`${collection}[${String(index)}].label`],
    promptDirection: errors[`${collection}[${String(index)}].promptDirection`],
    shape: errors[`${collection}[${String(index)}].shape`],
  }));
  function attach(asset: UploadedMediaAsset) {
    setImageUrl(asset.signedUrl);
    onChange({ ...value, imageAssetId: asset.id, imageAlt: asset.altText } as typeof value);
  }
  function update(regionsValue: readonly VisualRegion[]) {
    if (value.kind === "diagram") {
      setDiagramRegionKeys(regionsValue.map((region) => region.semanticKey));
      onChange({
        ...value,
        hotspots: regionsValue.map(
          ({ groupKey, shape, label, altText, aliases, promptDirection }) => ({
            semanticKey: groupKey,
            shape,
            label,
            altText,
            aliases,
            promptDirection,
          }),
        ),
      });
    } else {
      onChange({
        ...value,
        occlusions: regionsValue.map(({ semanticKey, groupKey, shape, label, altText }) => ({
          semanticKey,
          groupKey,
          shape,
          label,
          altText,
        })),
      });
    }
  }
  return (
    <div className="grid gap-5">
      <FormField error={errors.imageAssetId} group label="Image">
        <MediaUploader
          imageDescription={{
            error: errors.imageAlt,
            onChange: (imageAlt) => onChange({ ...value, imageAlt } as typeof value),
            value: value.imageAlt,
          }}
          kind="image"
          label={value.kind === "diagram" ? "Diagram image" : "Occlusion image"}
          onRemoved={() => {
            setImageUrl(null);
            onChange({ ...value, imageAssetId: "" } as typeof value);
          }}
          onUploaded={attach}
        />
      </FormField>
      {value.imageAssetId && <Badge tone="success">Image attached</Badge>}
      <FormField
        error={errors[collection]}
        group
        label={value.kind === "diagram" ? "Diagram regions" : "Occlusion masks"}
      >
        <VisualRegionEditor
          imageAlt={value.imageAlt}
          imageUrl={imageUrl}
          kind={value.kind === "diagram" ? "diagram" : "occlusion"}
          {...(value.kind === "image_occlusion"
            ? {
                mode: value.mode,
                onModeChange: (mode: ImageOcclusionCardData["mode"]) =>
                  onChange({ ...value, mode }),
              }
            : {})}
          onChange={update}
          regionErrors={regionErrors}
          regions={regions}
        />
      </FormField>
    </div>
  );
}

function OrderingEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: OrderingCardData) => void;
  readonly value: OrderingCardData;
}) {
  function move(index: number, direction: -1 | 1) {
    const next = [...value.orderingItems];
    const target = index + direction;
    if (!next[index] || !next[target]) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...value, orderingItems: next.map((item, position) => ({ ...item, position })) });
  }
  return (
    <div className="grid gap-5">
      <RichField
        error={errors.prompt}
        label="Sequencing prompt"
        onChange={(prompt) => onChange({ ...value, prompt })}
        value={value.prompt}
      />
      <FormField
        className="repeatable-list"
        error={errors.orderingItems}
        group
        label="Correct order"
      >
        {value.orderingItems.map((item, index) => (
          <div className="repeatable-row" key={item.semanticKey}>
            <RichField
              error={errors[`orderingItems[${String(index)}].content`]}
              label={`Step ${String(index + 1)}`}
              onChange={(content) =>
                onChange({
                  ...value,
                  orderingItems: value.orderingItems.map((candidate, candidateIndex) =>
                    candidateIndex === index ? { ...candidate, content } : candidate,
                  ),
                })
              }
              value={item.content}
            />
            <div className="flex gap-2">
              <Button
                aria-label={`Move step ${String(index + 1)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                variant="secondary"
              >
                <ArrowUpIcon aria-hidden="true" />
              </Button>
              <Button
                aria-label={`Move step ${String(index + 1)} down`}
                disabled={index === value.orderingItems.length - 1}
                onClick={() => move(index, 1)}
                variant="secondary"
              >
                <ArrowDownIcon aria-hidden="true" />
              </Button>
              <Button
                disabled={value.orderingItems.length <= 2}
                onClick={() =>
                  onChange({
                    ...value,
                    orderingItems: value.orderingItems
                      .filter((_, candidateIndex) => candidateIndex !== index)
                      .map((candidate, position) => ({ ...candidate, position })),
                  })
                }
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          onClick={() =>
            onChange({
              ...value,
              orderingItems: [
                ...value.orderingItems,
                {
                  semanticKey: `item-${crypto.randomUUID()}`,
                  content: emptyRichDocument("en"),
                  position: value.orderingItems.length,
                },
              ],
            })
          }
          variant="secondary"
        >
          Add step
        </Button>
      </FormField>
    </div>
  );
}

function ListEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: ListAnswerCardData) => void;
  readonly value: ListAnswerCardData;
}) {
  return (
    <div className="grid gap-5">
      <RichField
        error={errors.prompt}
        label="List prompt"
        onChange={(prompt) => onChange({ ...value, prompt })}
        value={value.prompt}
      />
      <Checkbox
        checked={value.orderMatters}
        label="Answers must be in this order"
        onCheckedChange={(checked) => onChange({ ...value, orderMatters: checked === true })}
      />
      <FormField
        className="repeatable-list"
        error={errors.listItems}
        group
        label="Expected list items"
      >
        {value.listItems.map((item, index) => (
          <div className="repeatable-row" key={item.semanticKey}>
            <FormField
              error={errors[`listItems[${String(index)}].answer`]}
              label={`Answer ${String(index + 1)}`}
            >
              <Input
                value={item.answer}
                onChange={(event) =>
                  onChange({
                    ...value,
                    listItems: value.listItems.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, answer: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            <FormField
              error={errors[`listItems[${String(index)}].aliases`]}
              label="Accepted aliases"
            >
              <Input
                placeholder="Comma separated"
                value={item.aliases.join(", ")}
                onChange={(event) =>
                  onChange({
                    ...value,
                    listItems: value.listItems.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? {
                            ...candidate,
                            aliases: event.target.value
                              .split(",")
                              .map((alias) => alias.trim())
                              .filter(Boolean),
                          }
                        : candidate,
                    ),
                  })
                }
              />
            </FormField>
            <Checkbox
              checked={item.required}
              label="Required"
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  listItems: value.listItems.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, required: checked === true }
                      : candidate,
                  ),
                })
              }
            />
            <Button
              disabled={value.listItems.length <= 1}
              onClick={() =>
                onChange({
                  ...value,
                  listItems: value.listItems
                    .filter((_, candidateIndex) => candidateIndex !== index)
                    .map((candidate, position) => ({ ...candidate, position })),
                })
              }
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          onClick={() =>
            onChange({
              ...value,
              listItems: [
                ...value.listItems,
                {
                  semanticKey: `item-${crypto.randomUUID()}`,
                  answer: "",
                  aliases: [],
                  required: true,
                  position: value.listItems.length,
                },
              ],
            })
          }
          variant="secondary"
        >
          Add answer
        </Button>
      </FormField>
    </div>
  );
}

function AudioEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: AudioPromptCardData) => void;
  readonly value: AudioPromptCardData;
}) {
  return (
    <div className="grid gap-5">
      <FormField error={errors["audioPrompt.assetId"]} group label="Audio prompt file">
        <MediaUploader
          kind="audio"
          label="Audio prompt"
          onRemoved={() =>
            onChange({
              ...value,
              audioPrompt: { ...value.audioPrompt, assetId: "" },
            })
          }
          onUploaded={(asset) =>
            onChange({
              ...value,
              audioPrompt: {
                ...value.audioPrompt,
                assetId: asset.id,
                transcript: asset.transcript,
              },
            })
          }
        />
      </FormField>
      {value.audioPrompt.assetId && <Badge tone="success">Audio attached</Badge>}
      <FormField error={errors["audioPrompt.transcript"]} label="Transcript">
        <Textarea
          value={value.audioPrompt.transcript}
          onChange={(event) =>
            onChange({
              ...value,
              audioPrompt: { ...value.audioPrompt, transcript: event.target.value },
            })
          }
        />
      </FormField>
      <RichField
        error={errors["audioPrompt.answer"]}
        label="Answer"
        onChange={(answer) => onChange({ ...value, audioPrompt: { ...value.audioPrompt, answer } })}
        value={value.audioPrompt.answer}
      />
      <FormField error={errors.playbackSpeed} label="Default playback speed">
        <Input
          min={0.5}
          max={2}
          step={0.25}
          type="number"
          value={value.playbackSpeed}
          onChange={(event) => onChange({ ...value, playbackSpeed: Number(event.target.value) })}
        />
      </FormField>
    </div>
  );
}

function PronunciationEditor({
  errors,
  onChange,
  value,
}: {
  readonly errors: FieldErrors;
  readonly onChange: (value: PronunciationCardData) => void;
  readonly value: PronunciationCardData;
}) {
  function speak() {
    if (!("speechSynthesis" in window) || !value.pronunciationPrompt.text) return;
    const utterance = new SpeechSynthesisUtterance(value.pronunciationPrompt.text);
    utterance.lang = value.pronunciationPrompt.language;
    window.speechSynthesis.speak(utterance);
  }
  return (
    <div className="grid gap-5">
      <FormField error={errors["pronunciationPrompt.text"]} label="Text to pronounce">
        <Input
          value={value.pronunciationPrompt.text}
          onChange={(event) =>
            onChange({
              ...value,
              pronunciationPrompt: { ...value.pronunciationPrompt, text: event.target.value },
            })
          }
        />
      </FormField>
      <FormField error={errors["pronunciationPrompt.language"]} label="Language">
        <Input
          value={value.pronunciationPrompt.language}
          onChange={(event) =>
            onChange({
              ...value,
              pronunciationPrompt: { ...value.pronunciationPrompt, language: event.target.value },
            })
          }
        />
      </FormField>
      <FormField
        className="grid gap-3"
        error={errors.pronunciationPrompt}
        group
        label="Pronunciation audio"
      >
        <Checkbox
          checked={value.pronunciationPrompt.ttsAllowed}
          label="Allow local browser text-to-speech"
          onCheckedChange={(checked) =>
            onChange({
              ...value,
              pronunciationPrompt: { ...value.pronunciationPrompt, ttsAllowed: checked === true },
            })
          }
        />
        <Button
          disabled={!value.pronunciationPrompt.ttsAllowed || !value.pronunciationPrompt.text}
          onClick={speak}
          variant="secondary"
        >
          Preview local pronunciation
        </Button>
        <MediaUploader
          kind="audio"
          label="Optional reference pronunciation"
          onRemoved={() => {
            const { referenceAssetId: _removed, ...pronunciationPrompt } =
              value.pronunciationPrompt;
            onChange({ ...value, pronunciationPrompt });
          }}
          onUploaded={(asset) =>
            onChange({
              ...value,
              pronunciationPrompt: { ...value.pronunciationPrompt, referenceAssetId: asset.id },
            })
          }
        />
      </FormField>
      <FormField
        error={errors["pronunciationPrompt.fallbackAnswer"]}
        label="Typed or non-audio fallback"
      >
        <Input
          value={value.pronunciationPrompt.fallbackAnswer ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              pronunciationPrompt: {
                ...value.pronunciationPrompt,
                fallbackAnswer: event.target.value,
              },
            })
          }
        />
      </FormField>
      <p className="text-sm text-[var(--color-text-muted)]">
        Learner recordings are local and explicit. Pronunciation is self-reviewed; no cloud speech
        service is used.
      </p>
    </div>
  );
}

function CardFields({
  data,
  errors,
  onChange,
}: {
  readonly data: CardAuthoringData;
  readonly errors: FieldErrors;
  readonly onChange: (data: CardAuthoringData) => void;
}): ReactNode {
  switch (data.kind) {
    case "basic":
    case "basic_reversed":
      return (
        <PairEditor
          errors={errors}
          labels={["Front / prompt", "Back / answer"]}
          onChange={onChange}
          value={data}
        />
      );
    case "optional_reversed":
      return (
        <div className="grid gap-5">
          <RichField
            error={errors.front}
            label="Front / prompt"
            onChange={(front) => onChange({ ...data, front })}
            value={data.front}
          />
          <RichField
            error={errors.back}
            label="Back / answer"
            onChange={(back) => onChange({ ...data, back })}
            value={data.back}
          />
          <Checkbox
            checked={data.reverseEnabled}
            label="Create a second card in the reverse direction"
            onCheckedChange={(checked) => onChange({ ...data, reverseEnabled: checked === true })}
          />
        </div>
      );
    case "bidirectional":
      return (
        <div className="grid gap-5">
          <RichField
            error={errors.sideA}
            label="Concept A"
            onChange={(sideA) => onChange({ ...data, sideA })}
            value={data.sideA}
          />
          <RichField
            error={errors.sideB}
            label="Concept B"
            onChange={(sideB) => onChange({ ...data, sideB })}
            value={data.sideB}
          />
        </div>
      );
    case "custom":
      return <CustomEditor errors={errors} onChange={onChange} value={data} />;
    case "typed_answer":
      return (
        <div className="grid gap-5">
          <RichField
            error={errors.prompt}
            label="Prompt"
            onChange={(prompt) => onChange({ ...data, prompt })}
            value={data.prompt}
          />
          <RichField
            error={errors.answer}
            label="Displayed answer"
            onChange={(answer) => onChange({ ...data, answer })}
            value={data.answer}
          />
          <FormField error={errors.acceptedAnswers} label="Accepted typed answers">
            <Textarea
              value={data.acceptedAnswers.join("\n")}
              onChange={(event) =>
                onChange({ ...data, acceptedAnswers: event.target.value.split("\n") })
              }
            />
          </FormField>
          <Checkbox
            checked={data.caseSensitive}
            label="Answers are case-sensitive"
            onCheckedChange={(checked) => onChange({ ...data, caseSensitive: checked === true })}
          />
          <FormField error={errors.language} label="Answer language">
            <Input
              value={data.language ?? ""}
              onChange={(event) => onChange({ ...data, language: event.target.value })}
            />
          </FormField>
        </div>
      );
    case "cloze":
      return <ClozeEditor errors={errors} onChange={onChange} value={data} />;
    case "image_occlusion":
    case "diagram":
      return <VisualEditor errors={errors} onChange={onChange} value={data} />;
    case "multiple_choice":
    case "select_all":
      return <ChoiceEditor errors={errors} onChange={onChange} value={data} />;
    case "true_false":
      return (
        <div className="grid gap-5">
          <RichField
            error={errors.statement}
            label="Statement"
            onChange={(statement) => onChange({ ...data, statement })}
            value={data.statement}
          />
          <FormField label="Correct answer">
            <Select
              value={data.answer ? "true" : "false"}
              onValueChange={(answer) => onChange({ ...data, answer: answer === "true" })}
              options={[
                { label: "True", value: "true" },
                { label: "False", value: "false" },
              ]}
            />
          </FormField>
          <RichField
            label="Explanation"
            onChange={(explanation) => onChange({ ...data, explanation })}
            value={data.explanation ?? emptyRichDocument("en")}
          />
        </div>
      );
    case "ordering":
      return <OrderingEditor errors={errors} onChange={onChange} value={data} />;
    case "list_answer":
      return <ListEditor errors={errors} onChange={onChange} value={data} />;
    case "audio_prompt":
      return <AudioEditor errors={errors} onChange={onChange} value={data} />;
    case "pronunciation":
      return <PronunciationEditor errors={errors} onChange={onChange} value={data} />;
    case "drawing":
      return (
        <div className="grid gap-5">
          <RichField
            error={errors.prompt}
            label="Drawing prompt"
            onChange={(prompt) => onChange({ ...data, prompt })}
            value={data.prompt}
          />
          <MediaUploader
            kind="image"
            label="Optional drawing reference image"
            onRemoved={() =>
              onChange({
                ...data,
                drawingLayers: removePrimaryDrawingAsset(data.drawingLayers),
              })
            }
            onUploaded={(asset) =>
              onChange({
                ...data,
                drawingLayers: attachPrimaryDrawingAsset(data.drawingLayers, asset.id),
              })
            }
          />
          {data.drawingLayers[0]?.assetId && (
            <Badge tone="success">Drawing reference image attached</Badge>
          )}
          <FormField error={errors.drawingLayers} group label="Drawing response">
            <DrawingEditor
              strokes={data.drawingLayers[0]?.strokes ?? []}
              typedFallback={data.fallbackAnswer}
              typedFallbackError={errors.fallbackAnswer}
              onTypedFallbackChange={(fallbackAnswer) => onChange({ ...data, fallbackAnswer })}
              onChange={(strokes) =>
                onChange({
                  ...data,
                  drawingLayers: replacePrimaryDrawingStrokes(data.drawingLayers, strokes),
                })
              }
            />
          </FormField>
        </div>
      );
  }
}

function attachPrimaryDrawingAsset(
  layers: readonly DrawingReferenceLayer[],
  assetId: string,
): readonly DrawingReferenceLayer[] {
  const primary = layers[0];
  if (!primary) {
    return [
      {
        assetId,
        opacity: 1,
        position: 0,
        semanticKey: "reference",
        strokes: [],
      },
    ];
  }
  return [{ ...primary, assetId }, ...layers.slice(1)];
}

function replacePrimaryDrawingStrokes(
  layers: readonly DrawingReferenceLayer[],
  strokes: readonly DrawingStroke[],
): readonly DrawingReferenceLayer[] {
  const primary = layers[0];
  if (!primary) {
    return strokes.length === 0
      ? []
      : [
          {
            opacity: 1,
            position: 0,
            semanticKey: "reference",
            strokes,
          },
        ];
  }
  const remaining = layers.slice(1);
  if (!primary.assetId && strokes.length === 0) {
    return remaining.map((layer, position) => ({ ...layer, position }));
  }
  return [{ ...primary, strokes }, ...remaining];
}

function removePrimaryDrawingAsset(
  layers: readonly DrawingReferenceLayer[],
): readonly DrawingReferenceLayer[] {
  const primary = layers[0];
  if (!primary?.assetId) return layers;
  const { assetId: _removed, ...withoutAsset } = primary;
  if (withoutAsset.strokes.length === 0) {
    return layers.slice(1).map((layer, position) => ({ ...layer, position }));
  }
  return [withoutAsset, ...layers.slice(1)];
}

function friendlyPreviewNeeds(
  data: CardAuthoringData,
  issues: readonly ValidationIssue[],
): readonly string[] {
  const messages = Object.values(friendlyFieldErrors(data, issues));
  return [...new Set(messages.length > 0 ? messages : ["Check the card fields."])];
}

function SiblingPreview({ data }: { readonly data: CardAuthoringData }) {
  const result = useMemo(() => {
    const parsed = cardAuthoringSchema.safeParse(data);
    if (!parsed.success) return { issues: parsed.issues, siblings: [] } as const;
    return { issues: [], siblings: generateCardBlueprints(parsed.data) } as const;
  }, [data]);
  return (
    <aside className="card-preview-pane" aria-labelledby="card-preview-heading">
      <div>
        <span className="text-xs font-extrabold tracking-wider text-[var(--color-brand)] uppercase">
          Preview
        </span>
        <h2 id="card-preview-heading">Cards from this note</h2>
      </div>
      {result.issues.length > 0 ? (
        <div className="editor-validation" role="status">
          <strong>To preview this card:</strong>
          <ol>
            {friendlyPreviewNeeds(data, result.issues).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ol>
        </div>
      ) : (
        <ol className="sibling-list">
          {result.siblings.map((sibling, index) => (
            <li key={sibling.generationKey}>
              <strong>Card {String(index + 1)}</strong>
              <StudyRendererPreview renderer={sibling.renderer} />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function StudyRendererPreview({
  renderer,
}: {
  readonly renderer: ReturnType<typeof generateCardBlueprints>[number]["renderer"];
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="editor-study-preview">
      <StudyCardRenderer renderer={renderer} revealed={revealed} />
      <Button onClick={() => setRevealed((current) => !current)} size="sm" variant="secondary">
        {revealed ? "Show prompt" : "Reveal answer"}
      </Button>
    </div>
  );
}

function draftFingerprint(data: CardAuthoringData, source: string, tags: string): string {
  return JSON.stringify({ data, source, tags });
}

export function NoteEditor({
  deckId,
  existingNotes = [],
  initialKind = "basic",
  note,
}: {
  readonly deckId: string;
  readonly existingNotes?: readonly NoteSummary[];
  readonly initialKind?: CardTypeCode;
  readonly note?: NoteSummary;
}) {
  const router = useRouter();
  const [data, setData] = useState<CardAuthoringData>(
    note?.authoringData ?? initialData(initialKind),
  );
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [source, setSource] = useState(note?.source ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [validationIssues, setValidationIssues] = useState<readonly ValidationIssue[]>([]);
  const [currentVersion, setCurrentVersion] = useState(note?.version ?? 0);
  const [savedNoteId, setSavedNoteId] = useState(note?.id ?? null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [reloadAfterVersion, setReloadAfterVersion] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const firstRender = useRef(true);
  const pendingMutations = useRef(new PendingContentMutations());
  const latestDraft = useRef(draftFingerprint(data, source, tags));
  latestDraft.current = draftFingerprint(data, source, tags);
  const errors = useMemo(
    () => (validationAttempted ? friendlyFieldErrors(data, validationIssues) : NO_FIELD_ERRORS),
    [data, validationAttempted, validationIssues],
  );
  const duplicateMatches = useMemo(() => {
    const parsed = cardAuthoringSchema.safeParse(data);
    if (!parsed.success) return [];
    const prompt = generateCardBlueprints(parsed.data)[0]
      ?.renderer.accessibility.promptText.normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
    if (!prompt) return [];
    return existingNotes.filter(
      (candidate) =>
        candidate.id !== savedNoteId &&
        candidate.preview.normalize("NFKC").trim().toLocaleLowerCase() === prompt,
    );
  }, [data, existingNotes, savedNoteId]);

  function updateData(nextData: CardAuthoringData): void {
    setData(nextData);
    if (!validationAttempted) return;
    const parsed = cardAuthoringSchema.safeParse(nextData);
    setValidationIssues(parsed.success ? [] : parsed.issues);
    if (parsed.success) setMessage(null);
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setState((current) => (current === "saving" || current === "reloading" ? current : "dirty"));
  }, [data, source, tags]);

  useEffect(() => {
    if (state !== "dirty" || !savedNoteId || deleteOpen) return;
    const timeout = window.setTimeout(() => void save(false), 2_000);
    return () => window.clearTimeout(timeout);
    // Save is deliberately keyed to serialized authoring state and current optimistic version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, source, tags, state, savedNoteId, currentVersion, deleteOpen]);

  useEffect(() => {
    if (reloadAfterVersion === null || !note || note.version < reloadAfterVersion) return;
    firstRender.current = true;
    // A deliberate conflict reload is the one point where fresh server props replace editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(note.authoringData);
    setTags(note.tags.join(", "));
    setSource(note.source);
    setCurrentVersion(note.version);
    setSavedNoteId(note.id);
    setValidationAttempted(false);
    setValidationIssues([]);
    setConflictVersion(null);
    setReloadAfterVersion(null);
    setState("saved");
    setMessage(`Version ${String(note.version)} loaded.`);
  }, [note, reloadAfterVersion]);

  async function save(asNew: boolean) {
    const parsed = cardAuthoringSchema.safeParse(data);
    if (!parsed.success) {
      setValidationAttempted(true);
      setValidationIssues(parsed.issues);
      setState("error");
      setMessage("Complete the highlighted fields before saving.");
      return;
    }
    setValidationAttempted(false);
    setValidationIssues([]);
    const submittedDraft = draftFingerprint(parsed.data, source, tags);
    const creating = asNew || !savedNoteId;
    const command = {
      authoringData: parsed.data,
      expectedVersion: creating ? null : currentVersion,
      noteId: creating ? null : savedNoteId,
      source,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    } as const;
    setState("saving");
    setMessage(null);
    try {
      const result = await performContentMutation<ContentMutationResult<NoteSummary>>({
        body: command,
        fallbackMessage: "The note could not be saved.",
        method: creating ? "POST" : "PATCH",
        operation: `note-editor:${deckId}:${asNew ? "create-copy" : (savedNoteId ?? "create")}`,
        pending: pendingMutations.current,
        url: `/api/content/decks/${deckId}/notes`,
      });
      setCurrentVersion(result.data.version);
      setSavedNoteId(result.data.id);
      setConflictVersion(null);
      setReloadAfterVersion(null);
      const hasNewerDraft = latestDraft.current !== submittedDraft;
      setState(hasNewerDraft ? "dirty" : "saved");
      setMessage(hasNewerDraft ? "Newer changes are waiting to save." : "All changes saved.");
      if (!note || asNew)
        router.replace(`/app/decks/${deckId}/edit?note=${result.data.id}` as Route);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ContentApiRequestError && caught.code === "CONFLICT") {
        setConflictVersion(caught.currentVersion ?? null);
        setState("conflict");
        setMessage(
          `A newer version${caught.currentVersion ? ` (${String(caught.currentVersion)})` : ""} exists. Your draft is still open.`,
        );
      } else {
        setState("error");
        setMessage(caught instanceof Error ? caught.message : "The note could not be saved.");
      }
    }
  }

  async function deleteNote() {
    if (!savedNoteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await performContentMutation<{ readonly data: { readonly id: string } }>({
        body: { expectedVersion: currentVersion },
        fallbackMessage: "The note could not be deleted.",
        method: "DELETE",
        operation: `note-editor:${deckId}:${savedNoteId}:delete`,
        pending: pendingMutations.current,
        url: `/api/content/decks/${encodeURIComponent(deckId)}/notes/${encodeURIComponent(savedNoteId)}`,
      });
      setDeleteOpen(false);
      router.replace(`/app/decks/${deckId}/edit` as Route);
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof ContentApiRequestError && caught.code === "CONFLICT"
          ? conflictRecoveryMessage(caught, "This note")
          : caught instanceof Error
            ? caught.message
            : "The note could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const descriptor = CARD_TYPE_BY_CODE[data.kind];
  return (
    <div className="note-editor-shell" data-preview-open={previewOpen}>
      <header className="note-editor-topbar">
        <a className="note-editor-back" href={`/app/decks/${deckId}`}>
          <ArrowLeftIcon aria-hidden="true" />
          Back to deck
        </a>
        <div className="note-editor-context">
          <Badge tone="info">{descriptor.shortLabel}</Badge>
          <strong>{savedNoteId ? "Edit note" : "New note"}</strong>
        </div>
        <div className="autosave-state" data-state={state} aria-live="polite">
          <span aria-hidden="true" />
          {state === "saving"
            ? "Saving…"
            : state === "reloading"
              ? "Loading…"
              : state === "dirty"
                ? "Unsaved changes"
                : state === "saved"
                  ? "Saved"
                  : state === "conflict"
                    ? "Version conflict"
                    : state === "error"
                      ? "Needs attention"
                      : "Ready"}
        </div>
        <div className="note-editor-topbar__actions">
          <Button
            aria-controls="note-card-preview"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
            variant="secondary"
          >
            Preview
          </Button>
          <Button
            aria-label="Save note"
            loading={state === "saving"}
            onClick={() => void save(false)}
          >
            Save
          </Button>
        </div>
      </header>
      <div className="note-editor-layout">
        <section className="note-editor-main">
          <header className="editor-heading">
            <div>
              <h1>{savedNoteId ? "Edit note" : "New note"}</h1>
              <p>{descriptor.description}</p>
            </div>
          </header>
          <FormField
            label="Card type"
            description={
              savedNoteId
                ? "Card type can’t be changed after saving. Create a new note to use another type."
                : descriptor.editorHint
            }
          >
            <Select
              disabled={savedNoteId !== null}
              value={data.kind}
              onValueChange={(value) => updateData(initialData(value as CardTypeCode))}
              options={CARD_TYPE_DESCRIPTORS.map((type) => ({
                label: type.label,
                value: type.code,
              }))}
            />
          </FormField>
          {errors._form && (
            <p className="editor-message editor-message--error" role="alert">
              {errors._form}
            </p>
          )}
          <CardFields data={data} errors={errors} onChange={updateData} />
          {duplicateMatches.length > 0 && (
            <aside className="editor-message" role="status">
              <strong>Possible duplicate note</strong>
              <p>
                {duplicateMatches.length === 1
                  ? "Another note in this deck has the same question."
                  : `${String(duplicateMatches.length)} notes in this deck have the same question.`}{" "}
                You can still save when the answer or context is intentionally different.
              </p>
            </aside>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Tags" description="Comma separated. Tags are normalized when saved.">
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="biology, chapter-4"
              />
            </FormField>
            <FormField
              label="Source or citation note"
              description="Optional provenance for this note."
            >
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Textbook, lecture, URL, or page"
              />
            </FormField>
          </div>
          {message && (
            <p
              className={
                state === "error" || state === "conflict"
                  ? "editor-message editor-message--error"
                  : "editor-message"
              }
              role="status"
            >
              {message}
            </p>
          )}
          <div className="editor-actions">
            <Button
              onClick={() => router.push(`/app/decks/${deckId}/cards` as Route)}
              variant="secondary"
            >
              Generated cards
            </Button>
            {savedNoteId && (
              <Button
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                variant="danger"
              >
                Delete note
              </Button>
            )}
          </div>
        </section>
        <div className="note-editor-preview" id="note-card-preview">
          <SiblingPreview data={data} />
        </div>
      </div>
      <Dialog
        open={state === "conflict"}
        onOpenChange={(open) => {
          if (!open) {
            setConflictVersion(null);
            setState("dirty");
          }
        }}
        title="This note changed elsewhere"
        description="Your unsaved draft is preserved in this tab. Choose how to continue."
        footer={
          <>
            <Button
              onClick={() => {
                setReloadAfterVersion(conflictVersion ?? currentVersion + 1);
                setState("reloading");
                setMessage("Loading the current stored version…");
                router.refresh();
              }}
              variant="secondary"
            >
              Reload current version
            </Button>
            <Button onClick={() => void save(true)}>Save draft as a new note</Button>
          </>
        }
      >
        <p>
          Reload to inspect the latest stored version, or save this draft as a separate note so no
          author’s work is overwritten.
        </p>
      </Dialog>
      <Dialog
        description="The note and its cards will be removed from this deck."
        footer={
          <>
            <Button disabled={deleting} onClick={() => setDeleteOpen(false)} variant="secondary">
              Keep note
            </Button>
            <Button loading={deleting} onClick={() => void deleteNote()} variant="danger">
              Delete this note
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
        open={deleteOpen}
        title="Delete this note?"
      >
        <p>Any unsaved changes in this editor will be discarded.</p>
        {deleteError && (
          <p className="editor-message editor-message--error" role="alert">
            {deleteError}
          </p>
        )}
      </Dialog>
    </div>
  );
}
