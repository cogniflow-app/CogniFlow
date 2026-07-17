import type {
  CardAuthoringData,
  CardKind,
  ChoiceDefinition,
  ClozeDefinition,
  CustomTemplateDefinition,
  CustomFieldValue,
  DrawingReferenceLayer,
  ListAnswerItem,
  OrderingItem,
} from "./card-types";
import { customFieldPlainText } from "./card-types";
import type { DiagramHotspot, ImageOcclusionRegion } from "./geometry";
import { extractRichDocumentText, type RichDocument } from "./rich-document";
import { parseTemplate } from "./template";

export const STUDY_RENDERER_SCHEMA_VERSION = 1 as const;

export interface StudyAccessibilityContract {
  readonly promptText: string;
  readonly instructions: string;
  readonly nonvisualAlternative: string;
}

interface StudyRendererBase<TKind extends CardKind> {
  readonly schemaVersion: typeof STUDY_RENDERER_SCHEMA_VERSION;
  readonly kind: TKind;
  readonly semanticKey: string;
  readonly generationKey: string;
  readonly accessibility: StudyAccessibilityContract;
}

export interface BasicStudyRenderer extends StudyRendererBase<"basic"> {
  readonly direction: "front_to_back";
  readonly prompt: RichDocument;
  readonly answer: RichDocument;
}

export interface BasicReversedStudyRenderer extends StudyRendererBase<"basic_reversed"> {
  readonly direction: "front_to_back" | "back_to_front";
  readonly prompt: RichDocument;
  readonly answer: RichDocument;
}

export interface OptionalReversedStudyRenderer extends StudyRendererBase<"optional_reversed"> {
  readonly direction: "front_to_back" | "back_to_front";
  readonly prompt: RichDocument;
  readonly answer: RichDocument;
}

export interface BidirectionalStudyRenderer extends StudyRendererBase<"bidirectional"> {
  readonly direction: "a_to_b" | "b_to_a";
  readonly prompt: RichDocument;
  readonly answer: RichDocument;
}

export interface CustomStudyRenderer extends StudyRendererBase<"custom"> {
  readonly fields: Readonly<Record<string, CustomFieldValue>>;
  readonly template: CustomTemplateDefinition;
}

export interface TypedAnswerStudyRenderer extends StudyRendererBase<"typed_answer"> {
  readonly prompt: RichDocument;
  readonly answer: RichDocument;
  readonly acceptedAnswers: readonly string[];
  readonly caseSensitive: boolean;
  readonly language?: string;
}

export interface ClozeStudyRenderer extends StudyRendererBase<"cloze"> {
  readonly document: RichDocument;
  readonly activeCloze: ClozeDefinition;
}

export interface ImageOcclusionStudyRenderer extends StudyRendererBase<"image_occlusion"> {
  readonly imageAssetId: string;
  readonly imageAlt: string;
  readonly mode: "hide_one_reveal_others" | "hide_all_reveal_one";
  readonly activeGroupKey: string;
  readonly regions: readonly ImageOcclusionRegion[];
}

export interface ChoiceStudyRendererBase<
  TKind extends "multiple_choice" | "select_all",
> extends StudyRendererBase<TKind> {
  readonly prompt: RichDocument;
  readonly choices: readonly ChoiceDefinition[];
}

export type MultipleChoiceStudyRenderer = ChoiceStudyRendererBase<"multiple_choice">;
export type SelectAllStudyRenderer = ChoiceStudyRendererBase<"select_all">;

export interface TrueFalseStudyRenderer extends StudyRendererBase<"true_false"> {
  readonly statement: RichDocument;
  readonly answer: boolean;
  readonly explanation?: RichDocument;
}

export interface OrderingStudyRenderer extends StudyRendererBase<"ordering"> {
  readonly prompt: RichDocument;
  readonly items: readonly OrderingItem[];
  readonly alternativeControls: readonly ["move_up", "move_down"];
}

export interface ListAnswerStudyRenderer extends StudyRendererBase<"list_answer"> {
  readonly prompt: RichDocument;
  readonly items: readonly ListAnswerItem[];
  readonly orderMatters: boolean;
}

export interface DiagramStudyRenderer extends StudyRendererBase<"diagram"> {
  readonly imageAssetId: string;
  readonly imageAlt: string;
  readonly hotspot: DiagramHotspot;
  readonly direction: "label_to_region" | "region_to_label";
}

export interface AudioPromptStudyRenderer extends StudyRendererBase<"audio_prompt"> {
  readonly assetId: string;
  readonly transcript: string;
  readonly answer: RichDocument;
  readonly playbackSpeed: number;
}

export interface PronunciationStudyRenderer extends StudyRendererBase<"pronunciation"> {
  readonly text: string;
  readonly language: string;
  readonly referenceAssetId?: string;
  readonly ttsAllowed: boolean;
  readonly fallbackAnswer?: string;
  readonly recordingPolicy: "explicit_local_action";
  readonly evaluation: "self_review";
}

