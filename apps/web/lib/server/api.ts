import "server-only";

import { NextResponse } from "next/server";

export interface ApiErrorBody {
  readonly code:
    | "INVALID_INPUT"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "NOT_FOUND"
    | "QUOTA_EXCEEDED"
    | "OFFLINE"
    | "INTERNAL";
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly currentVersion?: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

export function apiError(status: number, body: ApiErrorBody): NextResponse<ApiErrorBody> {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  if (body.retryAfterMs !== undefined) {
    response.headers.set("Retry-After", String(Math.max(1, Math.ceil(body.retryAfterMs / 1000))));
  }
  return response;
}

export function apiSuccess<T extends Readonly<Record<string, unknown>>>(
  body: T,
  status = 200,
): NextResponse<T> {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function readBoundedJson(request: Request, maxBytes = 32_768): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new Error("INVALID_CONTENT_TYPE");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) throw new Error("INVALID_JSON");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let receivedBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    receivedBytes += result.value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(decoder.decode(result.value, { stream: true }));
  }
  chunks.push(decoder.decode());
  const body = chunks.join("");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "RATE_LIMITED") {
    return "Too many attempts. Wait a moment and try again.";
  }
  return "We could not complete that request. Please try again.";
}
