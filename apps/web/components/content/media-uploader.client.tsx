"use client";

import { Button, FormField, Input } from "@lumen/ui";
import { useEffect, useRef, useState } from "react";

import { ContentApiRequestError, PendingContentMutations } from "@/lib/content/client-mutations";

export interface UploadedMediaAsset {
  readonly altText: string;
  readonly id: string;
  readonly kind: "audio" | "image";
  readonly mimeType: string;
  readonly signedUrl: string | null;
  readonly transcript: string;
}

interface MediaUploaderProps {
  readonly kind: "audio" | "image";
  readonly label: string;
  readonly onUploaded: (asset: UploadedMediaAsset) => void;
}

async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function preprocessImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file);
  const maximum = 2_400;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/u, ".webp"), {
    lastModified: file.lastModified,
    type: "image/webp",
  });
}

export function MediaUploader({ kind, label, onUploaded }: MediaUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"error" | "idle" | "preparing" | "uploading">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const recordingAttemptRef = useRef(0);
  const recordingPendingRef = useRef(false);
  const pendingMutations = useRef(new PendingContentMutations());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingAttemptRef.current += 1;
      recordingPendingRef.current = false;
      requestRef.current?.abort();
      const recorder = recorderRef.current;
      const stream = streamRef.current;
      recorderRef.current = null;
      streamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // The stream is already stopped; recorder shutdown is best effort during unmount.
        }
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function chooseFile(next: File | null) {
    if (!next) return;
    setState("preparing");
    setMessage(null);
    try {
      const processed = kind === "image" ? await preprocessImage(next) : next;
      if (preview) URL.revokeObjectURL(preview);
      setFile(processed);
      setPreview(URL.createObjectURL(processed));
      setProgress(0);
      setState("idle");
    } catch {
      setState("error");
      setMessage("This file could not be prepared. Choose another supported file.");
    }
  }

  async function upload() {
    if (!file || (kind === "image" && !altText.trim())) {
      setState("error");
      setMessage(
        kind === "image"
          ? "Describe the image before uploading it."
          : "Choose or record audio first.",
      );
      return;
    }
    setState("preparing");
    setMessage(null);
    const hash = await sha256Hex(file);
    if (!mountedRef.current) return;
    const operation = "media-uploader:upload";
    const command = {
      altText: altText.trim(),
      byteSize: file.size,
      fileName: file.name,
      hash,
      kind,
      mimeType: file.type,
      transcript: transcript.trim(),
    } as const;
    const idempotencyKey = pendingMutations.current.acquire(operation, command);
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("sha256", hash);
    body.set("altText", altText.trim());
    body.set("transcript", transcript.trim());
    body.set("idempotencyKey", idempotencyKey);
    const request = new XMLHttpRequest();
    requestRef.current = request;
    request.open("POST", "/api/content/media");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      requestRef.current = null;
      if (request.status < 200 || request.status >= 300) {
        const error = new ContentApiRequestError(
          typeof request.response === "object" && request.response !== null
            ? request.response
            : null,
          "The upload was rejected. Review the file and try again.",
          request.status >= 500,
        );
        pendingMutations.current.settle(operation, idempotencyKey, error);
        if (!mountedRef.current) return;
        setState("error");
        setMessage(
          typeof request.response?.message === "string"
            ? request.response.message
            : "The upload was rejected. Review the file and try again.",
        );
        return;
      }
      const asset = request.response?.data as UploadedMediaAsset | undefined;
      if (!asset?.id) {
        if (!mountedRef.current) return;
        setState("error");
        setMessage("The upload completed without a usable media record.");
        return;
      }
      pendingMutations.current.settle(operation, idempotencyKey);
      if (!mountedRef.current) return;
      setProgress(100);
      setState("idle");
      setMessage("Media saved and ready to attach.");
      onUploaded(asset);
    });
    request.addEventListener("error", () => {
      requestRef.current = null;
      if (!mountedRef.current) return;
      setState("error");
      setMessage("The connection was interrupted. Retry when you are online.");
    });
    request.addEventListener("abort", () => {
      requestRef.current = null;
      if (!mountedRef.current) return;
      setProgress(0);
      setState("idle");
      setMessage("Upload canceled. The file has not been attached.");
    });
    setState("uploading");
    request.send(body);
  }

  async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("error");
      setMessage("Recording is unavailable in this browser. You can upload an audio file instead.");
      return;
    }
    if (recordingPendingRef.current || recorderRef.current || streamRef.current) return;
    const attempt = recordingAttemptRef.current + 1;
    recordingAttemptRef.current = attempt;
    recordingPendingRef.current = true;
    setRecording(true);
    setMessage("Requesting microphone access…");
    let acquiredStream: MediaStream | null = null;
    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || recordingAttemptRef.current !== attempt) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const stream = acquiredStream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (recorderRef.current !== recorder) return;
        recorderRef.current = null;
        if (!mountedRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void chooseFile(
          new File([blob], `recording-${new Date().toISOString().replaceAll(":", "-")}.webm`, {
            type: blob.type,
          }),
        );
        setRecording(false);
      });
      recorderRef.current = recorder;
      streamRef.current = stream;
      recordingPendingRef.current = false;
      recorder.start(250);
      setMessage("Recording locally. Stop and review it before choosing Upload.");
    } catch {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (!mountedRef.current || recordingAttemptRef.current !== attempt) return;
      recorderRef.current = null;
      streamRef.current = null;
      recordingPendingRef.current = false;
      setRecording(false);
      setState("error");
      setMessage("Microphone access was not available. No recording was saved.");
    }
  }

  function stopRecording() {
    if (recordingPendingRef.current) {
      recordingAttemptRef.current += 1;
      recordingPendingRef.current = false;
      setRecording(false);
      setMessage("Microphone request canceled. No recording was saved.");
      return;
    }
    const recorder = recorderRef.current;
    if (recorder?.state !== "inactive") recorder?.stop();
    setRecording(false);
  }

  const accept =
    kind === "image"
      ? "image/png,image/jpeg,image/webp"
      : "audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav";
  return (
    <section className="grid gap-4" aria-label={label}>
      <FormField
        label={label}
        description={
          kind === "image"
            ? "Images are resized and compressed locally, then verified again before private storage. SVG and uploaded video are not accepted."
            : "Audio stays local until you explicitly upload it. Include a transcript for an accessible fallback."
        }
      >
        <Input
          accept={accept}
          disabled={state === "uploading"}
          onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </FormField>
      {kind === "audio" && (
        <div className="flex flex-wrap gap-2">
          {recording ? (
            <Button onClick={stopRecording} variant="danger">
              Stop recording
            </Button>
          ) : (
            <Button onClick={() => void beginRecording()} variant="secondary">
              Record in browser
            </Button>
          )}
        </div>
      )}
      {preview && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview is not an optimizable network image.
        <img
          className="max-h-72 w-full rounded-[var(--radius-lg)] object-contain"
          src={preview}
          alt={altText || "Selected image preview"}
        />
      )}
      {preview && kind === "audio" && (
        <audio className="w-full" controls preload="metadata" src={preview}>
          Your browser cannot play this preview. Use the transcript below.
        </audio>
      )}
      {kind === "image" ? (
        <FormField label="Image description" required>
          <Input
            maxLength={1_000}
            onChange={(event) => setAltText(event.target.value)}
            required
            value={altText}
          />
        </FormField>
      ) : (
        <FormField label="Transcript or non-audio fallback" required>
          <Input
            maxLength={4_000}
            onChange={(event) => setTranscript(event.target.value)}
            required
            value={transcript}
          />
        </FormField>
      )}
      {state === "uploading" && (
        <div>
          <div className="mb-1 flex justify-between text-sm text-[var(--color-text-muted)]">
            <span>Uploading</span>
            <span>{progress}%</span>
          </div>
          <progress className="w-full" max={100} value={progress}>
            {progress}%
          </progress>
        </div>
      )}
      {message && (
        <p
          aria-live="polite"
          className={`m-0 text-sm ${state === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"}`}
        >
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!file} loading={state === "preparing"} onClick={() => void upload()}>
          Upload and attach
        </Button>
        {state === "uploading" && (
          <Button onClick={() => requestRef.current?.abort()} variant="secondary">
            Cancel upload
          </Button>
        )}
        {state === "error" && file && (
          <Button onClick={() => void upload()} variant="secondary">
            Retry
          </Button>
        )}
      </div>
    </section>
  );
}