export interface DrawingStudyRenderer extends StudyRendererBase<"drawing"> {
  readonly prompt: RichDocument;
  readonly referenceLayers: readonly DrawingReferenceLayer[];
  readonly fallbackAnswer: string;
  readonly evaluation: "self_review";
  readonly persistencePolicy: "explicit_save_only";
}

export type StudyRendererContract =
  | BasicStudyRenderer
  | BasicReversedStudyRenderer
  | OptionalReversedStudyRenderer
  | BidirectionalStudyRenderer
  | CustomStudyRenderer
  | TypedAnswerStudyRenderer
  | ClozeStudyRenderer
  | ImageOcclusionStudyRenderer
  | MultipleChoiceStudyRenderer
  | SelectAllStudyRenderer
  | TrueFalseStudyRenderer
  | OrderingStudyRenderer
  | ListAnswerStudyRenderer
  | DiagramStudyRenderer
  | AudioPromptStudyRenderer
  | PronunciationStudyRenderer
  | DrawingStudyRenderer;

function accessibility(
  promptText: string,
  instructions: string,
  nonvisualAlternative: string,
): StudyAccessibilityContract {
  return Object.freeze({ promptText, instructions, nonvisualAlternative });
}

function base<TKind extends CardKind>(
  kind: TKind,
  semanticKey: string,
  generationKey: string,
  contract: StudyAccessibilityContract,
): StudyRendererBase<TKind> {
  return Object.freeze({
    schemaVersion: STUDY_RENDERER_SCHEMA_VERSION,
    kind,
    semanticKey,
    generationKey,
    accessibility: contract,
  });
}

function invariant(message: string): never {
  throw new Error(`Invalid generated-card semantic identity: ${message}`);
}

