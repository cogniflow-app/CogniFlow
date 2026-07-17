import {
  createRuntimeSchema,
  hasOnlyKeys,
  isRecord,
  issue,
  readLiteral,
  readNumber,
  readRecord,
  readString,
  type ValidationIssue,
} from "./validation";

export const CURRENT_RICH_DOCUMENT_VERSION = 2 as const;
export const richTextMarkTypes = ["bold", "italic", "underline", "strike", "code", "link"] as const;
export const richContainerNodeTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
  "blockquote",
  "callout",
  "citation",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
] as const;

export type RichTextMarkType = (typeof richTextMarkTypes)[number];
export type RichContainerNodeType = (typeof richContainerNodeTypes)[number];

export interface RichTextStyleMark {
  readonly type: Exclude<RichTextMarkType, "link">;
}

export interface RichLinkMark {
  readonly type: "link";
  readonly attrs: {
    readonly href: string;
    readonly title?: string;
  };
}

export type RichTextMark = RichTextStyleMark | RichLinkMark;

export interface RichTextNode {
  readonly type: "text";
  readonly text: string;
  readonly marks?: readonly RichTextMark[];
}

export interface RichContainerNode {
  readonly type: RichContainerNodeType;
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
  readonly content: readonly RichNode[];
}

export type RichBreakNode = { readonly type: "hardBreak" } | { readonly type: "horizontalRule" };

export interface RichCodeBlockNode {
  readonly type: "codeBlock";
  readonly attrs?: { readonly language?: string };
  readonly content: readonly RichTextNode[];
}

export type RichMathNode =
  | { readonly type: "inlineMath"; readonly attrs: { readonly latex: string } }
  | { readonly type: "mathBlock"; readonly attrs: { readonly latex: string } };

export interface RichImageNode {
  readonly type: "image";
  readonly attrs: {
    readonly assetId: string;
    readonly alt: string;
    readonly title?: string;
    readonly crop?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly rotation?: 0 | 90 | 180 | 270;
    readonly annotationAssetId?: string;
  };
}

export interface RichAudioNode {
  readonly type: "audio";
  readonly attrs: {
    readonly assetId: string;
    readonly transcript: string;
    readonly title?: string;
  };
}

export interface RichExternalVideoNode {
  readonly type: "externalVideo";
  readonly attrs: {
    readonly provider: "youtube_nocookie" | "vimeo";
    readonly url: string;
    readonly title: string;
    readonly privacyEnhanced: true;
  };
}

export type RichNode =
  | RichTextNode
  | RichContainerNode
  | RichBreakNode
  | RichCodeBlockNode
  | RichMathNode
  | RichImageNode
  | RichAudioNode
  | RichExternalVideoNode;

export interface RichDocument {
  readonly type: "doc";
  readonly schemaVersion: typeof CURRENT_RICH_DOCUMENT_VERSION;
  readonly attrs?: { readonly language?: string };
  readonly content: readonly RichNode[];
}

export interface RichDocumentSanitizationResult {
  readonly document: RichDocument;
  readonly warnings: readonly ValidationIssue[];
}

