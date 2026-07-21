"use client";

import {
  emptyRichDocument,
  extractRichDocumentText,
  sanitizeRichDocument,
  type RichDocument,
  type RichNode,
  type RichTextMark,
} from "@lumen/domain";
import { Button, Dialog, FormField, Input, Select, Textarea } from "@lumen/ui";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { MediaUploader, type UploadedMediaAsset } from "./media-uploader.client";

export interface RichEditorProps {
  readonly document?: RichDocument;
  readonly label: string;
  readonly language?: string;
  readonly onBlur?: (document: RichDocument) => void;
  readonly onChange: (document: RichDocument) => void;
  readonly placeholder?: string;
}

type MarkType = RichTextMark["type"];

function setNodeText(element: HTMLElement, text: string): void {
  element.append(document.createTextNode(text));
}

function highlightCode(code: HTMLElement): void {
  const source = code.textContent ?? "";
  const pattern =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|default|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|of|return|switch|throw|true|try|type|typeof|undefined|var|while|yield)\b|\b\d+(?:\.\d+)?\b)/gu;
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    if (index > offset) fragment.append(document.createTextNode(source.slice(offset, index)));
    const token = match[0];
    const span = document.createElement("span");
    span.className =
      token.startsWith("//") || token.startsWith("/*") || token.startsWith("#")
        ? "syntax-comment"
        : token.startsWith('"') || token.startsWith("'") || token.startsWith("`")
          ? "syntax-string"
          : /^\d/u.test(token)
            ? "syntax-number"
            : "syntax-keyword";
    span.append(document.createTextNode(token));
    fragment.append(span);
    offset = index + token.length;
  }
  if (offset < source.length) fragment.append(document.createTextNode(source.slice(offset)));
  code.replaceChildren(fragment);
}

function highlightCodeBlocks(target: HTMLElement): void {
  for (const code of target.querySelectorAll<HTMLElement>("pre > code")) highlightCode(code);
}

function appendMarks(text: string, marks: readonly RichTextMark[] | undefined): Node {
  let node: Node = document.createTextNode(text);
  for (const mark of marks ?? []) {
    const element = document.createElement(
      mark.type === "bold"
        ? "strong"
        : mark.type === "italic"
          ? "em"
          : mark.type === "underline"
            ? "u"
            : mark.type === "strike"
              ? "s"
              : mark.type === "code"
                ? "code"
                : "a",
    );
    if (mark.type === "link") {
      element.setAttribute("href", mark.attrs.href);
      element.setAttribute("rel", "noopener noreferrer");
      if (mark.attrs.title) element.setAttribute("title", mark.attrs.title);
    }
    element.append(node);
    node = element;
  }
  return node;
}

function richNodeToDom(node: RichNode): Node {
  if (node.type === "text") return appendMarks(node.text, node.marks);
  if (node.type === "hardBreak") return document.createElement("br");
  if (node.type === "horizontalRule") return document.createElement("hr");
  if (node.type === "inlineMath" || node.type === "mathBlock") {
    const element = document.createElement(node.type === "inlineMath" ? "span" : "div");
    element.dataset.node = node.type;
    element.dataset.latex = node.attrs.latex;
    element.className = "rich-math";
    setNodeText(element, node.attrs.latex);
    return element;
  }
  if (node.type === "image") {
    const image = document.createElement("img");
    image.dataset.assetId = node.attrs.assetId;
    image.alt = node.attrs.alt;
    image.title = node.attrs.title ?? "";
    image.dataset.rotation = String(node.attrs.rotation ?? 0);
    if (node.attrs.crop) image.dataset.crop = JSON.stringify(node.attrs.crop);
    if (node.attrs.annotationAssetId)
      image.dataset.annotationAssetId = node.attrs.annotationAssetId;
    image.style.transform = `rotate(${String(node.attrs.rotation ?? 0)}deg)`;
    if (node.attrs.crop) {
      const right = 1 - node.attrs.crop.x - node.attrs.crop.width;
      const bottom = 1 - node.attrs.crop.y - node.attrs.crop.height;
      image.style.clipPath = `inset(${String(node.attrs.crop.y * 100)}% ${String(right * 100)}% ${String(bottom * 100)}% ${String(node.attrs.crop.x * 100)}%)`;
    }
    return image;
  }
  if (node.type === "audio") {
    const element = document.createElement("div");
    element.dataset.node = "audio";
    element.dataset.assetId = node.attrs.assetId;
    element.dataset.transcript = node.attrs.transcript;
    setNodeText(element, `Audio: ${node.attrs.transcript}`);
    return element;
  }
  if (node.type === "externalVideo") {
    const element = document.createElement("div");
    element.dataset.node = "externalVideo";
    element.dataset.provider = node.attrs.provider;
    element.dataset.url = node.attrs.url;
    element.dataset.title = node.attrs.title;
    const frame = document.createElement("iframe");
    frame.src = node.attrs.url;
    frame.title = node.attrs.title;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "encrypted-media; picture-in-picture";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    element.append(frame);
    return element;
  }
  if (node.type === "codeBlock") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    if (node.attrs?.language) code.dataset.language = node.attrs.language;
    for (const child of node.content) code.append(richNodeToDom(child));
    highlightCode(code);
    pre.append(code);
    return pre;
  }

  const tag =
    node.type === "paragraph"
      ? "p"
      : node.type === "heading"
        ? (`h${String(node.attrs?.level ?? 2)}` as "h1")
        : node.type === "bulletList"
          ? "ul"
          : node.type === "orderedList"
            ? "ol"
            : node.type === "taskList"
              ? "ul"
              : node.type === "listItem" || node.type === "taskItem"
                ? "li"
                : node.type === "blockquote"
                  ? "blockquote"
                  : node.type === "table"
                    ? "table"
                    : node.type === "tableRow"
                      ? "tr"
                      : node.type === "tableCell"
                        ? "td"
                        : node.type === "tableHeader"
                          ? "th"
                          : "div";
  const element = document.createElement(tag);
  if (["callout", "citation"].includes(node.type)) element.dataset.node = node.type;
  if (node.type === "callout") {
    element.dataset.kind = String(node.attrs?.kind ?? "note");
    if (node.attrs?.title) element.dataset.title = String(node.attrs.title);
  }
  if (node.type === "citation") {
    if (node.attrs?.source) element.dataset.source = String(node.attrs.source);
    if (node.attrs?.url) element.dataset.url = String(node.attrs.url);
  }
  if (node.type === "taskList") element.dataset.taskList = "true";
  if (node.type === "taskItem") element.dataset.checked = String(node.attrs?.checked === true);
  for (const child of node.content) element.append(richNodeToDom(child));
  return element;
}

