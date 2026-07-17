import {
  extractRichDocumentText,
  sanitizeRichDocument,
  type RichDocument,
  type RichNode,
  type RichTextMark,
} from "./rich-document";
import {
  DomainValidationError,
  contentFingerprint,
  issue,
  type ValidationIssue,
} from "./validation";

export const TEMPLATE_SCHEMA_VERSION = 1 as const;
export const templateHelperNames = ["cloze", "type_answer", "hint", "media", "language"] as const;
export type TemplateHelperName = (typeof templateHelperNames)[number];

export interface TemplateTextNode {
  readonly type: "text";
  readonly value: string;
}

export interface TemplateFieldNode {
  readonly type: "field";
  readonly field: string;
}

export interface TemplateItemNode {
  readonly type: "item";
}

export interface TemplateFrontNode {
  readonly type: "front";
}

export interface TemplateHelperNode {
  readonly type: "helper";
  readonly helper: TemplateHelperName;
  readonly field: string;
}

export interface TemplateIfNode {
  readonly type: "if";
  readonly field: string;
  readonly children: readonly TemplateNode[];
}

export interface TemplateEachNode {
  readonly type: "each";
  readonly field: string;
  readonly children: readonly TemplateNode[];
}

export type TemplateNode =
  | TemplateTextNode
  | TemplateFieldNode
  | TemplateItemNode
  | TemplateFrontNode
  | TemplateHelperNode
  | TemplateIfNode
  | TemplateEachNode;

export interface TemplateProgram {
  readonly schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  readonly source: string;
  readonly nodes: readonly TemplateNode[];
  readonly referencedFields: readonly string[];
  readonly fingerprint: string;
}

export interface ScopedTemplateStyle {
  readonly scope: string;
  readonly selector: string;
  readonly css: string;
}

export interface CompiledTemplate {
  readonly program: TemplateProgram;
  readonly style?: ScopedTemplateStyle;
}

export interface TemplateMediaValue {
  readonly kind: "media";
  readonly mediaKind: "audio" | "image";
  readonly assetId: string;
  readonly alt: string;
}

export type TemplateValue = string | RichDocument | readonly string[] | TemplateMediaValue;

declare const safeTemplateHtmlBrand: unique symbol;
export type SafeTemplateHtml = string & { readonly [safeTemplateHtmlBrand]: true };

export interface TemplateRenderResult {
  readonly html: SafeTemplateHtml;
  readonly plainText: string;
  readonly referencedFields: readonly string[];
  readonly missingFields: readonly string[];
}

export interface TemplateRenderContext {
  readonly fields: Readonly<Record<string, TemplateValue | undefined>>;
  readonly front?: TemplateRenderResult;
  readonly maxLoopItems?: number;
  readonly media?: Readonly<Record<string, TemplateMediaSource | undefined>>;
}

export interface TemplateMediaSource {
  readonly kind: "audio" | "image";
  readonly signedUrl: string;
}

const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const MAX_TEMPLATE_LENGTH = 50_000;
const MAX_TEMPLATE_NODES = 1_000;
const MAX_TEMPLATE_DEPTH = 16;
const MAX_RENDER_LENGTH = 1_000_000;
const FORBIDDEN_FIELD_NAMES = new Set(["__proto__", "prototype", "constructor"]);

interface MutableContainer {
  readonly kind: "root" | "if" | "each";
  readonly field?: string;
  readonly children: TemplateNode[];
}

function templateIssue(
  issues: ValidationIssue[],
  offset: number,
  code: string,
  message: string,
): void {
  issue(issues, `$[${offset}]`, code, message);
}

function validField(field: string, issues: ValidationIssue[], offset: number): boolean {
  if (!FIELD_PATTERN.test(field) || FORBIDDEN_FIELD_NAMES.has(field)) {
    templateIssue(
      issues,
      offset,
      "invalid_field",
      `Invalid template field ${JSON.stringify(field)}`,
    );
    return false;
  }
  return true;
}

