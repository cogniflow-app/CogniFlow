import type { CardTypeCode } from "./view-models";

export interface CardTypeDescriptor {
  readonly code: CardTypeCode;
  readonly description: string;
  readonly editorHint: string;
  readonly generatedCards: string;
  readonly label: string;
  readonly shortLabel: string;
}

export const CARD_TYPE_DESCRIPTORS: readonly CardTypeDescriptor[] = [
  {
    code: "basic",
    description: "A direct prompt on the front and answer on the back.",
    editorHint: "Write one focused question and one complete answer.",
    generatedCards: "Creates one card",
    label: "Basic front → back",
    shortLabel: "Basic",
  },
  {
    code: "basic_reversed",
    description: "Creates independent cards in both directions.",
    editorHint: "Use two sides that each make sense as a prompt.",
    generatedCards: "Creates two cards",
    label: "Basic plus reversed",
    shortLabel: "Reversed",
  },
  {
    code: "optional_reversed",
    description: "Optionally creates a second card in the reverse direction.",
    editorHint: "Choose whether this individual note benefits from reverse recall.",
    generatedCards: "Creates one or two cards",
    label: "Optional reversed",
    shortLabel: "Optional reverse",
  },
  {
    code: "bidirectional",
    description: "Two equally important concepts, each recalled from the other.",
    editorHint: "Name both concepts without assuming a primary side.",
    generatedCards: "Creates two cards",
    label: "True bidirectional",
    shortLabel: "Bidirectional",
  },
  {
    code: "custom",
    description: "Build a card from multiple fields and reusable layouts.",
    editorHint: "Define fields, then compose them with the safe template language.",
    generatedCards: "Creates one card per layout",
    label: "Custom multi-field",
    shortLabel: "Custom",
  },
  {
    code: "typed_answer",
    description: "A prompt with a typed answer field and explicit accepted answer.",
    editorHint: "Keep the expected answer short enough to type accurately.",
    generatedCards: "Creates one card",
    label: "Typed answer",
    shortLabel: "Typed",
  },
  {
    code: "cloze",
    description: "Hide parts of a passage and recall each numbered group.",
    editorHint: "Mark deletions like {{c1::mitochondria}} and reuse a number to group blanks.",
    generatedCards: "Creates one card per blank group",
    label: "Cloze deletion",
    shortLabel: "Cloze",
  },
  {
    code: "image_occlusion",
    description: "Hide parts of an image and recall each label.",
    editorHint: "Upload an image, add masks, and give every region a text alternative.",
    generatedCards: "Creates one card per mask group",
    label: "Image occlusion",
    shortLabel: "Occlusion",
  },
  {
    code: "multiple_choice",
    description: "One correct choice with authored distractors and explanations.",
    editorHint: "Use plausible choices and explain why the correct one is right.",
    generatedCards: "Creates one card",
    label: "Multiple choice",
    shortLabel: "Multiple choice",
  },
  {
    code: "select_all",
    description: "A question with more than one correct authored choice.",
    editorHint: "Mark every correct choice and avoid overlapping choices.",
    generatedCards: "Creates one card",
    label: "Select all that apply",
    shortLabel: "Select all",
  },
  {
    code: "true_false",
    description: "A claim with an explicit truth value and optional explanation.",
    editorHint: "Write an unambiguous statement rather than a trick question.",
    generatedCards: "Creates one card",
    label: "True or false",
    shortLabel: "True/false",
  },
  {
    code: "ordering",
    description: "Arrange authored items into the correct sequence.",
    editorHint: "Add at least two distinct steps and order them with buttons or drag and drop.",
    generatedCards: "Creates one card",
    label: "Ordering / sequencing",
    shortLabel: "Ordering",
  },
  {
    code: "list_answer",
    description: "Recall a bounded set or ordered list of accepted items.",
    editorHint: "Choose whether order matters and add aliases only when genuinely equivalent.",
    generatedCards: "Creates one card",
    label: "List answer",
    shortLabel: "List",
  },
  {
    code: "diagram",
    description: "Label accessible image hotspots in either prompt direction.",
    editorHint: "Give every hotspot a label, aliases, and a nonvisual description.",
    generatedCards: "Creates one card per hotspot or direction",
    label: "Diagram labels / hotspots",
    shortLabel: "Diagram",
  },
  {
    code: "audio_prompt",
    description: "Listen to audio, then recall an answer.",
    editorHint: "Include a transcript so the card remains accessible without audio.",
    generatedCards: "Creates one card",
    label: "Audio prompt",
    shortLabel: "Audio",
  },
  {
    code: "pronunciation",
    description: "Practice pronunciation against source audio or local text-to-speech.",
    editorHint: "Add a transcript and typed fallback for accessible practice.",
    generatedCards: "Creates one card",
    label: "Pronunciation / voice recording",
    shortLabel: "Pronunciation",
  },
  {
    code: "drawing",
    description: "Respond with strokes, a sketch, or the required typed alternative.",
    editorHint: "Describe what a correct drawing should include; grading stays self-reviewed.",
    generatedCards: "Creates one card",
    label: "Drawing / handwritten answer",
    shortLabel: "Drawing",
  },
] as const;

export const CARD_TYPE_BY_CODE = Object.freeze(
  Object.fromEntries(
    CARD_TYPE_DESCRIPTORS.map((descriptor) => [descriptor.code, descriptor]),
  ) as Record<CardTypeCode, CardTypeDescriptor>,
);
