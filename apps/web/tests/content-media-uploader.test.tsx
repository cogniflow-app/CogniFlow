import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaUploader } from "../components/content/media-uploader.client";

type RequestListener = () => void;

class FakeXmlHttpRequest {
  static instances: FakeXmlHttpRequest[] = [];
  static latest: FakeXmlHttpRequest | null = null;
  static outcomes: Array<"error" | "success"> = [];

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
    FakeXmlHttpRequest.instances.push(this);
  }

  addEventListener(type: string, listener: RequestListener) {
    this.listeners.set(type, listener);
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.sentBody = body;
    if (FakeXmlHttpRequest.outcomes.shift() === "error") {
      queueMicrotask(() => this.listeners.get("error")?.());
      return;
    }
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

class FakeMediaRecorder {
  static created: FakeMediaRecorder[] = [];

  readonly listeners = new Map<string, Array<(event: Event) => void>>();
  readonly mimeType = "audio/webm";
  state: "inactive" | "recording" = "inactive";

  readonly start = vi.fn(() => {
    this.state = "recording";
  });

  readonly stop = vi.fn(() => {
    this.state = "inactive";
    this.listeners.get("stop")?.forEach((listener) => listener(new Event("stop")));
  });

  constructor(readonly stream: MediaStream) {
    FakeMediaRecorder.created.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolve) throw new Error("Deferred promise was not initialized.");
      resolve(value);
    },
  };
}

function fakeStream(stop: () => void): MediaStream {
  return { getTracks: () => [{ stop }] } as unknown as MediaStream;
}

describe("explicit private media upload", () => {
  beforeEach(() => {
    FakeXmlHttpRequest.instances = [];
    FakeXmlHttpRequest.latest = null;
    FakeXmlHttpRequest.outcomes = [];
    FakeMediaRecorder.created = [];
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
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { mediaDevices: undefined }),
    );
    const user = userEvent.setup();
    render(<MediaUploader kind="audio" label="Reference audio" onUploaded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Record in browser" }));

    expect(screen.getByText(/Recording is unavailable in this browser/i)).toBeVisible();
    expect(screen.queryByText(/Recording locally/i)).not.toBeInTheDocument();
    expect(FakeXmlHttpRequest.latest).toBeNull();
  });

  it("reuses the upload idempotency key after an uncertain network failure", async () => {
    FakeXmlHttpRequest.outcomes = ["error", "success"];
    const onUploaded = vi.fn();
    const user = userEvent.setup();
    render(<MediaUploader kind="audio" label="Retryable audio" onUploaded={onUploaded} />);

    await user.upload(
      screen.getByLabelText("Retryable audio", { selector: "input" }),
      new File([new Uint8Array([1, 2, 3])], "retry.webm", { type: "audio/webm" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Transcript or non-audio fallback" }),
      "Retry transcript",
    );
    await user.click(screen.getByRole("button", { name: "Upload and attach" }));
    await screen.findByText("The connection was interrupted. Retry when you are online.");

    const first = FakeXmlHttpRequest.instances[0]?.sentBody as FormData;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    const second = FakeXmlHttpRequest.instances[1]?.sentBody as FormData;

    expect(second.get("idempotencyKey")).toBe(first.get("idempotencyKey"));
  });

  it("coalesces rapid recording starts and releases the sole active stream on unmount", async () => {
    const permission = deferred<MediaStream>();
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(() => permission.promise);
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
    );
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const view = render(
      <MediaUploader kind="audio" label="Pronunciation recording" onUploaded={vi.fn()} />,
    );
    const record = screen.getByRole("button", { name: "Record in browser" });

    act(() => {
      record.click();
      record.click();
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(screen.getByText("Requesting microphone access…")).toBeVisible();

    await act(async () => {
      permission.resolve(fakeStream(stopTrack));
      await permission.promise;
    });
    expect(FakeMediaRecorder.created).toHaveLength(1);
    expect(FakeMediaRecorder.created[0]?.start).toHaveBeenCalledWith(250);
    expect(stopTrack).not.toHaveBeenCalled();

    view.unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("stops a permission stream that resolves after the uploader has unmounted", async () => {
    const permission = deferred<MediaStream>();
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(() => permission.promise);
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
    );
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const view = render(
      <MediaUploader kind="audio" label="Late microphone" onUploaded={vi.fn()} />,
    );

    screen.getByRole("button", { name: "Record in browser" }).click();
    expect(getUserMedia).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => {
      permission.resolve(fakeStream(stopTrack));
      await permission.promise;
    });

    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(FakeMediaRecorder.created).toHaveLength(0);
  });
});