function parseValueTag(
  rawTag: string,
  issues: ValidationIssue[],
  offset: number,
  insideEach: boolean,
): TemplateNode | undefined {
  const tag = rawTag.trim();
  if (tag === "front" || tag === "FrontSide") return Object.freeze({ type: "front" });
  if (tag === "item") {
    if (!insideEach) {
      templateIssue(
        issues,
        offset,
        "item_outside_loop",
        "The item token is valid only inside an each block",
      );
      return undefined;
    }
    return Object.freeze({ type: "item" });
  }

  const colonHelper =
    /^(cloze|type|type_answer|hint|media|language):([A-Za-z][A-Za-z0-9_]*)$/u.exec(tag);
  const spacedHelper =
    /^(cloze|type|type_answer|hint|media|language)\s+([A-Za-z][A-Za-z0-9_]*)$/u.exec(tag);
  const helperMatch = colonHelper ?? spacedHelper;
  if (helperMatch) {
    const rawHelper = helperMatch[1];
    const field = helperMatch[2];
    if (!rawHelper || !field || !validField(field, issues, offset)) return undefined;
    const helper: TemplateHelperName =
      rawHelper === "type" ? "type_answer" : (rawHelper as TemplateHelperName);
    return Object.freeze({ type: "helper", helper, field });
  }

  const fieldMatch = /^(?:field:|field\s+)?([A-Za-z][A-Za-z0-9_]*)$/u.exec(tag);
  const field = fieldMatch?.[1];
  if (field && validField(field, issues, offset)) {
    return Object.freeze({ type: "field", field });
  }

  templateIssue(
    issues,
    offset,
    "unknown_tag",
    `Unknown or unsafe template tag ${JSON.stringify(tag)}`,
  );
  return undefined;
}

export function parseTemplate(source: string): TemplateProgram {
  const issues: ValidationIssue[] = [];
  if (typeof source !== "string" || source.length === 0 || source.length > MAX_TEMPLATE_LENGTH) {
    throw new DomainValidationError("template", [
      {
        path: "$",
        code: "invalid_length",
        message: `Template length must be between 1 and ${MAX_TEMPLATE_LENGTH}`,
      },
    ]);
  }
  if (source.includes("{{{") || source.includes("}}}")) {
    throw new DomainValidationError("template", [
      {
        path: "$",
        code: "raw_interpolation",
        message: "Raw/triple-brace interpolation is forbidden",
      },
    ]);
  }

  const root: MutableContainer = { kind: "root", children: [] };
  const stack: MutableContainer[] = [root];
  let cursor = 0;
  let nodeCount = 0;
  const tagPattern = /\{\{([\s\S]*?)\}\}/gu;
  const referencedFields = new Set<string>();
  const addNode = (node: TemplateNode): void => {
    nodeCount += 1;
    if (nodeCount > MAX_TEMPLATE_NODES) {
      templateIssue(issues, cursor, "node_limit", `Template exceeds ${MAX_TEMPLATE_NODES} nodes`);
      return;
    }
    stack.at(-1)?.children.push(node);
    if ("field" in node) referencedFields.add(node.field);
  };

  for (const match of source.matchAll(tagPattern)) {
    const index = match.index;
    const whole = match[0];
    const rawTag = match[1] ?? "";
    if (index > cursor)
      addNode(Object.freeze({ type: "text", value: source.slice(cursor, index) }));
    cursor = index + whole.length;
    const tag = rawTag.trim();

    const open = /^#(if|each)\s+([A-Za-z][A-Za-z0-9_]*)$/u.exec(tag);
    if (open) {
      const kind = open[1] as "if" | "each";
      const field = open[2];
      if (!field || !validField(field, issues, index)) continue;
      if (stack.length >= MAX_TEMPLATE_DEPTH) {
        templateIssue(
          issues,
          index,
          "depth_limit",
          `Template nesting exceeds ${MAX_TEMPLATE_DEPTH}`,
        );
        continue;
      }
      referencedFields.add(field);
      stack.push({ kind, field, children: [] });
      continue;
    }

    const close = /^\/(if|each)$/u.exec(tag);
    if (close) {
      const expected = close[1] as "if" | "each";
      const container = stack.at(-1);
      if (!container || container.kind !== expected || stack.length === 1 || !container.field) {
        templateIssue(issues, index, "unbalanced_block", `Unexpected closing ${expected} block`);
        continue;
      }
      stack.pop();
      const node: TemplateIfNode | TemplateEachNode = Object.freeze({
        type: expected,
        field: container.field,
        children: Object.freeze(container.children),
      });
      addNode(node);
      continue;
    }

    if (tag.startsWith("#") || tag.startsWith("/")) {
      templateIssue(
        issues,
        index,
        "invalid_block",
        "Only bounded if and each blocks are supported",
      );
      continue;
    }
    const insideEach = stack.some((container) => container.kind === "each");
    const node = parseValueTag(tag, issues, index, insideEach);
    if (node) addNode(node);
  }

  if (cursor < source.length) addNode(Object.freeze({ type: "text", value: source.slice(cursor) }));
  if (stack.length !== 1) {
    templateIssue(issues, source.length, "unclosed_block", "Template contains an unclosed block");
  }
  if (issues.length > 0) throw new DomainValidationError("template", issues);

  return Object.freeze({
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    source,
    nodes: Object.freeze(root.children),
    referencedFields: Object.freeze([...referencedFields].sort()),
    fingerprint: contentFingerprint({ version: TEMPLATE_SCHEMA_VERSION, nodes: root.children }),
  });
}

