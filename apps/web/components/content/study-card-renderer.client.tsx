"use client";

import {
  compileTemplate,
  extractRichDocumentText,
  parseTemplate,
  renderTemplate,
  type NormalizedShape,
  type RichDocument,
  type RichNode,
  type RichTextMark,
  type StudyRendererContract,
} from "@lumen/domain";
import { Button, Input } from "@lumen/ui";
import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";

export interface RendererMediaSource {
  readonly altText: string;
  readonly id: string;
  readonly kind: "audio" | "image";
  readonly mimeType: string;
  readonly signedUrl: string;
}

const EMPTY_RENDERER_MEDIA: readonly RendererMediaSource[] = Object.freeze([]);

const subscribeToStaticBrowserCapability = () => () => undefined;

function browserTtsAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis?.speak === "function" &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

function useBrowserTtsAvailable(): boolean {
  return useSyncExternalStore(subscribeToStaticBrowserCapability, browserTtsAvailable, () => false);
}

function speakLocally(text: string, language?: string): void {
  if (!browserTtsAvailable()) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    if (language) utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Browser speech is an optional, local-only enhancement; structured text remains available.
  }
}

function rendererAssetIds(renderer: StudyRendererContract): readonly string[] {
  const values = new Set<string>();
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ["assetId", "imageAssetId", "referenceAssetId", "annotationAssetId"].includes(key) &&
        typeof child === "string"
      ) {
        values.add(child);
      }
      visit(child);
    }
  }
  visit(renderer);
  return [...values];
}

