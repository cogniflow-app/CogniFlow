import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { DrawingStroke } from "@lumen/domain";

import { DrawingEditor } from "../components/content/drawing-editor.client";
import {
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

function RegionHarness({ kind }: { readonly kind: "diagram" | "occlusion" }) {
  const [regions, setRegions] = useState<readonly VisualRegion[]>([]);
  const [mode, setMode] = useState<"hide_all_reveal_one" | "hide_one_reveal_others">(
    "hide_one_reveal_others",
  );
  return (
    <>
      <VisualRegionEditor
        imageAlt="A labeled cell"
        imageUrl={null}
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
  it("provides equivalent keyboard controls for creating and editing normalized regions", async () => {
    const user = userEvent.setup();
    render(<RegionHarness kind="diagram" />);

    expect(screen.getByRole("toolbar", { name: "diagram region tools" })).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: /diagram image region canvas.*keyboard alternative/i,
      }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Accessible region list" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Rectangle/i }));
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
    await user.click(screen.getByRole("button", { name: /Polygon/i }));
    expect(screen.getByLabelText("Region count")).toHaveTextContent("1");
    expect(screen.getByRole("spinbutton", { name: "Region 1 height" })).toBeVisible();
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