function renderDocument(target: HTMLElement, value: RichDocument): void {
  const fragment = document.createDocumentFragment();
  for (const node of value.content) fragment.append(richNodeToDom(node));
  target.replaceChildren(fragment);
}

async function hydratePrivateMedia(target: HTMLElement, signal: AbortSignal): Promise<void> {
  const elements = Array.from(target.querySelectorAll<HTMLElement>("[data-asset-id]")).filter(
    (element) => !element.dataset.mediaHydrated,
  );
  const byAsset = new Map<string, HTMLElement[]>();
  for (const element of elements) {
    const assetId = element.dataset.assetId;
    if (assetId) byAsset.set(assetId, [...(byAsset.get(assetId) ?? []), element]);
  }
  await Promise.all(
    [...byAsset].map(async ([assetId, assetElements]) => {
      try {
        const response = await fetch(`/api/content/media/${encodeURIComponent(assetId)}`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const payload =
          typeof body === "object" && body !== null && "data" in body
            ? (body.data as Readonly<Record<string, unknown>>)
            : null;
        const signedUrl = typeof payload?.signedUrl === "string" ? payload.signedUrl : null;
        if (!signedUrl) return;
        for (const element of assetElements) {
          element.dataset.mediaHydrated = "true";
          if (element instanceof HTMLImageElement) {
            element.src = signedUrl;
          } else if (element.dataset.node === "audio" && !element.querySelector("audio")) {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "metadata";
            audio.src = signedUrl;
            element.prepend(audio);
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) return;
      }
    }),
  );
}

function marksWith(marks: readonly RichTextMark[], mark: RichTextMark): readonly RichTextMark[] {
  return [...marks.filter((candidate) => candidate.type !== mark.type), mark];
}

function elementMark(element: Element): RichTextMark | null {
  const tag = element.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") return { type: "bold" };
  if (tag === "em" || tag === "i") return { type: "italic" };
  if (tag === "u") return { type: "underline" };
  if (tag === "s" || tag === "strike") return { type: "strike" };
  if (tag === "code" && element.parentElement?.tagName.toLowerCase() !== "pre") {
    return { type: "code" };
  }
  if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    try {
      const url = new URL(href, window.location.origin);
      if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return null;
      return {
        type: "link",
        attrs: {
          href: url.toString(),
          ...(element.getAttribute("title") ? { title: element.getAttribute("title") ?? "" } : {}),
        },
      };
    } catch {
      return null;
    }
  }
  return null;
}

function inlineNodes(node: Node, marks: readonly RichTextMark[] = []): readonly unknown[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
  }
  if (!(node instanceof Element)) return [];
  if (node.getAttribute("data-node") === "inlineMath") {
    return [
      {
        type: "inlineMath",
        attrs: { latex: node.getAttribute("data-latex") ?? node.textContent ?? "" },
      },
    ];
  }
  if (node.tagName.toLowerCase() === "br") return [{ type: "hardBreak" }];
  const mark = elementMark(node);
  const nextMarks = mark ? marksWith(marks, mark) : marks;
  return Array.from(node.childNodes).flatMap((child) => inlineNodes(child, nextMarks));
}

function parseDataJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function blockNode(element: Element): unknown | null {
  const tag = element.tagName.toLowerCase();
  if (tag === "hr") return { type: "horizontalRule" };
  if (tag === "img") {
    const assetId = element.getAttribute("data-asset-id");
    if (!assetId) return null;
    return {
      type: "image",
      attrs: {
        assetId,
        alt: element.getAttribute("alt") ?? "",
        rotation: Number(element.getAttribute("data-rotation") ?? 0),
        ...(element.getAttribute("data-crop")
          ? { crop: parseDataJson(element.getAttribute("data-crop")) }
          : {}),
        ...(element.getAttribute("data-annotation-asset-id")
          ? { annotationAssetId: element.getAttribute("data-annotation-asset-id") }
          : {}),
        ...(element.getAttribute("title") ? { title: element.getAttribute("title") } : {}),
      },
    };
  }
  const special = element.getAttribute("data-node");
  if (special === "inlineMath" || special === "mathBlock") {
    return {
      type: special,
      attrs: { latex: element.getAttribute("data-latex") ?? element.textContent ?? "" },
    };
  }
  if (special === "audio") {
    return {
      type: "audio",
      attrs: {
        assetId: element.getAttribute("data-asset-id") ?? "missing",
        transcript: element.getAttribute("data-transcript") ?? element.textContent ?? "",
      },
    };
  }
  if (special === "externalVideo") {
    return {
      type: "externalVideo",
      attrs: {
        privacyEnhanced: true,
        provider: element.getAttribute("data-provider") ?? "youtube_nocookie",
        title: element.getAttribute("data-title") ?? "External video",
        url: element.getAttribute("data-url") ?? "",
      },
    };
  }
  if (tag === "pre") {
    const code = element.querySelector(":scope > code") ?? element;
    return {
      type: "codeBlock",
      ...(code.getAttribute("data-language")
        ? { attrs: { language: code.getAttribute("data-language") } }
        : {}),
      content: inlineNodes(code),
    };
  }
  const type =
    tag === "p" || tag === "div"
      ? special === "callout" || special === "citation"
        ? special
        : "paragraph"
      : /^h[1-6]$/u.test(tag)
        ? "heading"
        : tag === "ul"
          ? element.hasAttribute("data-task-list")
            ? "taskList"
            : "bulletList"
          : tag === "ol"
            ? "orderedList"
            : tag === "li"
              ? element.hasAttribute("data-checked")
                ? "taskItem"
                : "listItem"
              : tag === "blockquote"
                ? "blockquote"
                : tag === "table"
                  ? "table"
                  : tag === "tbody"
                    ? null
                    : tag === "tr"
                      ? "tableRow"
                      : tag === "td"
                        ? "tableCell"
                        : tag === "th"
                          ? "tableHeader"
                          : null;
  if (!type) return null;
  const containerTags = new Set(["ul", "ol", "li", "table", "tbody", "tr", "td", "th"]);
  const content = containerTags.has(tag)
    ? Array.from(element.childNodes).flatMap((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          return child.textContent?.trim() ? inlineNodes(child) : [];
        }
        if (!(child instanceof Element)) return [];
        if (child.tagName.toLowerCase() === "tbody")
          return Array.from(child.childNodes).flatMap((bodyChild) => {
            if (!(bodyChild instanceof Element)) return [];
            const bodyResult = blockNode(bodyChild);
            return bodyResult ? [bodyResult] : [];
          });
        const result = blockNode(child);
        return result ? [result] : inlineNodes(child);
      })
    : inlineNodes(element);
  const attrs =
    type === "heading"
      ? { level: Number(tag.slice(1)) }
      : type === "taskItem"
        ? { checked: element.getAttribute("data-checked") === "true" }
        : type === "callout"
          ? {
              kind: element.getAttribute("data-kind") ?? "note",
              ...(element.getAttribute("data-title")
                ? { title: element.getAttribute("data-title") }
                : {}),
            }
          : type === "citation"
            ? {
                ...(element.getAttribute("data-source")
                  ? { source: element.getAttribute("data-source") }
                  : {}),
                ...(element.getAttribute("data-url")
                  ? { url: element.getAttribute("data-url") }
                  : {}),
              }
            : undefined;
  return { type, ...(attrs ? { attrs } : {}), content };
}