const MAX_DOCUMENT_NODES = 5_000;
const MAX_DOCUMENT_DEPTH = 32;
const MAX_TEXT_LENGTH = 100_000;
const MAX_DOCUMENT_TEXT_LENGTH = 1_000_000;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const CODE_LANGUAGE_PATTERN = /^[A-Za-z0-9_+.#-]{1,40}$/u;
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function safeUrl(value: unknown, protocols: ReadonlySet<string>): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return protocols.has(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function isSafeRichLink(value: unknown): value is string {
  return safeUrl(value, SAFE_LINK_PROTOCOLS) !== undefined;
}

function parseMarks(
  input: unknown,
  path: string,
  warnings: ValidationIssue[],
): readonly RichTextMark[] {
  if (!Array.isArray(input)) {
    if (input !== undefined) {
      issue(warnings, path, "removed_marks", "Invalid text marks were removed");
    }
    return [];
  }

  const marks: RichTextMark[] = [];
  const seen = new Set<string>();
  for (const [index, value] of input.slice(0, 12).entries()) {
    if (!isRecord(value) || typeof value.type !== "string") {
      issue(warnings, `${path}[${index}]`, "removed_mark", "Invalid text mark was removed");
      continue;
    }
    if (value.type === "link") {
      const attrs = isRecord(value.attrs) ? value.attrs : {};
      const href = safeUrl(attrs.href, SAFE_LINK_PROTOCOLS);
      if (!href || seen.has(`link:${href}`)) {
        issue(warnings, `${path}[${index}]`, "unsafe_link", "Unsafe or duplicate link was removed");
        continue;
      }
      const title = typeof attrs.title === "string" ? attrs.title.trim().slice(0, 256) : undefined;
      marks.push({ type: "link", attrs: { href, ...(title ? { title } : {}) } });
      seen.add(`link:${href}`);
      continue;
    }
    if (
      (richTextMarkTypes as readonly string[]).includes(value.type) &&
      value.type !== "link" &&
      !seen.has(value.type)
    ) {
      marks.push({ type: value.type as RichTextStyleMark["type"] });
      seen.add(value.type);
      continue;
    }
    issue(warnings, `${path}[${index}]`, "removed_mark", "Unsupported text mark was removed");
  }
  return marks;
}

interface SanitizeState {
  count: number;
  textLength: number;
  readonly warnings: ValidationIssue[];
}

function boundedText(raw: string, maximum: number, path: string, state: SanitizeState): string {
  const remaining = Math.max(0, MAX_DOCUMENT_TEXT_LENGTH - state.textLength);
  const limit = Math.min(maximum, remaining);
  const value = raw.slice(0, limit);
  state.textLength += value.length;
  if (raw.length > limit) {
    issue(
      state.warnings,
      path,
      "text_truncated",
      "Content beyond the document text limit was truncated",
    );
  }
  return value;
}

function sanitizeContainerAttrs(
  type: RichContainerNodeType,
  attrs: unknown,
  path: string,
  warnings: ValidationIssue[],
): Readonly<Record<string, string | number | boolean>> | undefined {
  const source = isRecord(attrs) ? attrs : {};
  if (type === "heading") {
    const level =
      typeof source.level === "number" && Number.isInteger(source.level)
        ? Math.min(6, Math.max(1, source.level))
        : 2;
    return Object.freeze({ level });
  }
  if (type === "orderedList") {
    const start =
      typeof source.start === "number" && Number.isInteger(source.start)
        ? Math.min(10_000, Math.max(1, source.start))
        : 1;
    return start === 1 ? undefined : Object.freeze({ start });
  }
  if (type === "taskItem") {
    return Object.freeze({ checked: source.checked === true });
  }
  if (type === "callout") {
    const kinds = ["note", "hint", "warning", "example"] as const;
    const kind =
      typeof source.kind === "string" && (kinds as readonly string[]).includes(source.kind)
        ? source.kind
        : "note";
    const title = typeof source.title === "string" ? source.title.trim().slice(0, 120) : "";
    return Object.freeze({ kind, ...(title ? { title } : {}) });
  }
  if (type === "citation") {
    const sourceText = typeof source.source === "string" ? source.source.trim().slice(0, 500) : "";
    const href = safeUrl(source.url, new Set(["http:", "https:"]));
    if (source.url !== undefined && !href) {
      issue(warnings, `${path}.url`, "unsafe_citation_url", "Unsafe citation URL was removed");
    }
    return Object.freeze({
      ...(sourceText ? { source: sourceText } : {}),
      ...(href ? { url: href } : {}),
    });
  }
  if (type === "tableCell" || type === "tableHeader") {
    const colspan =
      typeof source.colspan === "number" && Number.isInteger(source.colspan)
        ? Math.min(12, Math.max(1, source.colspan))
        : 1;
    const rowspan =
      typeof source.rowspan === "number" && Number.isInteger(source.rowspan)
        ? Math.min(100, Math.max(1, source.rowspan))
        : 1;
    return colspan === 1 && rowspan === 1 ? undefined : Object.freeze({ colspan, rowspan });
  }
  return undefined;
}

function sanitizeNode(
  input: unknown,
  path: string,
  depth: number,
  state: SanitizeState,
): RichNode | undefined {
  state.count += 1;
  if (state.count > MAX_DOCUMENT_NODES || depth > MAX_DOCUMENT_DEPTH) {
    issue(state.warnings, path, "document_limit", "Content beyond the document limit was removed");
    return undefined;
  }
  if (!isRecord(input) || typeof input.type !== "string") {
    issue(state.warnings, path, "removed_node", "Invalid rich-content node was removed");
    return undefined;
  }

  if (input.type === "text") {
    if (typeof input.text !== "string") {
      issue(state.warnings, `${path}.text`, "removed_text", "Invalid text node was removed");
      return undefined;
    }
    const text = boundedText(input.text, MAX_TEXT_LENGTH, `${path}.text`, state);
    const marks = parseMarks(input.marks, `${path}.marks`, state.warnings);
    return Object.freeze({
      type: "text",
      text,
      ...(marks.length > 0 ? { marks: Object.freeze(marks) } : {}),
    });
  }

  if ((richContainerNodeTypes as readonly string[]).includes(input.type)) {
    const type = input.type as RichContainerNodeType;
    const rawChildren = Array.isArray(input.content) ? input.content : [];
    if (!Array.isArray(input.content)) {
      issue(
        state.warnings,
        `${path}.content`,
        "missing_content",
        "Missing content was replaced with an empty list",
      );
    }
    const content = rawChildren
      .slice(0, MAX_DOCUMENT_NODES)
      .map((child, index) => sanitizeNode(child, `${path}.content[${index}]`, depth + 1, state))
      .filter((child): child is RichNode => child !== undefined);
    const attrs = sanitizeContainerAttrs(type, input.attrs, `${path}.attrs`, state.warnings);
    return Object.freeze({ type, ...(attrs ? { attrs } : {}), content: Object.freeze(content) });
  }

  if (input.type === "hardBreak" || input.type === "horizontalRule") {
    return Object.freeze({ type: input.type });
  }

  if (input.type === "codeBlock") {
    const attrs = isRecord(input.attrs) ? input.attrs : {};
    const language =
      typeof attrs.language === "string" && CODE_LANGUAGE_PATTERN.test(attrs.language)
        ? attrs.language
        : undefined;
    const rawContent = Array.isArray(input.content) ? input.content : [];
    const content = rawContent
      .slice(0, MAX_DOCUMENT_NODES)
      .map((child, index): RichTextNode | undefined => {
        state.count += 1;
        if (state.count > MAX_DOCUMENT_NODES) {
          issue(
            state.warnings,
            `${path}.content[${index}]`,
            "document_limit",
            "Content beyond the document limit was removed",
          );
          return undefined;
        }
        if (!isRecord(child) || child.type !== "text" || typeof child.text !== "string") {
          issue(
            state.warnings,
            `${path}.content[${index}]`,
            "removed_code_node",
            "Invalid code content was removed",
          );
          return undefined;
        }
        return Object.freeze({
          type: "text",
          text: boundedText(child.text, MAX_TEXT_LENGTH, `${path}.content[${index}].text`, state),
        });
      })
      .filter((child): child is RichTextNode => child !== undefined);
    return Object.freeze({
      type: "codeBlock",
      ...(language ? { attrs: { language } } : {}),
      content: Object.freeze(content),
    });
  }

  if (input.type === "inlineMath" || input.type === "mathBlock") {
    const attrs = isRecord(input.attrs) ? input.attrs : {};
    const latex =
      typeof attrs.latex === "string"
        ? boundedText(attrs.latex.trim(), 10_000, `${path}.attrs.latex`, state)
        : "";
    if (!latex) {
      issue(state.warnings, `${path}.attrs.latex`, "removed_math", "Empty math node was removed");
      return undefined;
    }
    return Object.freeze({ type: input.type, attrs: { latex } });
  }

  if (input.type === "image") {
    const attrs = isRecord(input.attrs) ? input.attrs : {};
    const assetId =
      typeof attrs.assetId === "string" && IDENTIFIER_PATTERN.test(attrs.assetId)
        ? attrs.assetId
        : undefined;
    const alt =
      typeof attrs.alt === "string"
        ? boundedText(attrs.alt.trim(), 1_000, `${path}.attrs.alt`, state)
        : "";
    if (!assetId || !alt) {
      issue(
        state.warnings,
        `${path}.attrs`,
        "removed_image",
        "Images require a safe asset ID and alt text",
      );
      return undefined;
    }
    const title = typeof attrs.title === "string" ? attrs.title.trim().slice(0, 256) : undefined;
    const annotationAssetId =
      typeof attrs.annotationAssetId === "string" &&
      IDENTIFIER_PATTERN.test(attrs.annotationAssetId)
        ? attrs.annotationAssetId
        : undefined;
    const rotation = [0, 90, 180, 270].includes(Number(attrs.rotation))
      ? (Number(attrs.rotation) as 0 | 90 | 180 | 270)
      : undefined;
    let crop: RichImageNode["attrs"]["crop"];
    if (isRecord(attrs.crop)) {
      const values = [attrs.crop.x, attrs.crop.y, attrs.crop.width, attrs.crop.height];
      if (
        values.every((value) => typeof value === "number" && value >= 0 && value <= 1) &&
        Number(attrs.crop.width) > 0 &&
        Number(attrs.crop.height) > 0 &&
        Number(attrs.crop.x) + Number(attrs.crop.width) <= 1 &&
        Number(attrs.crop.y) + Number(attrs.crop.height) <= 1
      ) {
        crop = {
          x: Number(attrs.crop.x),
          y: Number(attrs.crop.y),
          width: Number(attrs.crop.width),
          height: Number(attrs.crop.height),
        };
      } else {
        issue(
          state.warnings,
          `${path}.attrs.crop`,
          "removed_crop",
          "Invalid image crop was removed",
        );
      }
    }
    return Object.freeze({
      type: "image",
      attrs: Object.freeze({
        assetId,
        alt,
        ...(title ? { title } : {}),
        ...(crop ? { crop: Object.freeze(crop) } : {}),
        ...(rotation !== undefined ? { rotation } : {}),
        ...(annotationAssetId ? { annotationAssetId } : {}),
      }),
    });
  }

  if (input.type === "audio") {
    const attrs = isRecord(input.attrs) ? input.attrs : {};
    const assetId =
      typeof attrs.assetId === "string" && IDENTIFIER_PATTERN.test(attrs.assetId)
        ? attrs.assetId
        : undefined;
    const transcript =
      typeof attrs.transcript === "string"
        ? boundedText(attrs.transcript.trim(), 10_000, `${path}.attrs.transcript`, state)
        : "";
    if (!assetId || !transcript) {
      issue(
        state.warnings,
        `${path}.attrs`,
        "removed_audio",
        "Audio requires an asset ID and transcript",
      );
      return undefined;
    }
    const title = typeof attrs.title === "string" ? attrs.title.trim().slice(0, 256) : undefined;
    return Object.freeze({
      type: "audio",
      attrs: Object.freeze({ assetId, transcript, ...(title ? { title } : {}) }),
    });
  }

  if (input.type === "externalVideo") {
    const attrs = isRecord(input.attrs) ? input.attrs : {};
    const url = typeof attrs.url === "string" ? allowedVideoUrl(attrs.url) : undefined;
    const title =
      typeof attrs.title === "string"
        ? boundedText(attrs.title.trim(), 256, `${path}.attrs.title`, state)
        : "";
    if (!url || !title) {
      issue(
        state.warnings,
        `${path}.attrs`,
        "removed_video",
        "External video provider or URL is not allowed",
      );
      return undefined;
    }
    return Object.freeze({
      type: "externalVideo",
      attrs: Object.freeze({ ...url, title, privacyEnhanced: true as const }),
    });
  }

  issue(
    state.warnings,
    path,
    "removed_node",
    `Unsupported node type ${JSON.stringify(input.type)} was removed`,
  );
  return undefined;
}

function allowedVideoUrl(
  raw: string,
): Pick<RichExternalVideoNode["attrs"], "provider" | "url"> | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return undefined;
    }
    const host = url.hostname.toLowerCase();
    if (host === "www.youtube-nocookie.com" && url.pathname.startsWith("/embed/")) {
      url.search = "";
      url.hash = "";
      return { provider: "youtube_nocookie", url: url.toString() };
    }
    if (host === "player.vimeo.com" && url.pathname.startsWith("/video/")) {
      url.search = "";
      url.hash = "";
      return { provider: "vimeo", url: url.toString() };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function sanitizeRichDocument(input: unknown): RichDocumentSanitizationResult {
  const warnings: ValidationIssue[] = [];
  const migrated = migrateRichDocument(input);
  const source = isRecord(migrated) ? migrated : {};
  const rawContent = Array.isArray(source.content) ? source.content : [];
  if (!isRecord(migrated) || source.type !== "doc") {
    issue(
      warnings,
      "$",
      "invalid_document",
      "Invalid document root was replaced with an empty document",
    );
  }
  const state: SanitizeState = { count: 0, textLength: 0, warnings };
  const content = rawContent
    .slice(0, MAX_DOCUMENT_NODES)
    .map((node, index) => sanitizeNode(node, `$.content[${index}]`, 1, state))
    .filter((node): node is RichNode => node !== undefined);
  const attrs = isRecord(source.attrs) ? source.attrs : {};
  const language =
    typeof attrs.language === "string" && LANGUAGE_PATTERN.test(attrs.language)
      ? attrs.language
      : undefined;
  if (attrs.language !== undefined && !language) {
    issue(warnings, "$.attrs.language", "invalid_language", "Invalid content language was removed");
  }
  return Object.freeze({
    document: Object.freeze({
      type: "doc",
      schemaVersion: CURRENT_RICH_DOCUMENT_VERSION,
      ...(language ? { attrs: Object.freeze({ language }) } : {}),
      content: Object.freeze(content),
    }),
    warnings: Object.freeze(warnings),
  });
}

function parseStrictRichDocument(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): RichDocument | undefined {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["type", "schemaVersion", "version", "attrs", "content"], path, issues);
  const type = readLiteral(record.type, "doc", `${path}.type`, issues);
  if (!type) return undefined;
  const version = record.schemaVersion ?? record.version ?? 1;
  if (version !== 1 && version !== "1" && version !== CURRENT_RICH_DOCUMENT_VERSION) {
    issue(
      issues,
      `${path}.schemaVersion`,
      "unsupported_version",
      "Rich document version is unsupported",
    );
    return undefined;
  }
  const result = sanitizeRichDocument(input);
  issues.push(...result.warnings);
  return result.document;
}

export const richDocumentSchema = createRuntimeSchema<RichDocument>(
  "rich document",
  parseStrictRichDocument,
);

export function emptyRichDocument(language?: string): RichDocument {
  const attrs = language && LANGUAGE_PATTERN.test(language) ? { language } : undefined;
  const paragraph: RichContainerNode = Object.freeze({
    type: "paragraph",
    content: Object.freeze([]),
  });
  return Object.freeze({
    type: "doc",
    schemaVersion: CURRENT_RICH_DOCUMENT_VERSION,
    ...(attrs ? { attrs: Object.freeze(attrs) } : {}),
    content: Object.freeze([paragraph]),
  });
}

/** Migrates prior stored document envelopes without treating their contents as trusted. */
export function migrateRichDocument(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const version = input.schemaVersion ?? input.version ?? 1;
  if (version === CURRENT_RICH_DOCUMENT_VERSION) return input;
  if (version === 1 || version === "1") {
    const state = { count: 0, seen: new WeakSet<object>() };
    return {
      type: input.type,
      schemaVersion: CURRENT_RICH_DOCUMENT_VERSION,
      ...(input.attrs === undefined ? {} : { attrs: input.attrs }),
      content: Array.isArray(input.content)
        ? input.content.slice(0, MAX_DOCUMENT_NODES).map((node) => migrateV1Node(node, 1, state))
        : [],
    };
  }
  return input;
}

function migrateV1Node(
  input: unknown,
  depth: number,
  state: { count: number; readonly seen: WeakSet<object> },
): unknown {
  if (!isRecord(input)) return input;
  state.count += 1;
  if (depth > MAX_DOCUMENT_DEPTH || state.count > MAX_DOCUMENT_NODES || state.seen.has(input)) {
    return undefined;
  }
  state.seen.add(input);
  const type = input.type === "math" ? "inlineMath" : input.type;
  const attrs =
    input.type === "math" && typeof input.text === "string" ? { latex: input.text } : input.attrs;
  return {
    ...input,
    type,
    ...(attrs === undefined ? {} : { attrs }),
    ...(Array.isArray(input.content)
      ? {
          content: input.content
            .slice(0, MAX_DOCUMENT_NODES)
            .map((node) => migrateV1Node(node, depth + 1, state)),
        }
      : {}),
  };
}

function nodePlainText(node: RichNode): string {
  if (node.type === "text") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "horizontalRule") return "\n";
  if (node.type === "inlineMath" || node.type === "mathBlock") return node.attrs.latex;
  if (node.type === "image") return node.attrs.alt;
  if (node.type === "audio") return node.attrs.transcript;
  if (node.type === "externalVideo") return node.attrs.title;
  return node.content.map((child) => nodePlainText(child)).join("");
}