function useRendererMedia(
  renderer: StudyRendererContract,
  provided: readonly RendererMediaSource[],
): ReadonlyMap<string, RendererMediaSource> {
  const [fetched, setFetched] = useState<readonly RendererMediaSource[]>([]);
  const attempted = useRef(new Set<string>());
  const ids = useMemo(() => rendererAssetIds(renderer), [renderer]);
  useEffect(() => {
    const attemptedIds = attempted.current;
    const known = new Set([...provided, ...fetched].map((item) => item.id));
    const missing = ids.filter((id) => !known.has(id) && !attemptedIds.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => attemptedIds.add(id));
    const controller = new AbortController();
    let settled = false;
    void Promise.all(
      missing.map(async (id): Promise<RendererMediaSource | null> => {
        try {
          const response = await fetch(`/api/content/media/${encodeURIComponent(id)}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const body: unknown = await response.json();
          if (typeof body !== "object" || body === null || !("data" in body)) return null;
          const data = body.data as Readonly<Record<string, unknown>>;
          if (
            typeof data.id !== "string" ||
            (data.kind !== "audio" && data.kind !== "image") ||
            typeof data.mimeType !== "string" ||
            typeof data.signedUrl !== "string"
          )
            return null;
          return {
            altText: typeof data.altText === "string" ? data.altText : "",
            id: data.id,
            kind: data.kind,
            mimeType: data.mimeType,
            signedUrl: data.signedUrl,
          };
        } catch {
          return null;
        }
      }),
    ).then((items) => {
      settled = true;
      const available = items.filter((item): item is RendererMediaSource => item !== null);
      if (!controller.signal.aborted && available.length > 0)
        setFetched((current) => [...current, ...available]);
    });
    return () => {
      controller.abort();
      // An aborted request was not an actual failed attempt. A changed renderer
      // may therefore request the same asset again, while settled failures stay bounded.
      if (!settled) missing.forEach((id) => attemptedIds.delete(id));
    };
  }, [fetched, ids, provided]);
  return useMemo(
    () => new Map([...fetched, ...provided].map((item) => [item.id, item])),
    [fetched, provided],
  );
}

const MATH_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  alpha: "α",
  beta: "β",
  cdot: "·",
  delta: "δ",
  Delta: "Δ",
  div: "÷",
  gamma: "γ",
  Gamma: "Γ",
  ge: "≥",
  infty: "∞",
  lambda: "λ",
  le: "≤",
  mu: "μ",
  neq: "≠",
  omega: "ω",
  Omega: "Ω",
  phi: "φ",
  pi: "π",
  Pi: "Π",
  pm: "±",
  sigma: "σ",
  Sigma: "Σ",
  sqrt: "√",
  theta: "θ",
  times: "×",
});

function mathGroup(
  source: string,
  start: number,
): { readonly end: number; readonly value: string } | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return { end: index + 1, value: source.slice(start + 1, index) };
    }
  }
  return null;
}

function mathAtom(source: string, start: number): { readonly end: number; readonly value: string } {
  const grouped = mathGroup(source, start);
  if (grouped) return grouped;
  if (source[start] === "\\") {
    const command = /^\\([A-Za-z]+)/u.exec(source.slice(start));
    if (command) return { end: start + command[0].length, value: command[0] };
  }
  return { end: Math.min(start + 1, source.length), value: source[start] ?? "" };
}

function mathNodes(source: string, keyPrefix: string): readonly ReactNode[] {
  const nodes: ReactNode[] = [];
  let plain = "";
  let index = 0;
  const flush = () => {
    if (!plain) return;
    nodes.push(<span key={`${keyPrefix}-text-${String(nodes.length)}`}>{plain}</span>);
    plain = "";
  };
  while (index < source.length) {
    if (source.startsWith("\\frac", index)) {
      const numerator = mathGroup(source, index + 5);
      const denominator = numerator ? mathGroup(source, numerator.end) : null;
      if (numerator && denominator) {
        flush();
        const key = `${keyPrefix}-fraction-${String(nodes.length)}`;
        nodes.push(
          <span className="rich-math__fraction" key={key}>
            <span className="rich-math__numerator">{mathNodes(numerator.value, `${key}-n`)}</span>
            <span className="rich-math__denominator">
              {mathNodes(denominator.value, `${key}-d`)}
            </span>
          </span>,
        );
        index = denominator.end;
        continue;
      }
    }
    const character = source[index];
    if ((character === "^" || character === "_") && index + 1 < source.length) {
      const atom = mathAtom(source, index + 1);
      flush();
      const Tag = character === "^" ? "sup" : "sub";
      nodes.push(
        <Tag key={`${keyPrefix}-${Tag}-${String(nodes.length)}`}>
          {mathNodes(atom.value, `${keyPrefix}-${Tag}-${String(nodes.length)}`)}
        </Tag>,
      );
      index = atom.end;
      continue;
    }
    if (character === "\\") {
      const command = /^\\([A-Za-z]+)/u.exec(source.slice(index));
      if (command) {
        plain += MATH_COMMANDS[command[1] ?? ""] ?? command[0];
        index += command[0].length;
        continue;
      }
    }
    if (character === "{" || character === "}") {
      index += 1;
      continue;
    }
    plain += character ?? "";
    index += 1;
  }
  flush();
  return nodes;
}

function SafeMath({ block, latex }: { readonly block: boolean; readonly latex: string }) {
  const tag = block ? "div" : "span";
  return createElement(
    tag,
    {
      "aria-label": `Math expression: ${latex}`,
      className: `rich-math${block ? " rich-math--block" : ""}`,
      "data-latex": latex,
      role: "math",
    },
    <span aria-hidden="true">{mathNodes(latex, "math")}</span>,
  );
}

function markedText(text: string, marks: readonly RichTextMark[] | undefined): ReactNode {
  let output: ReactNode = text;
  for (const mark of marks ?? []) {
    if (mark.type === "bold") output = <strong>{output}</strong>;
    else if (mark.type === "italic") output = <em>{output}</em>;
    else if (mark.type === "underline") output = <u>{output}</u>;
    else if (mark.type === "strike") output = <s>{output}</s>;
    else if (mark.type === "code") output = <code>{output}</code>;
    else if (mark.type === "link")
      output = (
        <a href={mark.attrs.href} rel="nofollow noopener noreferrer" target="_blank">
          {output}
        </a>
      );
  }
  return output;
}

function richNode(
  node: RichNode,
  key: string,
  media: ReadonlyMap<string, RendererMediaSource>,
): ReactNode {
  if (node.type === "text") return <span key={key}>{markedText(node.text, node.marks)}</span>;
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;
  if (node.type === "inlineMath" || node.type === "mathBlock")
    return <SafeMath block={node.type === "mathBlock"} key={key} latex={node.attrs.latex} />;
  if (node.type === "codeBlock")
    return (
      <pre key={key}>
        <code data-language={node.attrs?.language}>
          {node.content.map((child) => markedText(child.text, child.marks))}
        </code>
      </pre>
    );
  if (node.type === "image") {
    const source = media.get(node.attrs.assetId);
    const annotation = node.attrs.annotationAssetId
      ? media.get(node.attrs.annotationAssetId)
      : undefined;
    const crop = node.attrs.crop;
    const style = {
      transform: `rotate(${String(node.attrs.rotation ?? 0)}deg)`,
      ...(crop
        ? {
            clipPath: `inset(${String(crop.y * 100)}% ${String((1 - crop.x - crop.width) * 100)}% ${String((1 - crop.y - crop.height) * 100)}% ${String(crop.x * 100)}%)`,
          }
        : {}),
    };
    return source ? (
      <span className="study-rich-image" key={key}>
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed object URL. */}
        <img alt={node.attrs.alt} src={source.signedUrl} style={style} />
        {annotation && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed object URL.
          <img
            alt=""
            aria-hidden="true"
            className="study-rich-image__annotation"
            src={annotation.signedUrl}
            style={style}
          />
        )}
      </span>
    ) : (
      <span key={key} role="img" aria-label={node.attrs.alt}>
        {node.attrs.alt}
      </span>
    );
  }
  if (node.type === "audio") {
    const source = media.get(node.attrs.assetId);
    return (
      <figure key={key}>
        {source && (
          <audio controls preload="metadata" src={source.signedUrl}>
            {node.attrs.transcript}
          </audio>
        )}
        <figcaption>{node.attrs.transcript}</figcaption>
      </figure>
    );
  }
  if (node.type === "externalVideo")
    return (
      <iframe
        key={key}
        allow="encrypted-media; picture-in-picture"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        src={node.attrs.url}
        title={node.attrs.title}
      />
    );
  const children = node.content.map((child, index) =>
    richNode(child, `${key}-${String(index)}`, media),
  );
  const attrs = node.attrs ?? {};
  const tag =
    node.type === "paragraph"
      ? "p"
      : node.type === "heading"
        ? `h${String(attrs.level ?? 2)}`
        : node.type === "bulletList" || node.type === "taskList"
          ? "ul"
          : node.type === "orderedList"
            ? "ol"
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
                        : "aside";
  return createElement(
    tag,
    {
      key,
      ...(node.type === "taskItem" ? { "data-checked": attrs.checked === true } : {}),
      ...(node.type === "callout" ? { "data-kind": attrs.kind ?? "note" } : {}),
    },
    node.type === "taskItem" ? (
      <input checked={attrs.checked === true} readOnly type="checkbox" />
    ) : null,
    children,
  );
}

export function RichDocumentView({
  document,
  media,
}: {
  readonly document: RichDocument;
  readonly media: ReadonlyMap<string, RendererMediaSource>;
}) {
  return (
    <div className="study-rich-document" lang={document.attrs?.language}>
      {document.content.map((node, index) => richNode(node, String(index), media))}
    </div>
  );
}

function shapeBounds(shape: NormalizedShape) {
  if (shape.kind === "rectangle")
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  if (shape.kind === "ellipse")
    return {
      x: shape.centerX - shape.radiusX,
      y: shape.centerY - shape.radiusY,
      width: shape.radiusX * 2,
      height: shape.radiusY * 2,
    };
  const x = Math.min(...shape.points.map((point) => point.x));
  const y = Math.min(...shape.points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...shape.points.map((point) => point.x)) - x,
    height: Math.max(...shape.points.map((point) => point.y)) - y,
  };
}

function ImageRegionSurface({
  alt,
  assetId,
  label,
  media,
  shapes,
}: {
  readonly alt: string;
  readonly assetId: string;
  readonly label: string;
  readonly media: ReadonlyMap<string, RendererMediaSource>;
  readonly shapes: readonly NormalizedShape[];
}) {
  const source = media.get(assetId);
  return (
    <figure className="study-image-region">
      <div className="study-image-region__visual">
        {source ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed object URL.
          <img alt={alt} src={source.signedUrl} />
        ) : (
          <div role="img" aria-label={alt}>
            {alt}
          </div>
        )}
        {shapes.map((shape, index) => {
          const bounds = shapeBounds(shape);
          const polygon =
            shape.kind === "polygon"
              ? shape.points
                  .map(
                    (point) =>
                      `${String(((point.x - bounds.x) / bounds.width) * 100)}% ${String(((point.y - bounds.y) / bounds.height) * 100)}%`,
                  )
                  .join(", ")
              : null;
          return (
            <span
              aria-hidden="true"
              className="study-image-region__mask"
              data-shape={shape.kind}
              key={String(index)}
              style={{
                ...(shape.kind === "ellipse" ? { borderRadius: "50%" } : {}),
                ...(polygon ? { clipPath: `polygon(${polygon})` } : {}),
                height: `${String(bounds.height * 100)}%`,
                left: `${String(bounds.x * 100)}%`,
                top: `${String(bounds.y * 100)}%`,
                width: `${String(bounds.width * 100)}%`,
              }}
            />
          );
        })}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function CustomTemplateSurface({
  media,
  renderer,
  revealed,
}: {
  readonly media: ReadonlyMap<string, RendererMediaSource>;
  readonly renderer: Extract<StudyRendererContract, { kind: "custom" }>;
  readonly revealed: boolean;
}) {
  const scope = `preview-${renderer.semanticKey.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
  const templateMedia = Object.fromEntries(
    [...media].map(([id, source]) => [
      id,
      { kind: source.kind, signedUrl: source.signedUrl } as const,
    ]),
  );
  let rendered:
    | {
        readonly html: string;
        readonly style: string | null;
      }
    | undefined;
  try {
    const front = renderTemplate(parseTemplate(renderer.template.frontTemplate), {
      fields: renderer.fields,
      media: templateMedia,
    });
    const selected = revealed
      ? renderTemplate(parseTemplate(renderer.template.backTemplate), {
          fields: renderer.fields,
          front,
          media: templateMedia,
        })
      : front;
    const style = renderer.template.stylingCss
      ? compileTemplate(renderer.template.frontTemplate, {
          css: renderer.template.stylingCss,
          scope,
        }).style
      : undefined;
    rendered = { html: selected.html, style: style?.css ?? null };
  } catch {
    rendered = undefined;
  }
  if (!rendered) return <p>{renderer.accessibility.nonvisualAlternative}</p>;
  return (
    <div data-lumen-card-scope={scope}>
      {rendered.style && <style>{rendered.style}</style>}
      {/* renderTemplate returns branded, escaped, allow-listed markup from the audited domain boundary. */}
      <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
    </div>
  );
}

function OrderingSurface({
  renderer,
  revealed,
  media,
}: {
  readonly renderer: Extract<StudyRendererContract, { kind: "ordering" }>;
  readonly revealed: boolean;
  readonly media: ReadonlyMap<string, RendererMediaSource>;
}) {
  const sourceKey = renderer.items.map((item) => item.semanticKey).join("\u001f");
  const [ordering, setOrdering] = useState(() => ({
    items: [...renderer.items].reverse(),
    sourceKey,
  }));
  const items = ordering.sourceKey === sourceKey ? ordering.items : [...renderer.items].reverse();
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!items[index] || !items[target]) return;
    const next = [...items];
    const current = next[index];
    const replacement = next[target];
    if (!current || !replacement) return;
    next[index] = replacement;
    next[target] = current;
    setOrdering({ items: next, sourceKey });
  }
  return (
    <>
      <RichDocumentView document={renderer.prompt} media={media} />
      <ol className="study-ordering">
        {(revealed ? renderer.items : items).map((item, index) => (
          <li key={item.semanticKey}>
            <RichDocumentView document={item.content} media={media} />
            {!revealed && (
              <span>
                <Button
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  size="sm"
                  variant="ghost"
                >
                  Move up
                </Button>
                <Button
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                  size="sm"
                  variant="ghost"
                >
                  Move down
                </Button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function DrawingSurface({ fallback }: { readonly fallback: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const coordinateScale = useRef(1);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      coordinateScale.current = ratio;
      const context = canvas.getContext("2d");
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (context) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 3;
      }
    }
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context || bounds.width <= 0 || bounds.height <= 0) return;
    const logicalWidth = canvas.width / coordinateScale.current;
    const logicalHeight = canvas.height / coordinateScale.current;
    const x = (event.clientX - bounds.left) * (logicalWidth / bounds.width);
    const y = (event.clientY - bounds.top) * (logicalHeight / bounds.height);
    if (!drawing.current) {
      context.beginPath();
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
      context.stroke();
    }
  }
  return (
    <div className="study-drawing">
      <canvas
        ref={canvasRef}
        aria-label="Local drawing response. This preview never uploads or saves it."
        onPointerDown={(event) => {
          drawing.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
          drawing.current = true;
        }}
        onPointerMove={(event) => {
          if (drawing.current) point(event);
        }}
        onPointerUp={(event) => {
          drawing.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          drawing.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      <Button
        onClick={() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas
            .getContext("2d")
            ?.clearRect(
              0,
              0,
              canvas.width / coordinateScale.current,
              canvas.height / coordinateScale.current,
            );
        }}
        size="sm"
        variant="secondary"
      >
        Clear local drawing
      </Button>
      <Input aria-label="Typed drawing alternative" defaultValue="" placeholder={fallback} />
    </div>
  );
}

function DrawingReferenceSurface({
  media,
  renderer,
}: {
  readonly media: ReadonlyMap<string, RendererMediaSource>;
  readonly renderer: Extract<StudyRendererContract, { kind: "drawing" }>;
}) {
  if (renderer.referenceLayers.length === 0) return null;
  return (
    <figure aria-label="Drawing reference answer" className="study-drawing-reference" role="img">
      {[...renderer.referenceLayers]
        .sort((left, right) => left.position - right.position)
        .map((layer) => {
          const source = layer.assetId ? media.get(layer.assetId) : undefined;
          return (
            <span
              aria-hidden="true"
              className="study-drawing-reference__layer"
              key={layer.semanticKey}
              style={{ opacity: layer.opacity }}
            >
              {source && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed object URL.
                <img alt="" src={source.signedUrl} />
              )}
              {layer.strokes.length > 0 && (
                <svg preserveAspectRatio="none" viewBox="0 0 1000 1000">
                  {layer.strokes.map((stroke) => (
                    <polyline
                      fill="none"
                      key={stroke.semanticKey}
                      points={stroke.points
                        .map((point) => `${String(point.x * 1_000)},${String(point.y * 1_000)}`)
                        .join(" ")}
                      stroke={stroke.color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={stroke.width}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              )}
            </span>
          );
        })}
      <figcaption>Reference drawing</figcaption>
    </figure>
  );
}

function PronunciationSurface({
  renderer,
  media,
  revealed,
}: {
  readonly renderer: Extract<StudyRendererContract, { kind: "pronunciation" }>;
  readonly media: ReadonlyMap<string, RendererMediaSource>;
  readonly revealed: boolean;
}) {
  const ttsAvailable = useBrowserTtsAvailable();
  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "requesting" | "stopping"
  >("idle");
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const recordingAttempt = useRef(0);
  const permissionPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recordingAttempt.current += 1;
      permissionPending.current = false;
      const activeRecorder = recorder.current;
      const activeStream = stream.current;
      recorder.current = null;
      stream.current = null;
      if (activeRecorder && activeRecorder.state !== "inactive") {
        try {
          activeRecorder.stop();
        } catch {
          // The stream tracks below are still stopped if the recorder changed state first.
        }
      }
      activeStream?.getTracks().forEach((track) => track.stop());
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);
  function speak() {
    if (!renderer.ttsAllowed) return;
    speakLocally(renderer.text, renderer.language);
  }
  async function toggleRecording() {
    if (recordingState === "requesting") {
      recordingAttempt.current += 1;
      permissionPending.current = false;
      setRecordingState("idle");
      setRecordingError("Microphone request canceled. No recording was saved.");
      return;
    }
    if (recordingState === "recording") {
      const activeRecorder = recorder.current;
      if (!activeRecorder || activeRecorder.state === "inactive") return;
      setRecordingState("stopping");
      try {
        activeRecorder.stop();
      } catch {
        if (recorder.current === activeRecorder) recorder.current = null;
        const activeStream = stream.current;
        stream.current = null;
        activeStream?.getTracks().forEach((track) => track.stop());
        setRecordingState("idle");
        setRecordingError("The local recording could not be finalized.");
      }
      return;
    }
    if (recordingState === "stopping") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Local microphone recording is unavailable in this browser.");
      return;
    }
    if (permissionPending.current || recorder.current || stream.current) return;
    const attempt = recordingAttempt.current + 1;
    recordingAttempt.current = attempt;
    permissionPending.current = true;
    setRecordingState("requesting");
    setRecordingError(null);
    let acquiredStream: MediaStream | null = null;
    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || recordingAttempt.current !== attempt) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const nextStream = acquiredStream;
      const nextChunks: Blob[] = [];
      const next = new MediaRecorder(nextStream);
      stream.current = nextStream;
      next.ondataavailable = (event) => {
        if (event.data.size) nextChunks.push(event.data);
      };
      next.onstop = () => {
        nextStream.getTracks().forEach((track) => track.stop());
        if (stream.current === nextStream) stream.current = null;
        if (recorder.current !== next) return;
        recorder.current = null;
        if (!mounted.current) return;
        if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
        const url = URL.createObjectURL(
          new Blob(nextChunks, { type: next.mimeType || "audio/webm" }),
        );
        localUrlRef.current = url;
        setLocalUrl(url);
        setRecordingState("idle");
      };
      recorder.current = next;
      permissionPending.current = false;
      next.start();
      setRecordingState("recording");
    } catch {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (!mounted.current || recordingAttempt.current !== attempt) return;
      recorder.current = null;
      stream.current = null;
      permissionPending.current = false;
      if (mounted.current) {
        setRecordingState("idle");
        setRecordingError("Microphone access was not granted. You can still self-review by voice.");
      }
    }
  }
  const reference = renderer.referenceAssetId ? media.get(renderer.referenceAssetId) : undefined;
  return (
    <div className="study-pronunciation">
      <p lang={renderer.language}>{renderer.text}</p>
      {reference && <audio controls src={reference.signedUrl} />}
      {renderer.ttsAllowed && (
        <>
          <Button disabled={!ttsAvailable} onClick={speak} variant="secondary">
            Play local voice
          </Button>
          {!ttsAvailable && <small>Local voice playback is unavailable in this browser.</small>}
        </>
      )}
      <Button
        disabled={recordingState === "stopping"}
        onClick={() => void toggleRecording()}
        variant={recordingState === "recording" ? "danger" : "secondary"}
      >
        {recordingState === "recording"
          ? "Stop local recording"
          : recordingState === "requesting"
            ? "Cancel microphone request"
            : recordingState === "stopping"
              ? "Finishing local recording…"
              : "Record locally"}
      </Button>
      {localUrl && (
        <audio aria-label="Your local pronunciation recording" controls src={localUrl} />
      )}
      {recordingError && <small role="status">{recordingError}</small>}
      {revealed && renderer.fallbackAnswer && (
        <p>
          <strong>Reference answer:</strong> {renderer.fallbackAnswer}
        </p>
      )}
      <small>No recording is uploaded or persisted by this preview.</small>
    </div>
  );
}

function AudioPromptSurface({
  media,
  renderer,
  revealed,
}: {
  readonly media: ReadonlyMap<string, RendererMediaSource>;
  readonly renderer: Extract<StudyRendererContract, { kind: "audio_prompt" }>;
  readonly revealed: boolean;
}) {
  const ttsAvailable = useBrowserTtsAvailable();
  const audioRef = useRef<HTMLAudioElement>(null);
  const source = media.get(renderer.assetId);
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.defaultPlaybackRate = renderer.playbackSpeed;
    audioRef.current.playbackRate = renderer.playbackSpeed;
  }, [renderer.playbackSpeed, source]);
  return (
    <>
      {source && <audio ref={audioRef} aria-label="Audio prompt" controls src={source.signedUrl} />}
      <Button
        disabled={!ttsAvailable || !renderer.transcript.trim()}
        onClick={() => speakLocally(renderer.transcript)}
        size="sm"
        variant="secondary"
      >
        Play transcript locally
      </Button>
      {!ttsAvailable && <small>Local voice playback is unavailable in this browser.</small>}
      <details>
        <summary>Transcript</summary>
        <p>{renderer.transcript}</p>
      </details>
      {revealed && <RichDocumentView document={renderer.answer} media={media} />}
    </>
  );
}

export function StudyCardRenderer({
  media: providedMedia = EMPTY_RENDERER_MEDIA,
  renderer,
  revealed,
}: {
  readonly media?: readonly RendererMediaSource[];
  readonly renderer: StudyRendererContract;
  readonly revealed: boolean;
}) {
  const media = useRendererMedia(renderer, providedMedia);
  switch (renderer.kind) {
    case "basic":
    case "basic_reversed":
    case "optional_reversed":
    case "bidirectional":
      return (
        <RichDocumentView document={revealed ? renderer.answer : renderer.prompt} media={media} />
      );
    case "custom":
      return <CustomTemplateSurface media={media} renderer={renderer} revealed={revealed} />;
    case "typed_answer":
      return (
        <>
          <RichDocumentView document={renderer.prompt} media={media} />
          {!revealed && <Input aria-label="Typed answer preview" lang={renderer.language} />}
          {revealed && <RichDocumentView document={renderer.answer} media={media} />}
        </>
      );
    case "cloze": {
      if (revealed) return <RichDocumentView document={renderer.document} media={media} />;
      const text = extractRichDocumentText(renderer.document);
      const ranges = [...renderer.activeCloze.ranges].sort((left, right) => right.from - left.from);
      const hidden = ranges.reduce(
        (value, range) =>
          `${value.slice(0, range.from)}[${renderer.activeCloze.hint ?? "…"}]${value.slice(range.to)}`,
        text,
      );
      return <p>{hidden}</p>;
    }
    case "image_occlusion": {
      const active = renderer.regions.filter(
        (region) => region.groupKey === renderer.activeGroupKey,
      );
      const masked = revealed
        ? renderer.mode === "hide_all_reveal_one"
          ? renderer.regions.filter((region) => region.groupKey !== renderer.activeGroupKey)
          : []
        : renderer.mode === "hide_all_reveal_one"
          ? renderer.regions
          : active;
      return (
        <ImageRegionSurface
          alt={renderer.imageAlt}
          assetId={renderer.imageAssetId}
          label={revealed ? active.map((region) => region.label).join(", ") : "Masked region"}
          media={media}
          shapes={masked.map((region) => region.shape)}
        />
      );
    }
    case "multiple_choice":
    case "select_all":
      return (
        <>
          <RichDocumentView document={renderer.prompt} media={media} />
          <fieldset>
            <legend className="visually-hidden">{renderer.accessibility.instructions}</legend>
            {renderer.choices.map((choice) => (
              <label className="study-choice" key={choice.semanticKey}>
                <input
                  name={renderer.generationKey}
                  type={renderer.kind === "multiple_choice" ? "radio" : "checkbox"}
                />
                <RichDocumentView document={choice.content} media={media} />
                {revealed && <strong>{choice.isCorrect ? "Correct" : "Not correct"}</strong>}
              </label>
            ))}
          </fieldset>
        </>
      );
    case "true_false":
      return (
        <>
          <RichDocumentView document={renderer.statement} media={media} />
          <div className="study-binary" role="radiogroup" aria-label="True or false">
            <label>
              <input name={renderer.generationKey} type="radio" /> True
            </label>
            <label>
              <input name={renderer.generationKey} type="radio" /> False
            </label>
          </div>
          {revealed && <strong>The statement is {renderer.answer ? "true" : "false"}.</strong>}
          {revealed && renderer.explanation && (
            <RichDocumentView document={renderer.explanation} media={media} />
          )}
        </>
      );
    case "ordering":
      return <OrderingSurface media={media} renderer={renderer} revealed={revealed} />;
    case "list_answer":
      return (
        <>
          <RichDocumentView document={renderer.prompt} media={media} />
          {renderer.items.map((item, index) =>
            revealed ? (
              <p key={item.semanticKey}>
                {String(index + 1)}. {item.answer}
              </p>
            ) : (
              <Input aria-label={`List answer ${String(index + 1)}`} key={item.semanticKey} />
            ),
          )}
        </>
      );
    case "diagram":
      return (
        <ImageRegionSurface
          alt={renderer.imageAlt}
          assetId={renderer.imageAssetId}
          label={
            revealed
              ? `${renderer.hotspot.label} — ${renderer.hotspot.altText}`
              : renderer.direction === "label_to_region"
                ? renderer.hotspot.label
                : renderer.hotspot.altText
          }
          media={media}
          shapes={
            renderer.direction === "region_to_label" || revealed ? [renderer.hotspot.shape] : []
          }
        />
      );
    case "audio_prompt":
      return <AudioPromptSurface media={media} renderer={renderer} revealed={revealed} />;
    case "pronunciation":
      return <PronunciationSurface media={media} renderer={renderer} revealed={revealed} />;
    case "drawing":
      return (
        <>
          <RichDocumentView document={renderer.prompt} media={media} />
          {revealed ? (
            <>
              <DrawingReferenceSurface media={media} renderer={renderer} />
              <p>{renderer.fallbackAnswer}</p>
            </>
          ) : (
            <DrawingSurface fallback={renderer.fallbackAnswer} />
          )}
        </>
      );
  }
}