function serializeEditor(element: HTMLElement, language?: string): RichDocument {
  const content = Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      return text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [];
    }
    if (!(node instanceof Element)) return [];
    const block = blockNode(node);
    return block ? [block] : [];
  });
  return sanitizeRichDocument({
    type: "doc",
    schemaVersion: 2,
    ...(language ? { attrs: { language } } : {}),
    content,
  }).document;
}

type InsertionPlacement = "block" | "inline";

function rangeIsInside(range: Range, editor: HTMLElement): boolean {
  const contains = (node: Node) => node === editor || editor.contains(node);
  return contains(range.startContainer) && contains(range.endContainer);
}

function directEditorChild(editor: HTMLElement, node: Node): ChildNode | null {
  if (node === editor) return null;
  let candidate: Node | null = node;
  while (candidate?.parentNode && candidate.parentNode !== editor) candidate = candidate.parentNode;
  return candidate?.parentNode === editor ? (candidate as ChildNode) : null;
}

function isSplittableTextBlock(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName.toLowerCase();
  return (
    tag === "p" ||
    tag === "blockquote" ||
    /^h[1-6]$/u.test(tag) ||
    (tag === "div" && ["callout", "citation"].includes(node.dataset.node ?? ""))
  );
}

function inlineContainer(node: Node, editor: HTMLElement): HTMLElement | null {
  let candidate = node instanceof HTMLElement ? node : node.parentElement;
  while (candidate && candidate !== editor) {
    if (isSplittableTextBlock(candidate)) return candidate;
    candidate = candidate.parentElement;
  }
  return null;
}