export function extractRichDocumentText(document: RichDocument): string {
  const blockTypes = new Set<RichNode["type"]>([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "taskList",
    "listItem",
    "taskItem",
    "blockquote",
    "callout",
    "citation",
    "table",
    "tableRow",
    "codeBlock",
    "mathBlock",
  ]);
  const chunks: string[] = [];
  const walk = (node: RichNode): void => {
    if (node.type === "text") {
      chunks.push(node.text);
      return;
    }
    if (node.type === "hardBreak" || node.type === "horizontalRule") {
      chunks.push("\n");
      return;
    }
    if (
      node.type === "inlineMath" ||
      node.type === "mathBlock" ||
      node.type === "image" ||
      node.type === "audio" ||
      node.type === "externalVideo"
    ) {
      chunks.push(nodePlainText(node));
    } else {
      node.content.forEach(walk);
    }
    if (blockTypes.has(node.type)) chunks.push("\n");
  };
  document.content.forEach(walk);
  return chunks
    .join("")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function richDocumentSemanticText(document: RichDocument): string {
  return extractRichDocumentText(document).normalize("NFKC").replace(/\s+/gu, " ").trim();
}

// Kept as exported parser helpers for adapters that validate isolated editor attributes.
export const richDocumentAttributeSchemas = Object.freeze({
  language: createRuntimeSchema<string>("content language", (input, path, issues) =>
    readString(input, path, issues, { min: 2, max: 72, pattern: LANGUAGE_PATTERN }),
  ),
  crop: createRuntimeSchema<RichImageNode["attrs"]["crop"]>(
    "normalized crop",
    (input, path, issues) => {
      const record = readRecord(input, path, issues);
      if (!record) return undefined;
      hasOnlyKeys(record, ["x", "y", "width", "height"], path, issues);
      const x = readNumber(record.x, `${path}.x`, issues, { min: 0, max: 1 });
      const y = readNumber(record.y, `${path}.y`, issues, { min: 0, max: 1 });
      const width = readNumber(record.width, `${path}.width`, issues, {
        min: Number.EPSILON,
        max: 1,
      });
      const height = readNumber(record.height, `${path}.height`, issues, {
        min: Number.EPSILON,
        max: 1,
      });
      if (x === undefined || y === undefined || width === undefined || height === undefined)
        return undefined;
      if (x + width > 1 || y + height > 1) {
        return issue(issues, path, "out_of_bounds", "Crop must remain within the normalized image");
      }
      return Object.freeze({ x, y, width, height });
    },
  ),
});
