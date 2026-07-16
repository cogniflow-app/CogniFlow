import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaUploader } from "../components/content/media-uploader.client";

type RequestListener = () => void;

class FakeXmlHttpRequest {
  static latest: FakeXmlHttpRequest | null = null;

  readonly listeners = new Map<string, RequestListener>();
  readonly open = vi.fn();
  readonly upload = { addEventListener: vi.fn() };
  readonly abort = vi.fn(() => this.listeners.get("abort")?.());
  response: unknown = null;
  responseType = "";
  sentBody: Document | XMLHttpRequestBodyInit | null = null;
  status = 0;

  constructor() {
    FakeXmlHttpRequest.latest = this;
  }

  addEventListener(type: string, listener: RequestListener) {
    this.listeners.set(type, listener);
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.sentBody = body;
    this.status = 201;
    this.response = {
      data: {
        altText: "",
        id: "asset-id",
        kind: "audio",
        mimeType: "audio/webm",
        signedUrl: "blob:private-preview",
        transcript: "A spoken ATP prompt",
      },
    };
    queueMicrotask(() => this.listeners.get("load")?.());
  }
}

describe("explicit private media upload", () => {
  beforeEach(() => {
    FakeXmlHttpRequest.latest = null;
    vi.stubGlobal("XMLHttpRequest", FakeXmlHttpRequest);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:local-review"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps selected audio local until Upload is chosen, then sends its hash and transcript", async () => {
    const onUploaded = vi.fn();
    const user = userEvent.setup();
    render(<MediaUploader kind="audio" label="Audio prompt" onUploaded={onUploaded} />);

    const file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], "prompt.webm", {
      type: "audio/webm",
    });
    await user.upload(screen.getByLabelText("Audio prompt", { selector: "input" }), file);

    expect(screen.getByRole("button", { name: "Upload and attach" })).toBeEnabled();
    expect(FakeXmlHttpRequest.latest).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Transcript or non-audio fallback" }),
    ).toBeRequired();

    await user.type(
      screen.getByRole("textbox", { name: "Transcript or non-audio fallback" }),
      "A spoken ATP prompt",
    );
    await user.click(screen.getByRole("button", { name: "Upload and attach" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    const request = FakeXmlHttpRequest.latest;
    expect(request?.open).toHaveBeenCalledWith("POST", "/api/content/media");
    expect(request?.sentBody).toBeInstanceOf(FormData);
    const form = request?.sentBody as FormData;
    expect(form.get("kind")).toBe("audio");
    expect(form.get("transcript")).toBe("A spoken ATP prompt");
    expect(String(form.get("sha256"))).toMatch(/^[a-f0-9]{64}$/u);
    expect(screen.getByText("Media saved and ready to attach.")).toBeVisible();
  });

  it("reports unavailable browser recording without claiming a recording was saved", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const user = userEvent.setup();
    render(<MediaUploader kind="audio" label="Reference audio" onUploaded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Record in browser" }));

    expect(screen.getByText(/Recording is unavailable in this browser/i)).toBeVisible();
    expect(screen.queryByText(/Recording locally/i)).not.toBeInTheDocument();
    expect(FakeXmlHttpRequest.latest).toBeNull();
  });
});