const allowedStaticTags = new Set([
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "small",
  "span",
  "s",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);
const voidStaticTags = new Set(["br", "hr"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeStaticTag(raw: string): string {
  const match = /^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)\/?\s*>$/u.exec(raw);
  if (!match) return escapeHtml(raw);
  const closing = match[1] === "/";
  const name = (match[2] ?? "").toLowerCase();
  const attributes = match[3] ?? "";
  if (!allowedStaticTags.has(name)) return escapeHtml(raw);
  if (closing) return `</${name}>`;

  const safeAttributes: string[] = [];
  const attributePattern = /([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const attribute of attributes.matchAll(attributePattern)) {
    const attributeName = (attribute[1] ?? "").toLowerCase();
    const value = attribute[2] ?? attribute[3] ?? "";
    if (attributeName === "class") {
      const classNames = value
        .split(/\s+/u)
        .filter((token) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(token))
        .slice(0, 20);
      if (classNames.length > 0) safeAttributes.push(`class="${classNames.join(" ")}"`);
    } else if (attributeName === "lang" && LANGUAGE_PATTERN.test(value)) {
      safeAttributes.push(`lang="${escapeHtml(value)}"`);
    } else if (attributeName === "dir" && ["ltr", "rtl", "auto"].includes(value)) {
      safeAttributes.push(`dir="${value}"`);
    } else if (attributeName === "aria-label" && value.length <= 256) {
      safeAttributes.push(`aria-label="${escapeHtml(value)}"`);
    }
  }
  return `<${name}${safeAttributes.length > 0 ? ` ${safeAttributes.join(" ")}` : ""}${voidStaticTags.has(name) ? " /" : ""}>`;
}

export function sanitizeTemplateMarkup(value: string): SafeTemplateHtml {
  const withoutComments = value.replace(/<!--[\s\S]*?-->/gu, "");
  const output: string[] = [];
  let cursor = 0;
  for (const match of withoutComments.matchAll(/<[\s\S]*?>/gu)) {
    const index = match.index;
    if (index > cursor) output.push(withoutComments.slice(cursor, index));
    output.push(sanitizeStaticTag(match[0]));
    cursor = index + match[0].length;
  }
  if (cursor < withoutComments.length) output.push(withoutComments.slice(cursor));
  return output.join("") as SafeTemplateHtml;
}

function applyMarks(text: string, marks: readonly RichTextMark[] | undefined): string {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    if (mark.type === "bold") html = `<strong>${html}</strong>`;
    else if (mark.type === "italic") html = `<em>${html}</em>`;
    else if (mark.type === "underline") html = `<u>${html}</u>`;
    else if (mark.type === "strike") html = `<s>${html}</s>`;
    else if (mark.type === "code") html = `<code>${html}</code>`;
    else if (mark.type === "link") {
      html = `<a href="${escapeHtml(mark.attrs.href)}" rel="nofollow noreferrer noopener" target="_blank"${mark.attrs.title ? ` title="${escapeHtml(mark.attrs.title)}"` : ""}>${html}</a>`;
    }
  }
  return html;
}

function renderRichNode(node: RichNode): string {
  if (node.type === "text") return applyMarks(node.text, node.marks);
  if (node.type === "hardBreak") return "<br />";
  if (node.type === "horizontalRule") return "<hr />";
  if (node.type === "inlineMath")
    return `<span data-lumen-math="inline">${escapeHtml(node.attrs.latex)}</span>`;
  if (node.type === "mathBlock")
    return `<div data-lumen-math="block">${escapeHtml(node.attrs.latex)}</div>`;
  if (node.type === "image") {
    return `<span role="img" data-lumen-asset="${escapeHtml(node.attrs.assetId)}" aria-label="${escapeHtml(node.attrs.alt)}">${escapeHtml(node.attrs.alt)}</span>`;
  }
  if (node.type === "audio") {
    return `<span data-lumen-audio="${escapeHtml(node.attrs.assetId)}">${escapeHtml(node.attrs.transcript)}</span>`;
  }
  if (node.type === "externalVideo") {
    return `<span data-lumen-video-provider="${node.attrs.provider}">${escapeHtml(node.attrs.title)}</span>`;
  }
  if (node.type === "codeBlock") {
    const language = node.attrs?.language;
    return `<pre${language ? ` data-language="${escapeHtml(language)}"` : ""}><code>${node.content.map((child) => escapeHtml(child.text)).join("")}</code></pre>`;
  }
  const content = node.content.map(renderRichNode).join("");
  if (node.type === "paragraph") return `<p>${content}</p>`;
  if (node.type === "heading")
    return `<h${String(node.attrs?.level ?? 2)}>${content}</h${String(node.attrs?.level ?? 2)}>`;
  if (node.type === "bulletList") return `<ul>${content}</ul>`;
  if (node.type === "orderedList")
    return `<ol${node.attrs?.start ? ` start="${String(node.attrs.start)}"` : ""}>${content}</ol>`;
  if (node.type === "taskList") return `<ul data-task-list="true">${content}</ul>`;
  if (node.type === "listItem") return `<li>${content}</li>`;
  if (node.type === "taskItem")
    return `<li data-checked="${String(node.attrs?.checked === true)}">${content}</li>`;
  if (node.type === "blockquote") return `<blockquote>${content}</blockquote>`;
  if (node.type === "callout")
    return `<aside data-callout="${escapeHtml(String(node.attrs?.kind ?? "note"))}">${content}</aside>`;
  if (node.type === "citation") return `<aside data-citation="true">${content}</aside>`;
  if (node.type === "table") return `<table>${content}</table>`;
  if (node.type === "tableRow") return `<tr>${content}</tr>`;
  if (node.type === "tableHeader") return `<th>${content}</th>`;
  return `<td>${content}</td>`;
}

export function renderRichDocumentHtml(document: RichDocument): SafeTemplateHtml {
  const sanitized = sanitizeRichDocument(document).document;
  return sanitized.content.map(renderRichNode).join("") as SafeTemplateHtml;
}

function valuePlainText(value: TemplateValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(" ");
  if ("kind" in value && value.kind === "media") return value.alt;
  return extractRichDocumentText(value as RichDocument);
}

function safeMediaUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return value;
    if (url.protocol === "http:" && ["127.0.0.1", "::1", "localhost"].includes(url.hostname)) {
      return value;
    }
  } catch {
    // An unavailable or malformed source falls back to the authored description.
  }
  return null;
}