export function createStudyRendererContract(
  card: CardAuthoringData,
  semanticKey: string,
  generationKey: string,
): StudyRendererContract {
  switch (card.kind) {
    case "basic":
      if (semanticKey !== "forward") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.front),
            "Recall the answer, then reveal the back.",
            "The complete prompt and answer are available as structured text.",
          ),
        ),
        direction: "front_to_back",
        prompt: card.front,
        answer: card.back,
      });
    case "basic_reversed":
    case "optional_reversed": {
      const direction =
        semanticKey === "forward"
          ? "front_to_back"
          : semanticKey === "reverse"
            ? "back_to_front"
            : undefined;
      if (!direction) return invariant(semanticKey);
      const prompt = direction === "front_to_back" ? card.front : card.back;
      const answer = direction === "front_to_back" ? card.back : card.front;
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(prompt),
            "Recall the paired side, then reveal it.",
            "The complete prompt and answer are available as structured text.",
          ),
        ),
        direction,
        prompt,
        answer,
      });
    }
    case "bidirectional": {
      const direction =
        semanticKey === "a_to_b" ? "a_to_b" : semanticKey === "b_to_a" ? "b_to_a" : undefined;
      if (!direction) return invariant(semanticKey);
      const prompt = direction === "a_to_b" ? card.sideA : card.sideB;
      const answer = direction === "a_to_b" ? card.sideB : card.sideA;
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(prompt),
            "Recall the concept in the opposite direction.",
            "Both sides are available as structured text.",
          ),
        ),
        direction,
        prompt,
        answer,
      });
    }
    case "custom": {
      const template = card.templates.find((candidate) => candidate.semanticKey === semanticKey);
      if (!template) return invariant(semanticKey);
      const referencedFields = new Set([
        ...parseTemplate(template.frontTemplate).referencedFields,
        ...parseTemplate(template.backTemplate).referencedFields,
      ]);
      const fields = Object.freeze(
        Object.fromEntries(
          Object.entries(card.fields).filter(([field]) => referencedFields.has(field)),
        ),
      );
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            Object.values(fields).map(customFieldPlainText).join(" "),
            "Follow the custom card's labeled prompt.",
            "Every template field remains available as structured text.",
          ),
        ),
        fields,
        template,
      });
    }
    case "typed_answer":
      if (semanticKey !== "typed") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.prompt),
            "Enter the answer in the labeled text field.",
            "A standard keyboard text field is the primary interaction.",
          ),
        ),
        prompt: card.prompt,
        answer: card.answer,
        acceptedAnswers: card.acceptedAnswers,
        caseSensitive: card.caseSensitive,
        ...(card.language ? { language: card.language } : {}),
      });
    case "cloze": {
      const activeCloze = card.clozes.find((candidate) => candidate.semanticKey === semanticKey);
      if (!activeCloze) return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.text),
            "Recall the text hidden by each announced blank.",
            "Blank positions and optional hints are exposed in reading order.",
          ),
        ),
        document: card.text,
        activeCloze,
      });
    }
    case "image_occlusion": {
      const activeRegions = card.occlusions.filter((region) => region.groupKey === semanticKey);
      if (activeRegions.length === 0) return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            card.imageAlt,
            "Recall the masked image region.",
            `Use the region list: ${activeRegions.map((region) => region.altText ?? region.label).join("; ")}`,
          ),
        ),
        imageAssetId: card.imageAssetId,
        imageAlt: card.imageAlt,
        mode: card.mode,
        activeGroupKey: semanticKey,
        // Every region is required to implement hide-all/reveal-one correctly. The
        // active group remains explicit so consumers never infer it from array order.
        regions: Object.freeze(card.occlusions),
      });
    }
    case "multiple_choice":
    case "select_all":
      if (semanticKey !== "choice") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.prompt),
            card.kind === "multiple_choice" ? "Choose one option." : "Choose every correct option.",
            card.kind === "multiple_choice"
              ? "Options use a radio group."
              : "Options use a checkbox group.",
          ),
        ),
        prompt: card.prompt,
        choices: card.choices,
      });
    case "true_false":
      if (semanticKey !== "boolean") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.statement),
            "Choose whether the statement is true or false.",
            "True and False are exposed as a two-option radio group.",
          ),
        ),
        statement: card.statement,
        answer: card.answer,
        ...(card.explanation ? { explanation: card.explanation } : {}),
      });
    case "ordering":
      if (semanticKey !== "sequence") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.prompt),
            "Arrange the items into the correct order.",
            "Each item has move-up and move-down buttons; dragging is optional.",
          ),
        ),
        prompt: card.prompt,
        items: card.orderingItems,
        alternativeControls: ["move_up", "move_down"] as const,
      });
    case "list_answer":
      if (semanticKey !== "list") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.prompt),
            "Enter the requested list answers.",
            "Use one labeled text row per answer.",
          ),
        ),
        prompt: card.prompt,
        items: card.listItems,
        orderMatters: card.orderMatters,
      });
    case "diagram": {
      const separator = semanticKey.lastIndexOf(":");
      const hotspotKey = semanticKey.slice(0, separator);
      const direction = semanticKey.slice(separator + 1);
      const hotspot = card.hotspots.find((candidate) => candidate.semanticKey === hotspotKey);
      if (!hotspot || (direction !== "label_to_region" && direction !== "region_to_label")) {
        return invariant(semanticKey);
      }
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            card.imageAlt,
            direction === "region_to_label"
              ? "Name the highlighted region."
              : "Locate the named region.",
            direction === "region_to_label"
              ? `Highlighted region description: ${hotspot.altText}`
              : `Region description: ${hotspot.altText}. Accepted label and aliases: ${[hotspot.label, ...hotspot.aliases].join("; ")}`,
          ),
        ),
        imageAssetId: card.imageAssetId,
        imageAlt: card.imageAlt,
        hotspot,
        direction,
      });
    }
    case "audio_prompt":
      if (semanticKey !== "audio") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            card.audioPrompt.transcript,
            "Play the audio and recall the answer.",
            "Read the complete transcript when audio is unavailable.",
          ),
        ),
        assetId: card.audioPrompt.assetId,
        transcript: card.audioPrompt.transcript,
        answer: card.audioPrompt.answer,
        playbackSpeed: card.playbackSpeed,
      });
    case "pronunciation":
      if (semanticKey !== "pronunciation") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            card.pronunciationPrompt.text,
            "Speak the prompt, compare with the reference, and self-review.",
            "A typed fallback is available; recording occurs only after explicit action.",
          ),
        ),
        text: card.pronunciationPrompt.text,
        language: card.pronunciationPrompt.language,
        ...(card.pronunciationPrompt.referenceAssetId
          ? { referenceAssetId: card.pronunciationPrompt.referenceAssetId }
          : {}),
        ttsAllowed: card.pronunciationPrompt.ttsAllowed,
        ...(card.pronunciationPrompt.fallbackAnswer
          ? { fallbackAnswer: card.pronunciationPrompt.fallbackAnswer }
          : {}),
        recordingPolicy: "explicit_local_action",
        evaluation: "self_review",
      });
    case "drawing":
      if (semanticKey !== "drawing") return invariant(semanticKey);
      return Object.freeze({
        ...base(
          card.kind,
          semanticKey,
          generationKey,
          accessibility(
            extractRichDocumentText(card.prompt),
            "Draw or handwrite the response, then self-review.",
            "Enter the answer in the typed nonvisual alternative.",
          ),
        ),
        prompt: card.prompt,
        referenceLayers: card.drawingLayers,
        fallbackAnswer: card.fallbackAnswer,
        evaluation: "self_review",
        persistencePolicy: "explicit_save_only",
      });
  }
}
