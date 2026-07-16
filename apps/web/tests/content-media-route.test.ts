// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyCookies: vi.fn((response: Response) => response),
  createContentMutationContext: vi.fn(),
  createPrivilegedDatabaseClient: vi.fn(),
  createSignedUrl: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("@lumen/database/server", () => ({
  createPrivilegedDatabaseClient: mocks.createPrivilegedDatabaseClient,
}));

vi.mock("@/lib/server/content-route", () => ({
  contentDatabaseError: vi.fn(() => new Response(null, { status: 500 })),
  createContentMutationContext: mocks.createContentMutationContext,
  isMutationContext: (value: unknown) => !(value instanceof Response),
}));

import { POST } from "../app/api/content/media/route";

const endpoint = "http://127.0.0.1:3100/api/content/media";

function rawRequest(contentLength?: string): NextRequest {
  return new NextRequest(endpoint, {
    body: new Uint8Array([1]),
    headers: {
      ...(contentLength === undefined ? {} : { "Content-Length": contentLength }),
      Origin: "http://127.0.0.1:3100",
      "Sec-Fetch-Site": "same-origin",
    },
    method: "POST",
  });
}

function pngBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dimensions = new DataView(bytes.buffer);
  dimensions.setUint32(16, 2);
  dimensions.setUint32(20, 3);
  return bytes;
}

function webmBytes(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]).buffer);
}

describe("bounded media upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example.test/private/image.png?signature=test" },
      error: null,
    });
    mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.rpc.mockResolvedValue({
      data: {
        alt_text: "Two by three test image",
        id: "0190d9f0-0000-7000-8000-000000000099",
        kind: "image",
        mime_type: "image/png",
        status: "ready",
        storage_bucket: "private-media",
        storage_path: "opaque/image.png",
      },
      error: null,
    });
    mocks.createContentMutationContext.mockResolvedValue({
      accountId: "0190d9f0-0000-7000-8000-000000000001",
      database: {
        applyCookies: mocks.applyCookies,
        client: {
          rpc: mocks.rpc,
          storage: { from: mocks.storageFrom },
        },
      },
    });
  });

  it("rejects a missing Content-Length before reading authentication or body bytes", async () => {
    const response = await POST(rawRequest());

    expect(response.status).toBe(411);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT", retryable: false });
    expect(mocks.createContentMutationContext).not.toHaveBeenCalled();
  });

  it.each(["not-a-number", "0", "-20", "1.5"])(
    "rejects malformed Content-Length %s before buffering",
    async (contentLength) => {
      const response = await POST(rawRequest(contentLength));

      expect(response.status).toBe(411);
      expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
      expect(mocks.createContentMutationContext).not.toHaveBeenCalled();
    },
  );

  it("rejects an oversized declared request before authentication or buffering", async () => {
    const response = await POST(rawRequest("10700001"));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "QUOTA_EXCEEDED", retryable: false });
    expect(mocks.createContentMutationContext).not.toHaveBeenCalled();
  });

  it("accepts a bounded, magic-verified upload and returns a short-lived signed URL", async () => {
    const bytes = pngBytes();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    const form = new FormData();
    form.set("altText", "Two by three test image");
    form.set("file", new File([bytes], "dimensions.png", { type: "image/png" }));
    form.set("idempotencyKey", "0190d9f0-0000-7000-8000-000000000010");
    form.set("kind", "image");
    form.set("sha256", digest);
    const request = new NextRequest(endpoint, {
      body: form,
      headers: {
        "Content-Length": "1024",
        Origin: "http://127.0.0.1:3100",
        "Sec-Fetch-Site": "same-origin",
      },
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: {
        altText: "Two by three test image",
        id: "0190d9f0-0000-7000-8000-000000000099",
        kind: "image",
        mimeType: "image/png",
        signedUrl: "https://storage.example.test/private/image.png?signature=test",
      },
      status: "created",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_register_media_asset",
      expect.objectContaining({
        p_byte_size: 24,
        p_height: 3,
        p_kind: "image",
        p_mime_type: "image/png",
        p_sha256: digest,
        p_width: 2,
      }),
    );
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("opaque/image.png", 900);
  });

  it("accepts a safe MediaRecorder codec parameter after verifying the base MIME and magic", async () => {
    const bytes = webmBytes();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    mocks.rpc.mockResolvedValueOnce({
      data: {
        alt_text: null,
        id: "0190d9f0-0000-7000-8000-000000000098",
        kind: "audio",
        mime_type: "audio/webm",
        status: "ready",
        storage_bucket: "private-media",
        storage_path: "opaque/recording.webm",
      },
      error: null,
    });
    const form = new FormData();
    form.set("file", new File([bytes], "recording.webm", { type: "audio/webm;codecs=opus" }));
    form.set("idempotencyKey", "0190d9f0-0000-7000-8000-000000000011");
    form.set("kind", "audio");
    form.set("sha256", digest);
    form.set("transcript", "Local pronunciation sample");
    const request = new NextRequest(endpoint, {
      body: form,
      headers: {
        "Content-Length": "1024",
        Origin: "http://127.0.0.1:3100",
        "Sec-Fetch-Site": "same-origin",
      },
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "current_register_media_asset",
      expect.objectContaining({ p_kind: "audio", p_mime_type: "audio/webm", p_sha256: digest }),
    );
  });

  it("rejects arbitrary MIME parameters even when the base type and magic match", async () => {
    const bytes = webmBytes();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    const form = new FormData();
    form.set("file", new File([bytes], "recording.webm", { type: "audio/webm;profile=unsafe" }));
    form.set("idempotencyKey", "0190d9f0-0000-7000-8000-000000000012");
    form.set("kind", "audio");
    form.set("sha256", digest);
    form.set("transcript", "Local pronunciation sample");
    const response = await POST(
      new NextRequest(endpoint, {
        body: form,
        headers: {
          "Content-Length": "1024",
          Origin: "http://127.0.0.1:3100",
          "Sec-Fetch-Site": "same-origin",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