function mediaHtml(value: TemplateMediaValue, media: TemplateRenderContext["media"]): string {
  if (!ASSET_PATTERN.test(value.assetId)) return escapeHtml(value.alt);
  const source = media?.[value.assetId];
  const signedUrl = source?.kind === value.mediaKind ? safeMediaUrl(source.signedUrl) : null;
  if (signedUrl && value.mediaKind === "image") {
    return `<img data-lumen-asset="${escapeHtml(value.assetId)}" src="${escapeHtml(signedUrl)}" alt="${escapeHtml(value.alt)}" decoding="async" loading="lazy" />`;
  }
  if (signedUrl && value.mediaKind === "audio") {
    return `<audio data-lumen-audio="${escapeHtml(value.assetId)}" src="${escapeHtml(signedUrl)}" aria-label="${escapeHtml(value.alt)}" controls preload="metadata">${escapeHtml(value.alt)}</audio>`;
  }
  return value.mediaKind === "image"
    ? `<span role="img" data-lumen-asset="${escapeHtml(value.assetId)}" aria-label="${escapeHtml(value.alt)}">${escapeHtml(value.alt)}</span>`
    : `<span data-lumen-audio="${escapeHtml(value.assetId)}">${escapeHtml(value.alt)}</span>`;
}

function valueHtml(
  value: TemplateValue | undefined,
  media?: TemplateRenderContext["media"],
): string {
  if (value === undefined) return "";
  if (typeof value === "string") return escapeHtml(value);
  if (Array.isArray(value))
    return `<ul>${value.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`;
  if ("kind" in value && value.kind === "media") {
    return mediaHtml(value, media);
  }
  return renderRichDocumentHtml(value as RichDocument);
}