function selectRange(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertNodeAtSelection(
  node: Node,
  fallback: HTMLElement | null,
  placement: InsertionPlacement,
  preferredRange?: Range | null,
): Range | null {
  if (!fallback) return null;
  const insertedNodes =
    node instanceof DocumentFragment ? Array.from(node.childNodes) : ([node] as const);
  if (insertedNodes.length === 0) return null;

  const selection = window.getSelection();
  const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const range =
    preferredRange && rangeIsInside(preferredRange, fallback)
      ? preferredRange.cloneRange()
      : selectedRange && rangeIsInside(selectedRange, fallback)
        ? selectedRange.cloneRange()
        : null;

  if (!range) {
    if (placement === "inline") {
      const lastChild = fallback.lastChild;
      const container =
        lastChild instanceof HTMLElement && isSplittableTextBlock(lastChild) ? lastChild : null;
      const paragraph = container ?? document.createElement("p");
      if (!container) fallback.append(paragraph);
      paragraph.append(node);
    } else {
      fallback.append(node);
    }
    const caret = document.createRange();
    caret.setStartAfter(insertedNodes.at(-1) ?? fallback);
    caret.collapse(true);
    selectRange(caret);
    return caret;
  }

  if (placement === "inline") {
    const startContainer = inlineContainer(range.startContainer, fallback);
    const endContainer = inlineContainer(range.endContainer, fallback);
    if (startContainer && startContainer === endContainer) {
      range.deleteContents();
      range.insertNode(node);
      const caret = document.createRange();
      caret.setStartAfter(insertedNodes.at(-1) ?? startContainer);
      caret.collapse(true);
      selectRange(caret);
      return caret;
    }

    range.deleteContents();
    const paragraph = document.createElement("p");
    paragraph.append(node);
    if (range.startContainer === fallback) {
      fallback.insertBefore(paragraph, fallback.childNodes.item(range.startOffset));
    } else {
      const rootChild = directEditorChild(fallback, range.startContainer);
      fallback.insertBefore(paragraph, rootChild?.nextSibling ?? null);
    }
    const caret = document.createRange();
    caret.selectNodeContents(paragraph);
    caret.collapse(false);
    selectRange(caret);
    return caret;
  }

  range.deleteContents();
  if (range.startContainer === fallback) {
    fallback.insertBefore(node, fallback.childNodes.item(range.startOffset));
    const caret = document.createRange();
    caret.setStartAfter(insertedNodes.at(-1) ?? fallback);
    caret.collapse(true);
    selectRange(caret);
    return caret;
  }

  const rootChild = directEditorChild(fallback, range.startContainer);
  if (rootChild instanceof HTMLElement && isSplittableTextBlock(rootChild)) {
    const trailingRange = document.createRange();
    trailingRange.setStart(range.startContainer, range.startOffset);
    trailingRange.setEnd(rootChild, rootChild.childNodes.length);
    const trailingBlock = rootChild.cloneNode(false) as HTMLElement;
    trailingBlock.append(trailingRange.extractContents());
    const reference = rootChild.nextSibling;
    fallback.insertBefore(node, reference);
    fallback.insertBefore(trailingBlock, reference);
    const caret = document.createRange();
    caret.selectNodeContents(trailingBlock);
    caret.collapse(true);
    selectRange(caret);
    return caret;
  }

  fallback.insertBefore(node, rootChild?.nextSibling ?? null);
  const caret = document.createRange();
  caret.setStartAfter(insertedNodes.at(-1) ?? fallback);
  caret.collapse(true);
  selectRange(caret);
  return caret;
}

export function RichEditor({
  document: initialDocument,
  label,
  language,
  onBlur,
  onChange,
  placeholder = "Write here…",
}: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [counts, setCounts] = useState(() => {
    const text = extractRichDocumentText(initialDocument ?? emptyRichDocument(language));
    return { characters: text.length, words: text ? text.split(/\s+/u).filter(Boolean).length : 0 };
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<UploadedMediaAsset | null>(null);
  const [annotationImage, setAnnotationImage] = useState<UploadedMediaAsset | null>(null);
  const [imageRotation, setImageRotation] = useState<0 | 90 | 180 | 270>(0);
  const [imageCrop, setImageCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [mathKind, setMathKind] = useState<"inlineMath" | "mathBlock" | null>(null);
  const currentRef = useRef(initialDocument ?? emptyRichDocument(language));
  const selectionRef = useRef<Range | null>(null);
  const contentLanguage = language ?? initialDocument?.attrs?.language;

  const rememberSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (rangeIsInside(range, editor)) selectionRef.current = range.cloneRange();
  }, []);

  function insertAtSelection(node: Node, placement: InsertionPlacement) {
    selectionRef.current = insertNodeAtSelection(
      node,
      editorRef.current,
      placement,
      selectionRef.current,
    );
  }

  const synchronize = useCallback(() => {
    if (!editorRef.current) return currentRef.current;
    const value = serializeEditor(
      editorRef.current,
      language ?? currentRef.current.attrs?.language,
    );
    currentRef.current = value;
    const text = extractRichDocumentText(value);
    setCounts({
      characters: text.length,
      words: text ? text.split(/\s+/u).filter(Boolean).length : 0,
    });
    onChange(value);
    return value;
  }, [language, onChange]);

  useEffect(() => {
    const value = initialDocument ?? emptyRichDocument(language);
    const target = editorRef.current;
    if (!target) return;
    if (currentRef.current !== value || target.childNodes.length === 0) {
      currentRef.current = value;
      renderDocument(target, value);
    }
    const controller = new AbortController();
    void hydratePrivateMedia(target, controller.signal);
    return () => controller.abort();
  }, [initialDocument, language]);

  function command(name: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    synchronize();
  }

  function wrapInlineCode() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) {
      editorRef.current?.focus();
      return;
    }
    const range = selection.getRangeAt(0);
    const code = document.createElement("code");
    code.append(range.extractContents());
    range.insertNode(code);
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
    synchronize();
  }

  function insertCodeBlock(languageValue: string, source: string) {
    if (!source.trim()) return;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const languageName = languageValue
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_+-]/gu, "");
    if (languageName) code.dataset.language = languageName;
    code.append(document.createTextNode(source));
    highlightCode(code);
    pre.append(code);
    insertAtSelection(pre, "block");
    setCodeOpen(false);
    synchronize();
  }

  function insertSpecial(type: "callout" | "citation" | "hint" | "mathBlock" | "table") {
    if (type === "table") {
      const table = document.createElement("table");
      const body = document.createElement("tbody");
      for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
        const row = document.createElement("tr");
        for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
          const cell = document.createElement(rowIndex === 0 ? "th" : "td");
          cell.textContent = rowIndex === 0 ? `Heading ${String(columnIndex + 1)}` : "Cell";
          row.append(cell);
        }
        body.append(row);
      }
      table.append(body);
      insertAtSelection(table, "block");
    } else if (type === "mathBlock") {
      const block = document.createElement("div");
      block.dataset.node = "mathBlock";
      block.dataset.latex = "x^2";
      block.textContent = "x^2";
      insertAtSelection(block, "block");
    } else {
      const block = document.createElement("div");
      block.dataset.node = type === "hint" ? "callout" : type;
      if (type === "hint") block.dataset.kind = "hint";
      block.textContent = type === "citation" ? "Source or citation" : "Add helpful context";
      insertAtSelection(block, "block");
    }
    setCommandOpen(false);
    synchronize();
  }

  function insertImage() {
    if (!pendingImage) return;
    const image = document.createElement("img");
    image.dataset.assetId = pendingImage.id;
    image.alt = pendingImage.altText;
    image.dataset.rotation = String(imageRotation);
    image.dataset.crop = JSON.stringify(imageCrop);
    image.style.transform = `rotate(${String(imageRotation)}deg)`;
    const cropRight = 1 - imageCrop.x - imageCrop.width;
    const cropBottom = 1 - imageCrop.y - imageCrop.height;
    image.style.clipPath = `inset(${String(imageCrop.y * 100)}% ${String(cropRight * 100)}% ${String(cropBottom * 100)}% ${String(imageCrop.x * 100)}%)`;
    if (annotationImage) image.dataset.annotationAssetId = annotationImage.id;
    if (pendingImage.signedUrl) image.src = pendingImage.signedUrl;
    insertAtSelection(image, "block");
    setImageOpen(false);
    setPendingImage(null);
    setAnnotationImage(null);
    setImageRotation(0);
    setImageCrop({ x: 0, y: 0, width: 1, height: 1 });
    synchronize();
  }

  function insertMath(latex: string) {
    if (!mathKind || !latex.trim()) return;
    const element = document.createElement(mathKind === "inlineMath" ? "span" : "div");
    element.dataset.node = mathKind;
    element.dataset.latex = latex.trim();
    element.className = "rich-math";
    element.textContent = latex.trim();
    insertAtSelection(element, mathKind === "inlineMath" ? "inline" : "block");
    setMathKind(null);
    synchronize();
  }

  function insertTaskList() {
    const list = document.createElement("ul");
    list.dataset.taskList = "true";
    const item = document.createElement("li");
    item.dataset.checked = "false";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Task";
    item.append(paragraph);
    list.append(item);
    insertAtSelection(list, "block");
    setCommandOpen(false);
    synchronize();
  }

  function insertDivider() {
    insertAtSelection(document.createElement("hr"), "block");
    setCommandOpen(false);
    synchronize();
  }

  function insertAudio(asset: UploadedMediaAsset) {
    const element = document.createElement("div");
    element.dataset.node = "audio";
    element.dataset.assetId = asset.id;
    element.dataset.transcript = asset.transcript;
    element.textContent = `Audio: ${asset.transcript}`;
    insertAtSelection(element, "block");
    setAudioOpen(false);
    synchronize();
  }

  function insertVideo(rawUrl: string, title: string) {
    try {
      const source = new URL(rawUrl);
      let provider: "vimeo" | "youtube_nocookie";
      let url: URL;
      if (["youtu.be", "www.youtube.com", "youtube.com"].includes(source.hostname)) {
        const videoId =
          source.hostname === "youtu.be" ? source.pathname.slice(1) : source.searchParams.get("v");
        if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/u.test(videoId)) return;
        provider = "youtube_nocookie";
        url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
      } else if (["vimeo.com", "www.vimeo.com"].includes(source.hostname)) {
        const videoId = source.pathname.split("/").filter(Boolean)[0];
        if (!videoId || !/^\d{5,12}$/u.test(videoId)) return;
        provider = "vimeo";
        url = new URL(`https://player.vimeo.com/video/${videoId}`);
      } else {
        return;
      }
      const element = document.createElement("div");
      element.dataset.node = "externalVideo";
      element.dataset.provider = provider;
      element.dataset.url = url.toString();
      element.dataset.title = title.trim();
      element.textContent = `Video: ${title.trim()}`;
      insertAtSelection(element, "block");
      setVideoOpen(false);
      synchronize();
    } catch {
      return;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const plain = event.clipboardData.getData("text/plain").slice(0, 100_000);
    if (!html) {
      document.execCommand("insertText", false, plain);
      synchronize();
      return;
    }
    const parsed = new DOMParser().parseFromString(html.slice(0, 250_000), "text/html");
    const raw = Array.from(parsed.body.children).map(blockNode).filter(Boolean);
    const safe = sanitizeRichDocument({ type: "doc", schemaVersion: 2, content: raw }).document;
    const fragment = document.createDocumentFragment();
    for (const node of safe.content) fragment.append(richNodeToDom(node));
    insertAtSelection(fragment, "block");
    synchronize();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    rememberSelection();
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      setCommandOpen(true);
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "7") {
      event.preventDefault();
      command("insertOrderedList");
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "8") {
      event.preventDefault();
      command("insertUnorderedList");
    }
    if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const selection = window.getSelection();
      const block =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode.closest("p,div")
          : selection?.anchorNode?.parentElement?.closest("p,div");
      const shortcut = block?.textContent?.trim();
      if (shortcut === "#" || shortcut === "##" || shortcut === "###") {
        event.preventDefault();
        if (block) block.textContent = "";
        command("formatBlock", shortcut === "#" ? "h1" : shortcut === "##" ? "h2" : "h3");
      } else if (shortcut === "-" || shortcut === "*") {
        event.preventDefault();
        if (block) block.textContent = "";
        command("insertUnorderedList");
      } else if (shortcut === "1.") {
        event.preventDefault();
        if (block) block.textContent = "";
        command("insertOrderedList");
      } else if (shortcut === ">") {
        event.preventDefault();
        if (block) block.textContent = "";
        command("formatBlock", "blockquote");
      }
    }
  }

  return (
    <div className="rich-editor">
      <span className="visually-hidden" id={labelId}>
        {label}
      </span>
      <div
        className="rich-editor__toolbar"
        onMouseDownCapture={rememberSelection}
        role="toolbar"
        aria-label={`${label} formatting`}
      >
        <button
          aria-label="Bold"
          onClick={() => command("bold")}
          title="Bold (Ctrl+B)"
          type="button"
        >
          <b>B</b>
        </button>
        <button
          aria-label="Italic"
          onClick={() => command("italic")}
          title="Italic (Ctrl+I)"
          type="button"
        >
          <i>I</i>
        </button>
        <button aria-label="Underline" onClick={() => command("underline")} type="button">
          <u>U</u>
        </button>
        <button aria-label="Strike through" onClick={() => command("strikeThrough")} type="button">
          <s>S</s>
        </button>
        <button aria-label="Heading" onClick={() => command("formatBlock", "h2")} type="button">
          H2
        </button>
        <button
          aria-label="Bulleted list"
          onClick={() => command("insertUnorderedList")}
          type="button"
        >
          • list
        </button>
        <button
          aria-label="Numbered list"
          onClick={() => command("insertOrderedList")}
          type="button"
        >
          1. list
        </button>
        <button
          aria-label="Block quote"
          onClick={() => command("formatBlock", "blockquote")}
          type="button"
        >
          ❞
        </button>
        <button
          aria-label="Inline code"
          onClick={wrapInlineCode}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          &lt;/&gt;
        </button>
        <button aria-label="Insert link" onClick={() => setLinkOpen(true)} type="button">
          Link
        </button>
        <button aria-label="Undo" onClick={() => command("undo")} type="button">
          ↶
        </button>
        <button aria-label="Redo" onClick={() => command("redo")} type="button">
          ↷
        </button>
        <button
          aria-label="Open insert command palette"
          onClick={() => setCommandOpen(true)}
          type="button"
        >
          + block
        </button>
      </div>
      <div
        ref={editorRef}
        aria-describedby={`${labelId}-help`}
        aria-labelledby={labelId}
        className="rich-editor__content"
        contentEditable
        data-placeholder={placeholder}
        lang={contentLanguage}
        onBlur={() => {
          rememberSelection();
          const value = synchronize();
          if (editorRef.current) highlightCodeBlocks(editorRef.current);
          onBlur?.(value);
        }}
        onInput={() => {
          rememberSelection();
          synchronize();
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={rememberSelection}
        role="textbox"
        spellCheck
        suppressContentEditableWarning
      />
      <div className="rich-editor__footer" id={`${labelId}-help`}>
        <span>Ctrl/⌘ K opens blocks · Markdown-style shortcuts supported by the toolbar</span>
        <span aria-live="polite">
          {counts.words} words · {counts.characters} characters
        </span>
      </div>

      <Dialog
        description="Choose the kind of content you want to add."
        onOpenChange={setCommandOpen}
        open={commandOpen}
        title="Insert block"
      >
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => insertSpecial("table")} variant="secondary">
            Table
          </Button>
          <Button
            onClick={() => {
              setCommandOpen(false);
              setCodeOpen(true);
            }}
            variant="secondary"
          >
            Code block
          </Button>
          <Button
            onClick={() => {
              setCommandOpen(false);
              setMathKind("mathBlock");
            }}
            variant="secondary"
          >
            Math block
          </Button>
          <Button
            onClick={() => {
              setCommandOpen(false);
              setMathKind("inlineMath");
            }}
            variant="secondary"
          >
            Inline math
          </Button>
          <Button onClick={insertTaskList} variant="secondary">
            Task list
          </Button>
          <Button onClick={() => insertSpecial("hint")} variant="secondary">
            Hint
          </Button>
          <Button onClick={() => insertSpecial("callout")} variant="secondary">
            Callout
          </Button>
          <Button onClick={() => insertSpecial("citation")} variant="secondary">
            Citation
          </Button>
          <Button onClick={insertDivider} variant="secondary">
            Divider
          </Button>
          <Button onClick={() => command("formatBlock", "h3")} variant="secondary">
            Subheading
          </Button>
          <Button
            onClick={() => {
              setCommandOpen(false);
              setImageOpen(true);
            }}
            variant="secondary"
          >
            Image
          </Button>
          <Button
            onClick={() => {
              setCommandOpen(false);
              setAudioOpen(true);
            }}
            variant="secondary"
          >
            Audio
          </Button>
          <Button
            onClick={() => {
              setCommandOpen(false);
              setVideoOpen(true);
            }}
            variant="secondary"
          >
            External video
          </Button>
        </div>
      </Dialog>

      <Dialog
        description="Code is stored as text with a language hint. Highlight spans are generated locally and never persisted as trusted HTML."
        onOpenChange={setCodeOpen}
        open={codeOpen}
        title="Insert highlighted code"
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            insertCodeBlock(String(data.get("language") ?? ""), String(data.get("source") ?? ""));
          }}
        >
          <FormField label="Language">
            <Input autoComplete="off" maxLength={32} name="language" placeholder="typescript" />
          </FormField>
          <FormField label="Source code" required>
            <Textarea name="source" required rows={10} spellCheck={false} />
          </FormField>
          <Button type="submit">Insert code block</Button>
        </form>
      </Dialog>

      <Dialog
        description="Upload a private image explicitly, then choose a normalized crop, rotation, and optional annotation overlay. Alt text is required."
        onOpenChange={setImageOpen}
        open={imageOpen}
        title="Insert image"
      >
        <div className="grid gap-5">
          <MediaUploader kind="image" label="Image file" onUploaded={setPendingImage} />
          {pendingImage && (
            <>
              <FormField label="Rotation">
                <Select
                  onValueChange={(value) => setImageRotation(Number(value) as 0 | 90 | 180 | 270)}
                  options={[
                    { label: "No rotation", value: "0" },
                    { label: "90° clockwise", value: "90" },
                    { label: "180°", value: "180" },
                    { label: "270° clockwise", value: "270" },
                  ]}
                  value={String(imageRotation)}
                />
              </FormField>
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="col-span-2 text-sm font-bold">Normalized crop</legend>
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <FormField key={key} label={key.toUpperCase()}>
                    <Input
                      max={1}
                      min={0}
                      onChange={(event) =>
                        setImageCrop((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                      step={0.05}
                      type="number"
                      value={imageCrop[key]}
                    />
                  </FormField>
                ))}
              </fieldset>
              <MediaUploader
                kind="image"
                label="Optional annotation overlay"
                onUploaded={setAnnotationImage}
              />
              <Button
                disabled={
                  imageCrop.width <= 0 ||
                  imageCrop.height <= 0 ||
                  imageCrop.x + imageCrop.width > 1 ||
                  imageCrop.y + imageCrop.height > 1
                }
                onClick={insertImage}
              >
                Insert prepared image
              </Button>
            </>
          )}
        </div>
      </Dialog>

      <Dialog
        description="Audio stays local until Upload and attach is selected. The transcript becomes the non-audio fallback."
        onOpenChange={setAudioOpen}
        open={audioOpen}
        title="Insert audio"
      >
        <MediaUploader kind="audio" label="Audio attachment" onUploaded={insertAudio} />
      </Dialog>

      <Dialog
        description="Only ordinary YouTube or Vimeo links are accepted and converted to privacy-enhanced player URLs. No iframe HTML is stored."
        onOpenChange={setVideoOpen}
        open={videoOpen}
        title="Insert external video"
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            insertVideo(String(data.get("url") ?? ""), String(data.get("title") ?? ""));
          }}
        >
          <FormField label="Video title" required>
            <Input maxLength={256} name="title" required />
          </FormField>
          <FormField label="YouTube or Vimeo URL" required>
            <Input name="url" placeholder="https://www.youtube.com/watch?v=…" required type="url" />
          </FormField>
          <Button type="submit">Insert privacy-enhanced reference</Button>
        </form>
      </Dialog>

      <Dialog
        description="LaTeX is stored as structured text and rendered by the study surface without executing user code."
        onOpenChange={(open) => {
          if (!open) setMathKind(null);
        }}
        open={mathKind !== null}
        title={mathKind === "inlineMath" ? "Insert inline math" : "Insert math block"}
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            insertMath(String(new FormData(event.currentTarget).get("latex") ?? ""));
          }}
        >
          <FormField label="LaTeX" required>
            <Input
              autoComplete="off"
              maxLength={10_000}
              name="latex"
              placeholder="x^2 + y^2 = r^2"
              required
            />
          </FormField>
          <Button type="submit">Insert math</Button>
        </form>
      </Dialog>

      <Dialog
        description="Only http, https, mailto, and tel links survive validation."
        onOpenChange={setLinkOpen}
        open={linkOpen}
        title="Add a safe link"
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const href = String(new FormData(event.currentTarget).get("href") ?? "");
            try {
              const url = new URL(href);
              if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return;
              command("createLink", url.toString());
              setLinkOpen(false);
            } catch {
              return;
            }
          }}
        >
          <FormField label="Link address" required>
            <Input
              autoFocus
              name="href"
              placeholder="https://example.com/source"
              required
              type="url"
            />
          </FormField>
          <Button type="submit">Add link</Button>
        </form>
      </Dialog>
    </div>
  );
}

void ("bold" satisfies MarkType);
