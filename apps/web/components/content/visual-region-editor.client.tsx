"use client";

import type { NormalizedShape } from "@lumen/domain";
import { Button, FormField, Input, Select } from "@lumen/ui";
import { useMemo, useState, type PointerEvent } from "react";

export interface VisualRegion {
  readonly aliases: readonly string[];
  readonly altText: string;
  readonly groupKey: string;
  readonly label: string;
  readonly promptDirection: "both" | "label_to_region" | "region_to_label";
  readonly semanticKey: string;
  readonly shape: NormalizedShape;
}

interface VisualRegionEditorProps {
  readonly imageAlt: string;
  readonly imageUrl: string | null;
  readonly kind: "diagram" | "occlusion";
  readonly mode?: "hide_all_reveal_one" | "hide_one_reveal_others";
  readonly onChange: (regions: readonly VisualRegion[]) => void;
  readonly onModeChange?: (mode: "hide_all_reveal_one" | "hide_one_reveal_others") => void;
  readonly regions: readonly VisualRegion[];
}

function createRegion(kind: NormalizedShape["kind"], index: number): VisualRegion {
  const shape: NormalizedShape =
    kind === "rectangle"
      ? { kind, x: 0.2, y: 0.2, width: 0.24, height: 0.18 }
      : kind === "ellipse"
        ? { kind, centerX: 0.5, centerY: 0.5, radiusX: 0.14, radiusY: 0.1 }
        : {
            kind,
            points: [
              { x: 0.35, y: 0.62 },
              { x: 0.5, y: 0.35 },
              { x: 0.65, y: 0.62 },
            ],
          };
  return {
    aliases: [],
    altText: "",
    groupKey: `group-${String(index + 1)}`,
    label: `Region ${String(index + 1)}`,
    promptDirection: "region_to_label",
    semanticKey: crypto.randomUUID(),
    shape,
  };
}

