import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { DrawingStroke } from "@lumen/domain";

import { DrawingEditor } from "../components/content/drawing-editor.client";
import {
  containedImageBox,
  VisualRegionEditor,
  type VisualRegion,
} from "../components/content/visual-region-editor.client";

const canvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineCap: "round",
  lineJoin: "round",
  lineTo: vi.fn(),
  lineWidth: 1,
  moveTo: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: "#000000",
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => canvasContext as unknown as CanvasRenderingContext2D),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 600,
    height: 600,
    left: 0,
    right: 1_000,
    toJSON: () => ({}),
    top: 0,
    width: 1_000,
    x: 0,
    y: 0,
  });
});

function RegionHarness({
  image = true,
  kind,
}: {
  readonly image?: boolean;
  readonly kind: "diagram" | "occlusion";
}) {
  const [regions, setRegions] = useState<readonly VisualRegion[]>([]);
  const [mode, setMode] = useState<"hide_all_reveal_one" | "hide_one_reveal_others">(
    "hide_one_reveal_others",
  );
  return (
    <>
      <VisualRegionEditor
        imageAlt="A labeled cell"
        imageUrl={image ? "blob:test-image" : null}
        kind={kind}
        mode={mode}
        onChange={setRegions}
        onModeChange={setMode}
        regions={regions}
      />
      <output aria-label="Region count">{regions.length}</output>
      <output aria-label="Reveal mode">{mode}</output>
    </>
  );
}