export function renderTemplate(
  programOrCompiled: TemplateProgram | CompiledTemplate,
  context: TemplateRenderContext,
): TemplateRenderResult {
  const program = "program" in programOrCompiled ? programOrCompiled.program : programOrCompiled;
  const missingFields = new Set<string>();
  const maxLoopItems = Math.max(1, Math.min(context.maxLoopItems ?? 100, 100));

  const renderNodes = (nodes: readonly TemplateNode[], item?: string): string =>
    nodes
      .map((node): string => {
        if (node.type === "text") return sanitizeTemplateMarkup(node.value);
        if (node.type === "front") return context.front?.html ?? "";
        if (node.type === "item") return escapeHtml(item ?? "");
        const value = context.fields[node.field];
        if (value === undefined) missingFields.add(node.field);
        if (node.type === "field") return valueHtml(value, context.media);
        if (node.type === "if")
          return valuePlainText(value).trim() ? renderNodes(node.children, item) : "";
        if (node.type === "each") {
          const entries = Array.isArray(value) ? value.slice(0, maxLoopItems) : [];
          return entries.map((entry) => renderNodes(node.children, entry)).join("");
        }
        if (node.helper === "type_answer") {
          return `<span data-lumen-type-answer="${escapeHtml(node.field)}" aria-label="Type the answer"></span>`;
        }
        if (node.helper === "hint") {
          return `<details data-lumen-hint="true"><summary>Hint</summary>${valueHtml(value, context.media)}</details>`;
        }
        if (node.helper === "language") {
          const language = valuePlainText(value).trim();
          return LANGUAGE_PATTERN.test(language)
            ? `<span lang="${escapeHtml(language)}">${escapeHtml(language)}</span>`
            : "";
        }
        if (node.helper === "cloze") {
          return `<span data-lumen-cloze-field="${escapeHtml(node.field)}">${valueHtml(value, context.media)}</span>`;
        }
        return `<span data-lumen-media-field="${escapeHtml(node.field)}">${valueHtml(value, context.media)}</span>`;
      })
      .join("");

  const html = renderNodes(program.nodes);
  if (html.length > MAX_RENDER_LENGTH) {
    throw new DomainValidationError("template render", [
      {
        path: "$",
        code: "output_limit",
        message: "Rendered template exceeds the safe output limit",
      },
    ]);
  }
  const plainText = program.referencedFields
    .map((field) => valuePlainText(context.fields[field]))
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  return Object.freeze({
    html: html as SafeTemplateHtml,
    plainText,
    referencedFields: program.referencedFields,
    missingFields: Object.freeze([...missingFields].sort()),
  });
}

const allowedCssProperties = new Set([
  "background",
  "background-color",
  "border",
  "border-color",
  "border-radius",
  "border-style",
  "border-width",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "grid-template-columns",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "opacity",
  "overflow-wrap",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-transform",
  "white-space",
  "width",
  "word-break",
]);