function shapeBounds(shape: NormalizedShape) {
  if (shape.kind === "rectangle") {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  if (shape.kind === "ellipse") {
    return {
      x: shape.centerX - shape.radiusX,
      y: shape.centerY - shape.radiusY,
      width: shape.radiusX * 2,
      height: shape.radiusY * 2,
    };
  }
  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function updateShapeBounds(
  shape: NormalizedShape,
  patch: Partial<{ x: number; y: number; width: number; height: number }>,
): NormalizedShape {
  const current = shapeBounds(shape);
  const x = Math.min(0.98, Math.max(0, patch.x ?? current.x));
  const y = Math.min(0.98, Math.max(0, patch.y ?? current.y));
  const width = Math.min(1 - x, Math.max(0.02, patch.width ?? current.width));
  const height = Math.min(1 - y, Math.max(0.02, patch.height ?? current.height));
  if (shape.kind === "rectangle") return { kind: "rectangle", x, y, width, height };
  if (shape.kind === "ellipse") {
    return {
      kind: "ellipse",
      centerX: x + width / 2,
      centerY: y + height / 2,
      radiusX: width / 2,
      radiusY: height / 2,
    };
  }
  const previous = shapeBounds(shape);
  return {
    kind: "polygon",
    points: shape.points.map((point) => ({
      x: x + ((point.x - previous.x) / Math.max(previous.width, 0.001)) * width,
      y: y + ((point.y - previous.y) / Math.max(previous.height, 0.001)) * height,
    })),
  };
}

export function VisualRegionEditor({
  imageAlt,
  imageUrl,
  kind,
  mode = "hide_one_reveal_others",
  onChange,
  onModeChange,
  regions,
}: VisualRegionEditorProps) {
  const [selected, setSelected] = useState<string | null>(regions[0]?.semanticKey ?? null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const selectedRegion = useMemo(
    () => regions.find((region) => region.semanticKey === selected) ?? null,
    [regions, selected],
  );

  function mutateRegion(key: string, patch: Partial<VisualRegion>) {
    onChange(
      regions.map((region) => (region.semanticKey === key ? { ...region, ...patch } : region)),
    );
  }

  function add(shape: NormalizedShape["kind"]) {
    const region = createRegion(shape, regions.length);
    onChange([...regions, region]);
    setSelected(region.semanticKey);
  }

  function moveSelected(event: PointerEvent<HTMLDivElement>) {
    if (!selectedRegion || event.currentTarget !== event.target) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const bounds = shapeBounds(selectedRegion.shape);
    const x = Math.min(
      1 - bounds.width,
      Math.max(0, (event.clientX - rect.left) / rect.width - bounds.width / 2),
    );
    const y = Math.min(
      1 - bounds.height,
      Math.max(0, (event.clientY - rect.top) / rect.height - bounds.height / 2),
    );
    mutateRegion(selectedRegion.semanticKey, {
      shape: updateShapeBounds(selectedRegion.shape, { x, y }),
    });
  }

  return (
    <div className="geometry-author">
      <div className="geometry-toolbar" role="toolbar" aria-label={`${kind} region tools`}>
        <button onClick={() => add("rectangle")} type="button">
          ▭ Rectangle
        </button>
        <button onClick={() => add("ellipse")} type="button">
          ◯ Ellipse
        </button>
        <button onClick={() => add("polygon")} type="button">
          △ Polygon
        </button>
        <button onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} type="button">
          Zoom +
        </button>
        <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} type="button">
          Zoom −
        </button>
        <button onClick={() => setPan((value) => ({ ...value, x: value.x - 5 }))} type="button">
          Pan left
        </button>
        <button onClick={() => setPan((value) => ({ ...value, x: value.x + 5 }))} type="button">
          Pan right
        </button>
        <button onClick={() => setPan({ x: 0, y: 0 })} type="button">
          Reset view
        </button>
      </div>
      {kind === "occlusion" && onModeChange && (
        <FormField label="Reveal behavior">
          <Select
            onValueChange={(value) => onModeChange(value as typeof mode)}
            options={[
              { label: "Hide one, reveal the others", value: "hide_one_reveal_others" },
              { label: "Hide all, reveal one", value: "hide_all_reveal_one" },
            ]}
            value={mode}
          />
        </FormField>
      )}
      <div
        aria-label={`${kind} image region canvas. Select a region below for a keyboard alternative.`}
        className="geometry-stage"
        onDoubleClick={moveSelected}
        role="img"
      >
        <div
          style={{
            height: "100%",
            transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})`,
            transformOrigin: "center",
            width: "100%",
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- this may be a short-lived signed storage URL.
            <img alt={imageAlt} src={imageUrl} />
          ) : (
            <div className="grid min-h-72 place-items-center p-6 text-center text-sm text-[var(--color-text-muted)]">
              Upload or select an image to position regions visually. The complete region list
              remains editable without the image.
            </div>
          )}
          {regions.map((region) => {
            const bounds = shapeBounds(region.shape);
            const clipPath =
              region.shape.kind === "polygon"
                ? `polygon(${region.shape.points.map((point) => `${String(point.x * 100)}% ${String(point.y * 100)}%`).join(",")})`
                : undefined;
            return (
              <button
                aria-label={`Select ${region.label}`}
                className="geometry-mask"
                data-selected={selected === region.semanticKey}
                data-shape={region.shape.kind}
                key={region.semanticKey}
                onClick={() => setSelected(region.semanticKey)}
                style={{
                  clipPath,
                  height: `${String(bounds.height * 100)}%`,
                  left: `${String(bounds.x * 100)}%`,
                  top: `${String(bounds.y * 100)}%`,
                  width: `${String(bounds.width * 100)}%`,
                }}
                type="button"
              />
            );
          })}
        </div>
      </div>

      <section aria-labelledby={`${kind}-regions-heading`}>
        <h3 className="text-base" id={`${kind}-regions-heading`}>
          Accessible region list
        </h3>
        {regions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Add a rectangle, ellipse, or polygon. Every group generates a stable sibling card.
          </p>
        ) : (
          <ol className="mask-list">
            {regions.map((region, index) => {
              const bounds = shapeBounds(region.shape);
              return (
                <li key={region.semanticKey} data-selected={selected === region.semanticKey}>
                  <button
                    aria-label={`Select region ${String(index + 1)}`}
                    className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3"
                    onClick={() => setSelected(region.semanticKey)}
                    type="button"
                  >
                    {String(index + 1)}
                  </button>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <Input
                      aria-label={`Region ${String(index + 1)} label`}
                      maxLength={500}
                      onChange={(event) =>
                        mutateRegion(region.semanticKey, { label: event.target.value })
                      }
                      value={region.label}
                    />
                    <Input
                      aria-label={`Region ${String(index + 1)} text alternative`}
                      maxLength={1_000}
                      onChange={(event) =>
                        mutateRegion(region.semanticKey, { altText: event.target.value })
                      }
                      placeholder="Describe its location"
                      value={region.altText}
                    />
                    <Input
                      aria-label={`Region ${String(index + 1)} group`}
                      maxLength={128}
                      onChange={(event) =>
                        mutateRegion(region.semanticKey, { groupKey: event.target.value })
                      }
                      value={region.groupKey}
                    />
                    {kind === "diagram" && (
                      <>
                        <Input
                          aria-label={`Region ${String(index + 1)} accepted aliases`}
                          onChange={(event) =>
                            mutateRegion(region.semanticKey, {
                              aliases: event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="Aliases, comma separated"
                          value={region.aliases.join(", ")}
                        />
                        <Select
                          aria-label={`Region ${String(index + 1)} prompt direction`}
                          onValueChange={(promptDirection) =>
                            mutateRegion(region.semanticKey, {
                              promptDirection: promptDirection as VisualRegion["promptDirection"],
                            })
                          }
                          options={[
                            { label: "Region → label", value: "region_to_label" },
                            { label: "Label → region", value: "label_to_region" },
                            { label: "Both directions", value: "both" },
                          ]}
                          value={region.promptDirection}
                        />
                      </>
                    )}
                    <div className="grid grid-cols-4 gap-1 sm:col-span-2">
                      {(["x", "y", "width", "height"] as const).map((field) => (
                        <label className="text-xs text-[var(--color-text-muted)]" key={field}>
                          {field}
                          <Input
                            aria-label={`Region ${String(index + 1)} ${field}`}
                            max={1}
                            min={0}
                            onChange={(event) =>
                              mutateRegion(region.semanticKey, {
                                shape: updateShapeBounds(region.shape, {
                                  [field]: Number(event.target.value),
                                }),
                              })
                            }
                            step={0.01}
                            type="number"
                            value={Number(bounds[field].toFixed(3))}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    aria-label={`Delete ${region.label}`}
                    onClick={() => {
                      onChange(
                        regions.filter((candidate) => candidate.semanticKey !== region.semanticKey),
                      );
                      if (selected === region.semanticKey) setSelected(null);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