describe("visual region authoring", () => {
  it("keeps the empty stage compact and disables mask tools before upload", () => {
    const { container } = render(<RegionHarness image={false} kind="occlusion" />);

    expect(container.querySelector(".geometry-stage")).not.toBeInTheDocument();
    expect(screen.getByText("Add an image to start drawing masks.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add rectangle mask" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add ellipse mask" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add polygon mask" })).toBeDisabled();
  });

  it("provides equivalent keyboard controls for creating and editing normalized regions", async () => {
    const user = userEvent.setup();
    render(<RegionHarness kind="diagram" />);

    expect(screen.getByRole("toolbar", { name: "diagram region tools" })).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: /diagram image region canvas.*keyboard alternative/i,
      }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Regions" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add rectangle mask" }));
    expect(screen.getByLabelText("Region count")).toHaveTextContent("1");
    expect(screen.getByRole("spinbutton", { name: "Region 1 x" })).toHaveValue(0.2);
    expect(screen.getByRole("spinbutton", { name: "Region 1 width" })).toHaveValue(0.24);
    await user.clear(screen.getByRole("textbox", { name: "Region 1 label" }));
    await user.type(screen.getByRole("textbox", { name: "Region 1 label" }), "Nucleus");
    await user.type(
      screen.getByRole("textbox", { name: "Region 1 text alternative" }),
      "Large round structure near the center",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Region 1 accepted aliases" }),
      "cell nucleus, nuclear region",
    );
    expect(screen.getByRole("button", { name: "Delete Nucleus" })).toBeVisible();

    await user.clear(screen.getByRole("spinbutton", { name: "Region 1 x" }));
    await user.type(screen.getByRole("spinbutton", { name: "Region 1 x" }), "0.4");
    expect(screen.getByRole("spinbutton", { name: "Region 1 x" })).toHaveValue(0.4);
    await user.click(screen.getByRole("button", { name: "Delete Nucleus" }));
    expect(screen.getByLabelText("Region count")).toHaveTextContent("0");
  });

  it("exposes both occlusion reveal modes without requiring pointer geometry", async () => {
    const user = userEvent.setup();
    render(<RegionHarness kind="occlusion" />);

    await user.click(screen.getByRole("combobox", { name: "Reveal behavior" }));
    await user.click(screen.getByRole("option", { name: "Hide all, reveal one" }));
    expect(screen.getByLabelText("Reveal mode")).toHaveTextContent("hide_all_reveal_one");
    await user.click(screen.getByRole("button", { name: "Add polygon mask" }));
    expect(screen.getByLabelText("Region count")).toHaveTextContent("1");
    expect(screen.getByRole("spinbutton", { name: "Region 1 height" })).toBeVisible();
  });

  it("pans the zoomed image plane in all four directions and resets the view", async () => {
    const user = userEvent.setup();
    const { container } = render(<RegionHarness kind="diagram" />);
    const transform = container.querySelector(".geometry-stage__transform");

    expect(transform).toHaveStyle({ transform: "translate(0px, 0px) scale(1)" });
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Open pan controls" }));
    await user.click(screen.getByRole("button", { name: "Pan up" }));
    await user.click(screen.getByRole("button", { name: "Pan left" }));
    expect(transform).toHaveStyle({ transform: "translate(-16px, -16px) scale(1.25)" });
    await user.click(screen.getByRole("button", { name: "Pan down" }));
    await user.click(screen.getByRole("button", { name: "Pan right" }));
    expect(transform).toHaveStyle({ transform: "translate(0px, 0px) scale(1.25)" });
    await user.click(screen.getByRole("button", { name: "Pan down" }));
    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(transform).toHaveStyle({ transform: "translate(0px, 0px) scale(1)" });
  });

  it("moves the selected region from descendant stage content but ignores mask activation", async () => {
    const user = userEvent.setup();
    const { container } = render(<RegionHarness kind="diagram" />);
    const image = screen.getByRole("img", { name: "A labeled cell" });
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 600 },
      naturalWidth: { configurable: true, value: 1_000 },
    });
    fireEvent.load(image);
    await user.click(screen.getByRole("button", { name: "Add rectangle mask" }));

    fireEvent.doubleClick(image, {
      clientX: 800,
      clientY: 420,
    });

    expect(screen.getByRole("spinbutton", { name: "Region 1 x" })).toHaveValue(0.68);
    expect(screen.getByRole("spinbutton", { name: "Region 1 y" })).toHaveValue(0.61);

    const mask = container.querySelector<HTMLButtonElement>(".geometry-mask");
    expect(mask).not.toBeNull();
    if (!mask) throw new Error("Expected a visual region mask.");
    fireEvent.doubleClick(mask, { clientX: 100, clientY: 100 });
    expect(screen.getByRole("spinbutton", { name: "Region 1 x" })).toHaveValue(0.68);
    expect(screen.getByRole("spinbutton", { name: "Region 1 y" })).toHaveValue(0.61);
  });

  it("expresses polygon points relative to the positioned mask bounding box", async () => {
    const user = userEvent.setup();
    const { container } = render(<RegionHarness kind="occlusion" />);
    const image = screen.getByRole("img", { name: "A labeled cell" });
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 600 },
      naturalWidth: { configurable: true, value: 1_000 },
    });
    fireEvent.load(image);
    await user.click(screen.getByRole("button", { name: "Add polygon mask" }));

    expect(container.querySelector(".geometry-mask")).toHaveStyle({
      clipPath: "polygon(0% 100%, 50% 0%, 100% 100%)",
    });
  });

  it("positions visual masks inside the contained image box instead of its letterboxed stage", async () => {
    expect(containedImageBox(1_000, 500, 1_000, 200)).toEqual({
      height: 200,
      width: 1_000,
      x: 0,
      y: 150,
    });
    const rect = {
      bottom: 500,
      height: 500,
      left: 0,
      right: 1_000,
      toJSON: () => ({}),
      top: 0,
      width: 1_000,
      x: 0,
      y: 0,
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    class ImmediateResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      disconnect() {}
      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
    const region: VisualRegion = {
      aliases: [],
      altText: "Wide image region",
      groupKey: "wide",
      label: "Wide region",
      promptDirection: "region_to_label",
      semanticKey: "wide-region",
      shape: { height: 0.2, kind: "rectangle", width: 0.2, x: 0.4, y: 0.4 },
    };
    const { container } = render(
      <VisualRegionEditor
        imageAlt="A wide labeled structure"
        imageUrl="blob:wide-image"
        kind="diagram"
        onChange={vi.fn()}
        regions={[region]}
      />,
    );
    const image = screen.getByRole("img", { name: "A wide labeled structure" });
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 200 },
      naturalWidth: { configurable: true, value: 1_000 },
    });
    fireEvent.load(image);

    await waitFor(() =>
      expect(container.querySelector(".geometry-image-plane")).toHaveStyle({
        height: "200px",
        left: "0px",
        top: "150px",
        width: "1000px",
      }),
    );
    expect(container.querySelector(".geometry-mask")).toHaveStyle({
      height: "20%",
      left: "40%",
      top: "40%",
      width: "20%",
    });
  });
});

function DrawingHarness() {
  const [strokes, setStrokes] = useState<readonly DrawingStroke[]>([
    {
      color: "#3157d5",
      points: [
        { pressure: 0.5, timeOffsetMs: 0, x: 0.1, y: 0.1 },
        { pressure: 0.5, timeOffsetMs: 30, x: 0.3, y: 0.3 },
      ],
      semanticKey: "stroke-1",
      width: 4,
    },
  ]);
  const [fallback, setFallback] = useState("");
  return (
    <DrawingEditor
      onChange={setStrokes}
      onTypedFallbackChange={setFallback}
      strokes={strokes}
      typedFallback={fallback}
    />
  );
}

describe("drawing response authoring", () => {
  it("requires a nonvisual typed alternative and supports keyboard undo and redo", async () => {
    const user = userEvent.setup();
    render(<DrawingHarness />);

    expect(screen.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
    expect(screen.getByRole("img", { name: /typed alternative is required below/i })).toBeVisible();
    const fallback = screen.getByRole("textbox", { name: "Typed or nonvisual alternative" });
    expect(fallback).toBeRequired();
    await user.type(fallback, "A mitochondrion with a folded inner membrane");
    expect(fallback).toHaveValue("A mitochondrion with a folded inner membrane");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText(/0 saved strokes\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText(/1 saved stroke\./)).toBeVisible();
  });
});
