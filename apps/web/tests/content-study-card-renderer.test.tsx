import {
  CARD_SCHEMA_VERSION,
  generateCardBlueprints,
  type CardAuthoringData,
  type RichDocument,
} from "@lumen/domain";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudyCardRenderer,
  type RendererMediaSource,
} from "../components/content/study-card-renderer.client";

function rich(text: string): RichDocument {
  return {
    attrs: { language: "en" },
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    schemaVersion: 2,
    type: "doc",
  };
}

function rendererFor(data: CardAuthoringData, index = 0) {
  const renderer = generateCardBlueprints(data)[index]?.renderer;
  if (!renderer) throw new Error(`The ${data.kind} fixture did not generate a study renderer.`);
  return renderer;
}

const rectangle = {
  height: 0.2,
  kind: "rectangle" as const,
  width: 0.3,
  x: 0.1,
  y: 0.2,
};

describe("typed study-card renderer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders signed visual media, normalized masks, and a nonvisual description", () => {
    const renderer = rendererFor({
      imageAlt: "An annotated heart",
      imageAssetId: "heart-image",
      kind: "image_occlusion",
      mode: "hide_one_reveal_others",
      occlusions: [
        {
          altText: "Upper chamber",
          groupKey: "atrium",
          label: "Left atrium",
          semanticKey: "left-atrium",
          shape: rectangle,
        },
      ],
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const media: readonly RendererMediaSource[] = [
      {
        altText: "An annotated heart",
        id: "heart-image",
        kind: "image",
        mimeType: "image/png",
        signedUrl: "https://media.example.test/heart.png?signature=test",
      },
    ];

    const { container, rerender } = render(
      <StudyCardRenderer media={media} renderer={renderer} revealed={false} />,
    );

    expect(screen.getByRole("img", { name: "An annotated heart" })).toHaveAttribute(
      "src",
      media[0]?.signedUrl,
    );
    expect(screen.getByText("Masked region")).toBeVisible();
    expect(container.querySelector(".study-image-region__mask")).toHaveStyle({
      height: "20%",
      left: "10%",
      top: "20%",
      width: "30%",
    });

    rerender(<StudyCardRenderer media={media} renderer={renderer} revealed />);
    expect(screen.getByText("Left atrium")).toBeVisible();
    expect(container.querySelector(".study-image-region__mask")).toBeNull();
  });

  it("renders a discriminated custom audio field from its resolved signed source", () => {
    const renderer = rendererFor({
      fields: {
        Prompt: rich("Listen and identify the organelle"),
        Recording: {
          alt: "Spoken mitochondrion clue",
          assetId: "custom-audio",
          kind: "media",
          mediaKind: "audio",
        },
      },
      kind: "custom",
      schemaVersion: CARD_SCHEMA_VERSION,
      templates: [
        {
          backTemplate: "{{front}}<p>Mitochondrion</p>",
          frontTemplate: "{{Prompt}}{{media Recording}}",
          name: "Audio clue",
          semanticKey: "audio-clue",
        },
      ],
    });
    const media: readonly RendererMediaSource[] = [
      {
        altText: "Spoken mitochondrion clue",
        id: "custom-audio",
        kind: "audio",
        mimeType: "audio/webm",
        signedUrl: "https://media.example.test/custom.webm?signature=test",
      },
    ];

    render(<StudyCardRenderer media={media} renderer={renderer} revealed={false} />);

    expect(screen.getByLabelText("Spoken mitochondrion clue")).toHaveAttribute(
      "src",
      media[0]?.signedUrl,
    );
    expect(screen.queryByRole("img", { name: "Spoken mitochondrion clue" })).toBeNull();
  });

  it("implements hide-all/reveal-one without revealing or unmasking sibling groups", () => {
    const renderer = rendererFor({
      imageAlt: "A two-part cell",
      imageAssetId: "cell-image",
      kind: "image_occlusion",
      mode: "hide_all_reveal_one",
      occlusions: [
        {
          groupKey: "nucleus",
          label: "Nucleus",
          semanticKey: "nucleus-region",
          shape: rectangle,
        },
        {
          groupKey: "membrane",
          label: "Membrane",
          semanticKey: "membrane-region",
          shape: { ...rectangle, x: 0.6 },
        },
      ],
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const { container, rerender } = render(
      <StudyCardRenderer renderer={renderer} revealed={false} />,
    );

    expect(container.querySelectorAll(".study-image-region__mask")).toHaveLength(2);
    rerender(<StudyCardRenderer renderer={renderer} revealed />);
    expect(screen.getByText("Nucleus")).toBeVisible();
    expect(container.querySelectorAll(".study-image-region__mask")).toHaveLength(1);
  });

  it("reveals label-to-region diagram geometry only on the answer side", () => {
    const data: CardAuthoringData = {
      hotspots: [
        {
          aliases: ["powerhouse"],
          altText: "Bean-shaped region in the lower-right of the cell",
          label: "Mitochondrion",
          promptDirection: "both",
          semanticKey: "mitochondrion",
          shape: {
            centerX: 0.5,
            centerY: 0.5,
            kind: "ellipse",
            radiusX: 0.2,
            radiusY: 0.1,
          },
        },
      ],
      imageAlt: "Cell diagram",
      imageAssetId: "cell-diagram",
      kind: "diagram",
      schemaVersion: CARD_SCHEMA_VERSION,
    };
    const labelToRegion = rendererFor(data, 1);
    const { container, rerender } = render(
      <StudyCardRenderer renderer={labelToRegion} revealed={false} />,
    );

    expect(screen.getByText("Mitochondrion")).toBeVisible();
    expect(container.querySelector(".study-image-region__mask")).toBeNull();
    rerender(<StudyCardRenderer renderer={labelToRegion} revealed />);
    expect(container.querySelector('[data-shape="ellipse"]')).toHaveStyle({
      borderRadius: "50%",
    });
  });

  it("renders rich-image annotation layers and constrained, escaped math structure", () => {
    const prompt: RichDocument = {
      content: [
        {
          content: [
            { text: "Energy: ", type: "text" },
            { attrs: { latex: "\\frac{1}{2}mv^2" }, type: "inlineMath" },
          ],
          type: "paragraph",
        },
        {
          attrs: {
            alt: "Annotated cell",
            annotationAssetId: "cell-annotation",
            assetId: "cell-base",
          },
          type: "image",
        },
      ],
      schemaVersion: 2,
      type: "doc",
    };
    const renderer = rendererFor({
      back: rich("Kinetic energy"),
      front: prompt,
      kind: "basic",
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const media: readonly RendererMediaSource[] = [
      {
        altText: "Annotated cell",
        id: "cell-base",
        kind: "image",
        mimeType: "image/png",
        signedUrl: "https://media.example.test/cell.png",
      },
      {
        altText: "Cell labels",
        id: "cell-annotation",
        kind: "image",
        mimeType: "image/png",
        signedUrl: "https://media.example.test/annotation.png",
      },
    ];
    const { container } = render(
      <StudyCardRenderer media={media} renderer={renderer} revealed={false} />,
    );

    expect(screen.getByRole("math", { name: "Math expression: \\frac{1}{2}mv^2" })).toBeVisible();
    expect(container.querySelector(".rich-math__numerator")).toHaveTextContent("1");
    expect(container.querySelector(".rich-math__denominator")).toHaveTextContent("2");
    expect(container.querySelector("sup")).toHaveTextContent("2");
    expect(screen.getByRole("img", { name: "Annotated cell" })).toHaveAttribute(
      "src",
      "https://media.example.test/cell.png",
    );
    expect(container.querySelector(".study-rich-image__annotation")).toHaveAttribute(
      "src",
      "https://media.example.test/annotation.png",
    );
  });

  it("bounds failed signed-media lookups to one settled attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const renderer = rendererFor({
      back: rich("Answer"),
      front: {
        content: [{ attrs: { alt: "Missing diagram", assetId: "missing-asset" }, type: "image" }],
        schemaVersion: 2,
        type: "doc",
      },
      kind: "basic",
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const view = render(<StudyCardRenderer media={[]} renderer={renderer} revealed={false} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    view.rerender(<StudyCardRenderer media={[]} renderer={renderer} revealed />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses radios for one-answer choices and checkboxes for select-all choices", () => {
    const multipleChoice = rendererFor({
      choices: [
        { content: rich("Mars"), isCorrect: true, position: 0, semanticKey: "mars" },
        { content: rich("Venus"), isCorrect: false, position: 1, semanticKey: "venus" },
      ],
      kind: "multiple_choice",
      prompt: rich("Which planet is red?"),
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const { unmount } = render(<StudyCardRenderer renderer={multipleChoice} revealed={false} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    unmount();

    const selectAll = rendererFor({
      choices: [
        { content: rich("2"), isCorrect: true, position: 0, semanticKey: "two" },
        { content: rich("4"), isCorrect: false, position: 1, semanticKey: "four" },
      ],
      kind: "select_all",
      prompt: rich("Select every prime number."),
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    render(<StudyCardRenderer renderer={selectAll} revealed />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("Correct")).toBeVisible();
    expect(screen.getByText("Not correct")).toBeVisible();
  });

  it("offers keyboard-addressable reordering and reveals the canonical sequence", async () => {
    const user = userEvent.setup();
    const renderer = rendererFor({
      kind: "ordering",
      orderingItems: [
        { content: rich("Solid"), position: 0, semanticKey: "solid" },
        { content: rich("Liquid"), position: 1, semanticKey: "liquid" },
        { content: rich("Gas"), position: 2, semanticKey: "gas" },
      ],
      prompt: rich("Order the states of matter."),
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const { rerender } = render(<StudyCardRenderer renderer={renderer} revealed={false} />);

    let items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Gas"),
      expect.stringContaining("Liquid"),
      expect.stringContaining("Solid"),
    ]);
    await user.click(within(items[0]!).getByRole("button", { name: "Move down" }));
    items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Liquid");

    rerender(<StudyCardRenderer renderer={renderer} revealed />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Solid",
      "Liquid",
      "Gas",
    ]);
    expect(screen.queryByRole("button", { name: "Move up" })).not.toBeInTheDocument();
  });

  it("keeps drawing responses local and supplies a typed nonvisual alternative", () => {
    const renderer = rendererFor({
      drawingLayers: [],
      evaluation: "self_review",
      fallbackAnswer: "A triangle with one ninety-degree angle",
      kind: "drawing",
      prompt: rich("Draw a right triangle."),
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const { rerender } = render(<StudyCardRenderer renderer={renderer} revealed={false} />);

    expect(
      screen.getByLabelText("Local drawing response. This preview never uploads or saves it."),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Typed drawing alternative" })).toHaveAttribute(
      "placeholder",
      "A triangle with one ninety-degree angle",
    );
    expect(screen.getByRole("button", { name: "Clear local drawing" })).toBeVisible();

    rerender(<StudyCardRenderer renderer={renderer} revealed />);
    expect(screen.queryByRole("textbox", { name: "Typed drawing alternative" })).toBeNull();
    expect(screen.getByText("A triangle with one ninety-degree angle")).toBeVisible();
  });

  it("sizes the local drawing canvas in device pixels while keeping CSS coordinates", () => {
    const setTransform = vi.fn();
    const context = {
      lineCap: "butt",
      lineJoin: "miter",
      lineWidth: 1,
      setTransform,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    class ImmediateResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      disconnect() {}
      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
    const renderer = rendererFor({
      drawingLayers: [],
      evaluation: "self_review",
      fallbackAnswer: "A square",
      kind: "drawing",
      prompt: rich("Draw a square."),
      schemaVersion: CARD_SCHEMA_VERSION,
    });

    render(<StudyCardRenderer renderer={renderer} revealed={false} />);

    const canvas = screen.getByLabelText(
      "Local drawing response. This preview never uploads or saves it.",
    ) as HTMLCanvasElement;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("renders ordered bitmap and vector drawing reference layers only after reveal", () => {
    const renderer = rendererFor({
      drawingLayers: [
        {
          assetId: "drawing-reference",
          opacity: 0.75,
          position: 0,
          semanticKey: "reference",
          strokes: [
            {
              color: "#112233",
              points: [
                { x: 0.1, y: 0.2 },
                { x: 0.8, y: 0.9 },
              ],
              semanticKey: "guide-stroke",
              width: 4,
            },
          ],
        },
      ],
      evaluation: "self_review",
      fallbackAnswer: "A diagonal guide",
      kind: "drawing",
      prompt: rich("Draw the guide."),
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const media: readonly RendererMediaSource[] = [
      {
        altText: "Reference drawing",
        id: "drawing-reference",
        kind: "image",
        mimeType: "image/png",
        signedUrl: "https://media.example.test/drawing.png",
      },
    ];
    const { container, rerender } = render(
      <StudyCardRenderer media={media} renderer={renderer} revealed={false} />,
    );

    expect(screen.queryByRole("img", { name: "Drawing reference answer" })).toBeNull();
    rerender(<StudyCardRenderer media={media} renderer={renderer} revealed />);
    expect(screen.getByRole("img", { name: "Drawing reference answer" })).toBeVisible();
    expect(container.querySelector(".study-drawing-reference img")).toHaveAttribute(
      "src",
      "https://media.example.test/drawing.png",
    );
    expect(container.querySelector("polyline")).toHaveAttribute("points", "100,200 800,900");
  });

  it("reveals pronunciation fallback text and stops microphone tracks on unmount", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
    );
    class FakeMediaRecorder {
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      state = "inactive";
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const user = userEvent.setup();
    const renderer = rendererFor({
      kind: "pronunciation",
      pronunciationPrompt: {
        fallbackAnswer: "bohn-ZHOOR",
        language: "fr",
        text: "bonjour",
        ttsAllowed: true,
      },
      schemaVersion: CARD_SCHEMA_VERSION,
      selfReview: true,
    });
    const view = render(<StudyCardRenderer renderer={renderer} revealed />);

    expect(screen.getByText(/bohn-ZHOOR/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Record locally" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    expect(screen.getByRole("button", { name: "Stop local recording" })).toBeVisible();
    view.unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("stops a microphone stream that resolves after the pronunciation surface unmounts", async () => {
    const stopTrack = vi.fn();
    let resolveStream:
      | ((stream: { readonly getTracks: () => readonly { readonly stop: () => void }[] }) => void)
      | undefined;
    const pendingStream = new Promise<{
      readonly getTracks: () => readonly { readonly stop: () => void }[];
    }>((resolve) => {
      resolveStream = resolve;
    });
    const getUserMedia = vi.fn().mockReturnValue(pendingStream);
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
    );
    const mediaRecorder = vi.fn();
    vi.stubGlobal("MediaRecorder", mediaRecorder);
    const user = userEvent.setup();
    const renderer = rendererFor({
      kind: "pronunciation",
      pronunciationPrompt: {
        language: "fr",
        text: "bonjour",
        ttsAllowed: true,
      },
      schemaVersion: CARD_SCHEMA_VERSION,
      selfReview: true,
    });
    const view = render(<StudyCardRenderer renderer={renderer} revealed={false} />);

    await user.click(screen.getByRole("button", { name: "Record locally" }));
    view.unmount();
    resolveStream?.({ getTracks: () => [{ stop: stopTrack }] });

    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(mediaRecorder).not.toHaveBeenCalled();
  });

  it("finishes one pronunciation recorder before allowing a restart and ignores stale stop events", async () => {
    const firstStopTrack = vi.fn();
    const secondStopTrack = vi.fn();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce({ getTracks: () => [{ stop: firstStopTrack }] })
      .mockResolvedValueOnce({ getTracks: () => [{ stop: secondStopTrack }] });
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
    );
    class DeferredMediaRecorder {
      static readonly created: DeferredMediaRecorder[] = [];
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      state = "inactive";
      constructor() {
        DeferredMediaRecorder.created.push(this);
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
      }
      finish() {
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", DeferredMediaRecorder);
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first");
    const user = userEvent.setup();
    const renderer = rendererFor({
      kind: "pronunciation",
      pronunciationPrompt: {
        language: "fr",
        text: "bonjour",
        ttsAllowed: true,
      },
      schemaVersion: CARD_SCHEMA_VERSION,
      selfReview: true,
    });
    render(<StudyCardRenderer renderer={renderer} revealed={false} />);

    await user.click(screen.getByRole("button", { name: "Record locally" }));
    await screen.findByRole("button", { name: "Stop local recording" });
    await user.click(screen.getByRole("button", { name: "Stop local recording" }));
    expect(screen.getByRole("button", { name: "Finishing local recording…" })).toBeDisabled();
    expect(getUserMedia).toHaveBeenCalledOnce();

    DeferredMediaRecorder.created[0]?.finish();
    await screen.findByRole("button", { name: "Record locally" });
    await user.click(screen.getByRole("button", { name: "Record locally" }));
    await screen.findByRole("button", { name: "Stop local recording" });
    expect(getUserMedia).toHaveBeenCalledTimes(2);

    DeferredMediaRecorder.created[0]?.finish();
    expect(screen.getByRole("button", { name: "Stop local recording" })).toBeVisible();
    expect(secondStopTrack).not.toHaveBeenCalled();
  });

  it("plays an uploaded audio prompt and speaks its transcript only through local browser TTS", async () => {
    const speak = vi.fn();
    class FakeSpeechSynthesisUtterance {
      lang = "";
      constructor(readonly text: string) {}
    }
    vi.stubGlobal("speechSynthesis", { speak });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);
    const user = userEvent.setup();
    const renderer = rendererFor({
      audioPrompt: {
        answer: rich("Tokyo"),
        assetId: "japan-audio",
        transcript: "What is the capital of Japan?",
      },
      kind: "audio_prompt",
      playbackSpeed: 0.8,
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    const media: readonly RendererMediaSource[] = [
      {
        altText: "Spoken geography question",
        id: "japan-audio",
        kind: "audio",
        mimeType: "audio/webm",
        signedUrl: "https://media.example.test/japan.webm?signature=test",
      },
    ];
    render(<StudyCardRenderer media={media} renderer={renderer} revealed />);

    const audio = screen.getByLabelText("Audio prompt") as HTMLAudioElement;
    expect(audio).toHaveAttribute("src", media[0]?.signedUrl);
    expect(audio.defaultPlaybackRate).toBe(0.8);
    await user.click(screen.getByRole("button", { name: "Play transcript locally" }));

    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0]?.[0]).toMatchObject({ text: "What is the capital of Japan?" });
    expect(screen.getByText("Tokyo")).toBeVisible();
  });

  it("disables transcript speech and explains the fallback when browser TTS is unavailable", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const renderer = rendererFor({
      audioPrompt: {
        answer: rich("Answer"),
        assetId: "audio-asset",
        transcript: "Accessible transcript",
      },
      kind: "audio_prompt",
      playbackSpeed: 1,
      schemaVersion: CARD_SCHEMA_VERSION,
    });

    render(<StudyCardRenderer renderer={renderer} revealed={false} />);

    expect(screen.getByRole("button", { name: "Play transcript locally" })).toBeDisabled();
    expect(screen.getByText("Local voice playback is unavailable in this browser.")).toBeVisible();
    expect(screen.getByText("Accessible transcript")).toBeInTheDocument();
  });
});
