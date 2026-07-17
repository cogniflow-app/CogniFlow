import {
  CARD_SCHEMA_VERSION,
  CURRENT_RICH_DOCUMENT_VERSION,
  type CardAuthoringData,
  type RichDocument,
} from "../src/index";

export function rich(text: string): RichDocument {
  return {
    type: "doc",
    schemaVersion: CURRENT_RICH_DOCUMENT_VERSION,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const rectangle = {
  kind: "rectangle" as const,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
};

export const cardFixtures = {
  basic: {
    kind: "basic",
    schemaVersion: CARD_SCHEMA_VERSION,
    front: rich("Capital of France"),
    back: rich("Paris"),
  },
  basic_reversed: {
    kind: "basic_reversed",
    schemaVersion: CARD_SCHEMA_VERSION,
    front: rich("bonjour"),
    back: rich("hello"),
  },
  optional_reversed: {
    kind: "optional_reversed",
    schemaVersion: CARD_SCHEMA_VERSION,
    front: rich("Na"),
    back: rich("sodium"),
    reverseEnabled: true,
  },
  bidirectional: {
    kind: "bidirectional",
    schemaVersion: CARD_SCHEMA_VERSION,
    sideA: rich("mitosis"),
    sideB: rich("cell division"),
  },
  custom: {
    kind: "custom",
    schemaVersion: CARD_SCHEMA_VERSION,
    fields: { Term: rich("osmosis"), Definition: rich("movement across a membrane") },
    templates: [
      {
        semanticKey: "definition",
        name: "Definition",
        frontTemplate: "<p>{{Term}}</p>",
        backTemplate: "{{front}}<hr><p>{{Definition}}</p>",
        stylingCss: ".answer { color: var(--lumen-text); }",
      },
    ],
  },
  typed_answer: {
    kind: "typed_answer",
    schemaVersion: CARD_SCHEMA_VERSION,
    prompt: rich("Chemical symbol for gold"),
    answer: rich("Au"),
    acceptedAnswers: ["Au"],
    caseSensitive: true,
    language: "en",
  },
  cloze: {
    kind: "cloze",
    schemaVersion: CARD_SCHEMA_VERSION,
    text: rich("Water boils at 100 C."),
    clozes: [
      { semanticKey: "temperature", ranges: [{ from: 15, to: 20 }], hint: "At sea level" },
      { semanticKey: "substance", ranges: [{ from: 0, to: 5 }] },
    ],
  },
  image_occlusion: {
    kind: "image_occlusion",
    schemaVersion: CARD_SCHEMA_VERSION,
    imageAssetId: "asset-anatomy",
    imageAlt: "A labeled heart diagram",
    mode: "hide_one_reveal_others",
    occlusions: [
      {
        semanticKey: "left-atrium-mask",
        groupKey: "left-atrium",
        shape: rectangle,
        label: "Left atrium",
        altText: "Upper-right chamber from the viewer perspective",
      },
      {
        semanticKey: "left-atrium-label-mask",
        groupKey: "left-atrium",
        shape: { kind: "ellipse", centerX: 0.6, centerY: 0.4, radiusX: 0.1, radiusY: 0.1 },
        label: "Left atrium label",
      },
    ],
  },
  multiple_choice: {
    kind: "multiple_choice",
    schemaVersion: CARD_SCHEMA_VERSION,
    prompt: rich("Which planet is known as the Red Planet?"),
    choices: [
      { semanticKey: "mars", content: rich("Mars"), isCorrect: true, position: 0 },
      { semanticKey: "venus", content: rich("Venus"), isCorrect: false, position: 1 },
    ],
  },
  select_all: {
    kind: "select_all",
    schemaVersion: CARD_SCHEMA_VERSION,
    prompt: rich("Select prime numbers"),
    choices: [
      { semanticKey: "two", content: rich("2"), isCorrect: true, position: 0 },
      { semanticKey: "three", content: rich("3"), isCorrect: true, position: 1 },
      { semanticKey: "four", content: rich("4"), isCorrect: false, position: 2 },
    ],
  },
  true_false: {
    kind: "true_false",
    schemaVersion: CARD_SCHEMA_VERSION,
    statement: rich("The Earth orbits the Sun."),
    answer: true,
    explanation: rich("One orbit takes about one year."),
  },
  ordering: {
    kind: "ordering",
    schemaVersion: CARD_SCHEMA_VERSION,
    prompt: rich("Order the phases"),
    orderingItems: [
      { semanticKey: "solid", content: rich("Solid"), position: 0 },
      { semanticKey: "liquid", content: rich("Liquid"), position: 1 },
      { semanticKey: "gas", content: rich("Gas"), position: 2 },
    ],
  },
  list_answer: {
    kind: "list_answer",
    schemaVersion: CARD_SCHEMA_VERSION,
    prompt: rich("Name the primary colors of light"),
    listItems: [
      { semanticKey: "red", answer: "red", aliases: [], required: true, position: 0 },
      { semanticKey: "green", answer: "green", aliases: [], required: true, position: 1 },
      { semanticKey: "blue", answer: "blue", aliases: [], required: true, position: 2 },
    ],
    orderMatters: false,
  },
  diagram: {
    kind: "diagram",
    schemaVersion: CARD_SCHEMA_VERSION,
    imageAssetId: "asset-cell",
    imageAlt: "An animal cell diagram",
    hotspots: [
      {
        semanticKey: "nucleus",
        shape: rectangle,
        label: "Nucleus",
        altText: "Large round structure near the center of the cell",
        aliases: ["cell nucleus"],
        promptDirection: "both",
      },
    ],
  },
  audio_prompt: {
    kind: "audio_prompt",
    schemaVersion: CARD_SCHEMA_VERSION,
    audioPrompt: {
      assetId: "asset-audio",
      transcript: "What is the capital of Japan?",
      answer: rich("Tokyo"),
    },
    playbackSpeed: 1,
  },
  pronunciation: {
    kind: "pronunciation",
    schemaVersion: CARD_SCHEMA_VERSION,
    pronunciationPrompt: {
      text: "biblioteca",
      language: "es",
      ttsAllowed: true,
      fallbackAnswer: "biblioteca",
    },
    selfReview: true,
  },
  drawing: {
    kind: "drawing",
    schemaVersion: CARD_SCHEMA_VERSION,
    prompt: rich("Draw a right triangle"),
    drawingLayers: [
      {
        semanticKey: "guide",
        strokes: [
          {
            semanticKey: "stroke-1",
            color: "#222222",
            width: 4,
            points: [
              { x: 0.1, y: 0.1, pressure: 0.5, timeOffsetMs: 0 },
              { x: 0.8, y: 0.8, pressure: 0.5, timeOffsetMs: 100 },
            ],
          },
        ],
        opacity: 0.5,
        position: 0,
      },
    ],
    fallbackAnswer: "A triangle with one 90-degree angle",
    evaluation: "self_review",
  },
} satisfies Readonly<Record<CardAuthoringData["kind"], CardAuthoringData>>;