function validateCssSelector(
  selector: string,
  issues: ValidationIssue[],
  ruleIndex: number,
): string | undefined {
  const trimmed = selector.trim();
  if (
    !trimmed ||
    trimmed.length > 300 ||
    /(?:^|[\s>+~,])(?:html|body|head|:root|\*)(?:$|[\s>+~,.#[:])/iu.test(trimmed) ||
    /@|:global|::slotted|::part|#|\[\s*(?:id|style|on)/iu.test(trimmed) ||
    !/^[A-Za-z0-9_.:[\]="'\-\s>+~(),]+$/u.test(trimmed)
  ) {
    issue(
      issues,
      `$.rules[${ruleIndex}].selector`,
      "unsafe_selector",
      "CSS selector can escape or is unsupported",
    );
    return undefined;
  }
  return trimmed;
}

function validateCssValue(
  value: string,
  issues: ValidationIssue[],
  path: string,
): string | undefined {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 500 ||
    /url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding|\\/iu.test(trimmed) ||
    /var\s*\(\s*--(?!lumen-)/iu.test(trimmed) ||
    !/^[A-Za-z0-9#%.,()\/\-+\s_'"]+$/u.test(trimmed)
  ) {
    issue(issues, path, "unsafe_value", "CSS value is unsafe or unsupported");
    return undefined;
  }
  return trimmed;
}

export function validateAndScopeTemplateCss(css: string, scope: string): ScopedTemplateStyle {
  const issues: ValidationIssue[] = [];
  if (!SCOPE_PATTERN.test(scope)) {
    throw new DomainValidationError("template CSS scope", [
      { path: "$.scope", code: "invalid_scope", message: "CSS scope has an invalid format" },
    ]);
  }
  if (css.length > 20_000) {
    throw new DomainValidationError("template CSS", [
      { path: "$", code: "invalid_length", message: "Template CSS exceeds 20,000 characters" },
    ]);
  }
  const stripped = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  if (/[{}][^{}]*[{}][^{}]*[{}]/u.test(stripped.replace(/[^{}]/gu, "")) && stripped.includes("@")) {
    issue(issues, "$", "nested_rule", "Nested CSS and at-rules are not supported");
  }
  if (
    /@(?:import|charset|namespace|font-face|keyframes|supports|media|layer|page)/iu.test(stripped)
  ) {
    issue(issues, "$", "unsafe_at_rule", "CSS at-rules are forbidden");
  }

  const rules: string[] = [];
  let consumed = "";
  const rulePattern = /([^{}]+)\{([^{}]*)\}/gu;
  let ruleIndex = 0;
  for (const match of stripped.matchAll(rulePattern)) {
    consumed += match[0];
    const rawSelectors = match[1] ?? "";
    const declarations = match[2] ?? "";
    const selectors = rawSelectors
      .split(",")
      .map((selector) => validateCssSelector(selector, issues, ruleIndex))
      .filter((selector): selector is string => selector !== undefined);
    const safeDeclarations: string[] = [];
    for (const [declarationIndex, rawDeclaration] of declarations.split(";").entries()) {
      if (!rawDeclaration.trim()) continue;
      const separator = rawDeclaration.indexOf(":");
      if (separator < 1) {
        issue(
          issues,
          `$.rules[${ruleIndex}].declarations[${declarationIndex}]`,
          "invalid_declaration",
          "Invalid CSS declaration",
        );
        continue;
      }
      const property = rawDeclaration.slice(0, separator).trim().toLowerCase();
      const value = rawDeclaration.slice(separator + 1);
      if (!allowedCssProperties.has(property)) {
        issue(
          issues,
          `$.rules[${ruleIndex}].declarations[${declarationIndex}]`,
          "unsafe_property",
          `CSS property ${JSON.stringify(property)} is not allowed`,
        );
        continue;
      }
      const safeValue = validateCssValue(
        value,
        issues,
        `$.rules[${ruleIndex}].declarations[${declarationIndex}]`,
      );
      if (safeValue) safeDeclarations.push(`${property}:${safeValue}`);
    }
    if (selectors.length > 0 && safeDeclarations.length > 0) {
      const prefix = `[data-lumen-card-scope="${scope}"]`;
      rules.push(
        `${selectors.map((selector) => `${prefix} ${selector}`).join(",")}{${safeDeclarations.join(";")}}`,
      );
    }
    ruleIndex += 1;
  }
  if (stripped.replace(rulePattern, "").trim() || (consumed.length === 0 && stripped.trim())) {
    issue(issues, "$", "invalid_stylesheet", "CSS contains malformed or unsupported rules");
  }
  if (issues.length > 0) throw new DomainValidationError("template CSS", issues);
  const selector = `[data-lumen-card-scope="${scope}"]`;
  return Object.freeze({ scope, selector, css: rules.join("") });
}

export function compileTemplate(
  source: string,
  options: { readonly css?: string; readonly scope?: string } = {},
): CompiledTemplate {
  const program = parseTemplate(source);
  const style =
    options.css === undefined
      ? undefined
      : validateAndScopeTemplateCss(
          options.css,
          options.scope ?? program.fingerprint.replace(/^fnv1a-/u, "card-"),
        );
  return Object.freeze({ program, ...(style ? { style } : {}) });
}
