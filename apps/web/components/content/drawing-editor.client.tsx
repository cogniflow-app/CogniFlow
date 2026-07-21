"use client";

import type { DrawingPoint, DrawingStroke } from "@lumen/domain";
import { Button, FormField, Input } from "@lumen/ui";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

interface DrawingEditorProps {
  readonly onChange: (strokes: readonly DrawingStroke[]) => void;
  readonly onTypedFallbackChange: (value: string) => void;
  readonly strokes: readonly DrawingStroke[];
  readonly typedFallback: string;
  readonly typedFallbackError?: string | undefined;
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: readonly DrawingStroke[]): void {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    context.beginPath();
    context.strokeStyle = stroke.color;
    context.lineWidth = Math.max(0.25, stroke.width);
    context.moveTo(first.x * bounds.width, first.y * bounds.height);
    for (const point of stroke.points.slice(1)) {
      context.lineTo(point.x * bounds.width, point.y * bounds.height);
    }
    context.stroke();
  }
}

export function DrawingEditor({
  onChange,
  onTypedFallbackChange,
  strokes,
  typedFallback,
  typedFallbackError,
}: DrawingEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<DrawingStroke | null>(null);
  const startedAtRef = useRef(0);
  const [redo, setRedo] = useState<readonly DrawingStroke[]>([]);
  const [color, setColor] = useState("#3157d5");
  const [width, setWidth] = useState(4);

  const render = useCallback(() => {
    if (canvasRef.current) drawStrokes(canvasRef.current, strokes);
  }, [strokes]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(render);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [render]);

  function point(event: PointerEvent<HTMLCanvasElement>): DrawingPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      pressure: event.pressure || 0.5,
      timeOffsetMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
    };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    startedAtRef.current = performance.now();
    activeRef.current = {
      color,
      points: [point(event)],
      semanticKey: crypto.randomUUID(),
      width,
    };
    setRedo([]);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    activeRef.current = {
      ...activeRef.current,
      points: [...activeRef.current.points, point(event)],
    };
    drawStrokes(event.currentTarget, [...strokes, activeRef.current]);
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const completed = activeRef.current;
    activeRef.current = null;
    if (completed.points.length > 1) onChange([...strokes, completed]);
    else render();
  }

  function undo() {
    const last = strokes.at(-1);
    if (!last) return;
    onChange(strokes.slice(0, -1));
    setRedo((current) => [last, ...current]);
  }

  function redoStroke() {
    const next = redo[0];
    if (!next) return;
    onChange([...strokes, next]);
    setRedo((current) => current.slice(1));
  }

  return (
    <div className="drawing-author">
      <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools">
        <label className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-bold">
          Ink
          <input
            aria-label="Ink color"
            onChange={(event) => setColor(event.target.value)}
            type="color"
            value={color}
          />
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-bold">
          Width
          <input
            aria-label="Stroke width"
            max={12}
            min={1}
            onChange={(event) => setWidth(Number(event.target.value))}
            type="range"
            value={width}
          />
        </label>
        <button disabled={strokes.length === 0} onClick={undo} type="button">
          Undo
        </button>
        <button disabled={redo.length === 0} onClick={redoStroke} type="button">
          Redo
        </button>
        <button
          disabled={strokes.length === 0}
          onClick={() => {
            setRedo(strokes);
            onChange([]);
          }}
          type="button"
        >
          Clear
        </button>
      </div>
      <div className="drawing-stage">
        <canvas
          ref={canvasRef}
          aria-label="Drawing response canvas. A typed alternative is required below."
          onPointerCancel={finish}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={finish}
          role="img"
        />
      </div>
      <p className="m-0 text-xs text-[var(--color-text-muted)]">
        {strokes.length} saved {strokes.length === 1 ? "stroke" : "strokes"}. Strokes use normalized
        vector coordinates and are saved only with the note.
      </p>
      <FormField
        label="Typed or nonvisual alternative"
        description="Describe the intended drawing so the card can be completed without pointer input. Drawing correctness remains self-reviewed."
        error={typedFallbackError}
        required
      >
        <Input
          maxLength={2_000}
          onChange={(event) => onTypedFallbackChange(event.target.value)}
          required
          value={typedFallback}
        />
      </FormField>
      <Button
        onClick={() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const link = document.createElement("a");
          link.download = "drawing-reference.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
        }}
        variant="secondary"
      >
        Export local reference image
      </Button>
    </div>
  );
}
