import { customFieldPlainText, type CardAuthoringData } from "./card-types";
import { generateCardBlueprints } from "./card-generation";
import { extractRichDocumentText } from "./rich-document";
import { stableJson } from "./validation";

export const contentChangeImpacts = [
  "none",
  "cosmetic",
  "metadata",
  "prompt_semantic",
  "answer_semantic",
  "prompt_and_answer_semantic",
  "generation_structure",
] as const;

export type ContentChangeImpact = (typeof contentChangeImpacts)[number];
export type FutureScheduleChoice = "preserve" | "relearn" | "reset";

export interface ContentChangeClassification {
  readonly impact: ContentChangeImpact;
  readonly material: boolean;
  readonly defaultScheduleChoice: FutureScheduleChoice | "learner_choice";
  readonly allowedScheduleChoices: readonly FutureScheduleChoice[];
  readonly affectedGenerationKeys: readonly string[];
  readonly explanation: string;
}

interface SemanticProjection {
  readonly prompt: unknown;
  readonly answer: unknown;
  readonly metadata: unknown;
}

function text(document: Parameters<typeof extractRichDocumentText>[0]): string {
  return extractRichDocumentText(document).normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function semanticProjection(card: CardAuthoringData): SemanticProjection {
  switch (card.kind) {
    case "basic":
    case "basic_reversed":
    case "optional_reversed":
      return {
        prompt: text(card.front),
        answer: text(card.back),
        metadata: card.kind === "optional_reversed" ? { reverseEnabled: card.reverseEnabled } : {},
      };
    case "bidirectional":
      return { prompt: text(card.sideA), answer: text(card.sideB), metadata: {} };
    case "custom":
      return {
        prompt: Object.fromEntries(
          Object.entries(card.fields).map(([key, value]) => [key, customFieldPlainText(value)]),
        ),
        answer: card.templates.map((template) => ({
          semanticKey: template.semanticKey,
          frontTemplate: template.frontTemplate,
          backTemplate: template.backTemplate,
          generationCondition: template.generationCondition ?? null,
        })),
        metadata: card.templates.map((template) => ({
          semanticKey: template.semanticKey,
          name: template.name,
          stylingCss: template.stylingCss ?? "",
        })),
      };
    case "typed_answer":
      return {
        prompt: text(card.prompt),
        answer: {
          answer: text(card.answer),
          acceptedAnswers: card.acceptedAnswers,
          caseSensitive: card.caseSensitive,
        },
        metadata: { language: card.language ?? "" },
      };
    case "cloze": {
      const plain = text(card.text);
      return {
        prompt: plain,
        answer: card.clozes.map((cloze) => ({
          semanticKey: cloze.semanticKey,
          ranges: cloze.ranges,
          values: cloze.ranges.map((range) => plain.slice(range.from, range.to)),
        })),
        metadata: card.clozes.map((cloze) => ({
          semanticKey: cloze.semanticKey,
          hint: cloze.hint ?? "",
        })),
      };
    }
    case "image_occlusion":
      return {
        prompt: { imageAssetId: card.imageAssetId, imageAlt: card.imageAlt },
        answer: card.occlusions.map((region) => ({
          semanticKey: region.semanticKey,
          groupKey: region.groupKey,
          shape: region.shape,
          label: region.label,
        })),
        metadata: {
          mode: card.mode,
          altText: card.occlusions.map((region) => region.altText ?? ""),
        },
      };
    case "multiple_choice":
    case "select_all":
      return {
        prompt: text(card.prompt),
        answer: card.choices.map((choice) => ({
          semanticKey: choice.semanticKey,
          content: text(choice.content),
          isCorrect: choice.isCorrect,
          position: choice.position,
        })),
        metadata: card.choices.map((choice) => ({
          semanticKey: choice.semanticKey,
          feedback: choice.feedback ? text(choice.feedback) : "",
        })),
      };
    case "true_false":
      return {
        prompt: text(card.statement),
        answer: card.answer,
        metadata: card.explanation ? text(card.explanation) : "",
      };
    case "ordering":
      return {
        prompt: text(card.prompt),
        answer: card.orderingItems.map((item) => ({
          semanticKey: item.semanticKey,
          content: text(item.content),
          position: item.position,
        })),
        metadata: {},
      };
    case "list_answer":
      return {
        prompt: text(card.prompt),
        answer: {
          orderMatters: card.orderMatters,
          items: card.listItems.map((item) => ({
            semanticKey: item.semanticKey,
            answer: item.answer,
            aliases: item.aliases,
            required: item.required,
            position: item.position,
          })),
        },
        metadata: {},
      };
    case "diagram":
      return {
        prompt: { imageAssetId: card.imageAssetId, imageAlt: card.imageAlt },
        answer: card.hotspots.map((hotspot) => ({
          semanticKey: hotspot.semanticKey,
          shape: hotspot.shape,
          label: hotspot.label,
          aliases: hotspot.aliases,
          promptDirection: hotspot.promptDirection,
        })),
        metadata: card.hotspots.map((hotspot) => ({
          semanticKey: hotspot.semanticKey,
          altText: hotspot.altText,
        })),
      };
    case "audio_prompt":
      return {
        prompt: {
          assetId: card.audioPrompt.assetId,
          transcript: card.audioPrompt.transcript,
        },
        answer: text(card.audioPrompt.answer),
        metadata: { playbackSpeed: card.playbackSpeed },
      };
    case "pronunciation":
      return {
        prompt: {
          text: card.pronunciationPrompt.text,
          language: card.pronunciationPrompt.language,
        },
        answer: card.pronunciationPrompt.fallbackAnswer ?? "self_review",
        metadata: {
          referenceAssetId: card.pronunciationPrompt.referenceAssetId ?? "",
          ttsAllowed: card.pronunciationPrompt.ttsAllowed,
        },
      };
    case "drawing":
      return {
        prompt: text(card.prompt),
        answer: card.fallbackAnswer,
        metadata: card.drawingLayers,
      };
  }
}

function result(
  impact: ContentChangeImpact,
  affectedGenerationKeys: readonly string[],
): ContentChangeClassification {
  const preserve = ["none", "cosmetic", "metadata"].includes(impact);
  const explanations: Readonly<Record<ContentChangeImpact, string>> = {
    none: "No content changed.",
    cosmetic: "Only formatting changed; semantic text and generated siblings are unchanged.",
    metadata: "Only hints, sources, styling, or presentation metadata changed.",
    prompt_semantic:
      "Prompt meaning changed and future scheduling must ask how to treat prior memory.",
    answer_semantic:
      "Expected answer meaning changed and future scheduling must ask how to treat prior memory.",
    prompt_and_answer_semantic: "Both prompt and answer meaning changed.",
    generation_structure:
      "The set of semantic generated siblings changed; obsolete cards must be deactivated.",
  };
  return Object.freeze({
    impact,
    material: !preserve,
    defaultScheduleChoice: preserve ? "preserve" : "learner_choice",
    allowedScheduleChoices: Object.freeze(["preserve", "relearn", "reset"] as const),
    affectedGenerationKeys: Object.freeze([...affectedGenerationKeys].sort()),
    explanation: explanations[impact],
  });
}

/** Classifies edits without mutating or assuming the existence of future SRS state. */
export function classifyContentChange(
  previous: CardAuthoringData,
  next: CardAuthoringData,
): ContentChangeClassification {
  if (stableJson(previous) === stableJson(next)) return result("none", []);
  const previousCards = generateCardBlueprints(previous);
  const nextCards = generateCardBlueprints(next);
  const previousKeys = previousCards.map((card) => card.generationKey).sort();
  const nextKeys = nextCards.map((card) => card.generationKey).sort();
  const allKeys = [...new Set([...previousKeys, ...nextKeys])];
  if (stableJson(previousKeys) !== stableJson(nextKeys)) {
    return result("generation_structure", allKeys);
  }

  const before = semanticProjection(previous);
  const after = semanticProjection(next);
  const promptChanged = stableJson(before.prompt) !== stableJson(after.prompt);
  const answerChanged = stableJson(before.answer) !== stableJson(after.answer);
  if (promptChanged && answerChanged) return result("prompt_and_answer_semantic", allKeys);
  if (answerChanged) return result("answer_semantic", allKeys);
  if (promptChanged) return result("prompt_semantic", allKeys);
  if (stableJson(before.metadata) !== stableJson(after.metadata))
    return result("metadata", allKeys);
  return result("cosmetic", allKeys);
}
