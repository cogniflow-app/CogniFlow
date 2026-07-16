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
    generatedCards: "One front-to-back sibling",
    label: "Basic front → back",
    shortLabel: "Basic",
  },
  {
    code: "basic_reversed",
    description: "Creates independent cards in both directions.",
    editorHint: "Use two sides that each make sense as a prompt.",
    generatedCards: "Two directional siblings",
    label: "Basic plus reversed",
    shortLabel: "Reversed",
  },
  {
    code: "optional_reversed",
    description: "Adds the reverse sibling only when you enable it for this note.",
    editorHint: "Choose whether this individual note benefits from reverse recall.",
    generatedCards: "One or two stable siblings",
    label: "Optional reversed",
    shortLabel: "Optional reverse",
  },
  {
    code: "bidirectional",
    description: "Two equally important concepts, each recalled from the other.",
    editorHint: "Name both concepts without assuming a primary side.",
    generatedCards: "Two symmetric siblings",
    label: "True bidirectional",
    shortLabel: "Bidirectional",
  },
  {
    code: "custom",
    description: "A safe multi-field note rendered through constrained templates.",
    editorHint: "Define fields, then compose them with the safe template language.",
    generatedCards: "One sibling per enabled template",
    label: "Custom multi-field",
    shortLabel: "Custom",
  },
  {
    code: "typed_answer",
    description: "A prompt with a typed answer field and explicit accepted answer.",
    editorHint: "Keep the expected answer short enough to type accurately.",
    generatedCards: "One typed-recall sibling",
    label: "Typed answer",
    shortLabel: "Typed",
  },
  {
    code: "cloze",
    description: "One passage generates a sibling for each numbered deletion group.",
    editorHint: "Mark deletions like {{c1::mitochondria}} and reuse a number to group blanks.",
    generatedCards: "One sibling per cloze group",
    label: "Cloze deletion",
    shortLabel: "Cloze",
  },
  {
    code: "image_occlusion",
    description: "Recall labeled regions hidden by normalized vector masks.",
    editorHint: "Upload an image, add masks, and give every region a text alternative.",
    generatedCards: "One sibling per mask group",
    label: "Image occlusion",
    shortLabel: "Occlusion",
  },
  {
    code: "multiple_choice",
    description: "One correct choice with authored distractors and explanations.",
    editorHint: "Use plausible choices and explain why the correct one is right.",
    generatedCards: "One recognition sibling",
    label: "Multiple choice",
    shortLabel: "Multiple choice",
  },
  {
    code: "select_all",
    description: "A question with more than one correct authored choice.",
    editorHint: "Mark every correct choice and avoid overlapping choices.",
    generatedCards: "One multi-select sibling",
    label: "Select all that apply",
    shortLabel: "Select all",
  },
  {
    code: "true_false",
    description: "A claim with an explicit truth value and optional explanation.",
    editorHint: "Write an unambiguous statement rather than a trick question.",
    generatedCards: "One true-or-false sibling",
    label: "True or false",
    shortLabel: "True/false",
  },
  {
    code: "ordering",
    description: "Arrange authored items into the correct sequence.",
    editorHint: "Add at least two distinct steps and order them with buttons or drag and drop.",
    generatedCards: "One sequencing sibling",
    label: "Ordering / sequencing",
    shortLabel: "Ordering",
  },
  {
    code: "list_answer",
    description: "Recall a bounded set or ordered list of accepted items.",
    editorHint: "Choose whether order matters and add aliases only when genuinely equivalent.",
    generatedCards: "One list-recall sibling",
    label: "List answer",
    shortLabel: "List",
  },
  {
    code: "diagram",
    description: "Label accessible image hotspots in either prompt direction.",
    editorHint: "Give every hotspot a label, aliases, and a nonvisual description.",
    generatedCards: "One sibling per hotspot or direction",
    label: "Diagram labels / hotspots",
    shortLabel: "Diagram",
  },
  {
    code: "audio_prompt",
    description: "Listen to uploaded audio or local speech, then recall an answer.",
    editorHint: "Include a transcript so the card remains accessible without audio.",
    generatedCards: "One listening sibling",
    label: "Audio prompt",
    shortLabel: "Audio",
  },
  {
    code: "pronunciation",
    description: "Practice pronunciation against source audio or local text-to-speech.",
    editorHint: "Add a transcript and typed fallback; learner recordings remain explicit.",
    generatedCards: "One self-review sibling",
    label: "Pronunciation / voice recording",
    shortLabel: "Pronunciation",
  },
  {
    code: "drawing",
    description: "Respond with strokes, a sketch, or the required typed alternative.",
    editorHint: "Describe what a correct drawing should include; grading stays self-reviewed.",
    generatedCards: "One drawing sibling",
    label: "Drawing / handwritten answer",
    shortLabel: "Drawing",
  },
] as const;

export const CARD_TYPE_BY_CODE = Object.freeze(
  Object.fromEntries(
    CARD_TYPE_DESCRIPTORS.map((descriptor) => [descriptor.code, descriptor]),
  ) as Record<CardTypeCode, CardTypeDescriptor>,
);
