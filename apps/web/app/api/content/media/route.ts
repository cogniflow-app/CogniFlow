import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument } from "@/lib/server/database-arguments";

const maximumRequestBytes = 10_700_000;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function detectedMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && hex(bytes.slice(0, 8)) === "89504e470d0a1a0a") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (bytes.length >= 3 && new TextDecoder().decode(bytes.slice(0, 3)) === "ID3")
    return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] ?? 0) >> 5 === 0b111) return "audio/mpeg";
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WAVE"
  )
    return "audio/wav";
  if (bytes.length >= 4 && new TextDecoder().decode(bytes.slice(0, 4)) === "OggS")
    return "audio/ogg";
  if (bytes.length >= 4 && hex(bytes.slice(0, 4)) === "1a45dfa3") return "audio/webm";
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp" &&
    ["M4A ", "M4B "].includes(new TextDecoder().decode(bytes.slice(8, 12)))
  )
    return "audio/mp4";
  return null;
}

function declaredBaseMime(value: string): string | null {
  const [rawBase, ...parameters] = value.normalize("NFKC").trim().split(";");
  const base = rawBase?.trim().toLocaleLowerCase();
  if (!base || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(base)) return null;
  const seen = new Set<string>();
  for (const rawParameter of parameters) {
    const match =
      /^\s*([a-z0-9_-]+)\s*=\s*(?:"([a-z0-9._,+-]{1,128})"|([a-z0-9._,+-]{1,128}))\s*$/iu.exec(
        rawParameter,
      );
    const name = match?.[1]?.toLocaleLowerCase();
    if (!match || name !== "codecs" || seen.has(name)) return null;
    seen.add(name);
  }
  return base;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    const length = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) + (bytes[offset + 8] ?? 0),
      };
    }
    if (length < 2) return null;
    offset += length + 2;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const kind = new TextDecoder().decode(bytes.slice(12, 16));
  if (kind === "VP8X") {
    const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
    const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    return { width, height };
  }
  if (kind === "VP8L") {
    const b1 = bytes[21] ?? 0,
      b2 = bytes[22] ?? 0,
      b3 = bytes[23] ?? 0,
      b4 = bytes[24] ?? 0;
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0xf) << 10) | (b3 << 2) | (b2 >> 6)),
    };
  }
  if (kind === "VP8 " && bytes.length >= 30)
    return {
      width: (((bytes[27] ?? 0) << 8) | (bytes[26] ?? 0)) & 0x3fff,
      height: (((bytes[29] ?? 0) << 8) | (bytes[28] ?? 0)) & 0x3fff,
    };
  return null;
}

function imageDimensions(mime: string, bytes: Uint8Array) {
  return mime === "image/png"
    ? pngDimensions(bytes)
    : mime === "image/jpeg"
      ? jpegDimensions(bytes)
      : mime === "image/webp"
        ? webpDimensions(bytes)
        : null;
}

export async function POST(request: NextRequest) {
  const rawLength = request.headers.get("content-length");
  const declaredLength = rawLength ? Number(rawLength) : Number.NaN;
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)
    return apiError(411, {
      code: "INVALID_INPUT",
      message: "A bounded upload size is required before media can be read.",
      retryable: false,
    });
  if (declaredLength > maximumRequestBytes)
    return apiError(413, {
      code: "QUOTA_EXCEEDED",
      message: "This media file is too large.",
      retryable: false,
    });
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "The media upload is invalid.",
      retryable: false,
    });
  }
  const file = form.get("file");
  const kind = form.get("kind");
  const claimedHash = form.get("sha256");
  const idempotencyKey = form.get("idempotencyKey");
  const altText = String(form.get("altText") ?? "")
    .normalize("NFKC")
    .trim();
  const transcript = String(form.get("transcript") ?? "")
    .normalize("NFKC")
    .trim();
  if (
    !(file instanceof File) ||
    (kind !== "image" && kind !== "audio") ||
    typeof claimedHash !== "string" ||
    typeof idempotencyKey !== "string"
  )
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "Choose a supported image or audio file.",
      retryable: false,
    });
  if (
    (kind === "image" && (!altText || altText.length > 1_000)) ||
    (kind === "audio" && (!transcript || transcript.length > 4_000))
  )
    return apiError(422, {
      code: "INVALID_INPUT",
      message:
        kind === "image"
          ? "Add a concise image description."
          : "Add a transcript of up to 4,000 characters.",
      retryable: false,
    });
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = detectedMime(bytes);
  const allowed =
    kind === "image"
      ? ["image/jpeg", "image/png", "image/webp"]
      : ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"];
  if (!mime || !allowed.includes(mime) || declaredBaseMime(file.type) !== mime)
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The file signature does not match a supported media type.",
      retryable: false,
    });
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
  if (digest !== claimedHash.toLocaleLowerCase())
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The media hash did not match the uploaded bytes.",
      retryable: false,
    });
  const dimensions = kind === "image" ? imageDimensions(mime, bytes) : null;
  if (
    kind === "image" &&
    (!dimensions ||
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > 32_768 ||
      dimensions.height > 32_768)
  )
    return apiError(422, {
      code: "INVALID_INPUT",
      message: "The image dimensions could not be verified.",
      retryable: false,
    });
  const registration = await context.database.client.rpc("current_register_media_asset", {
    p_alt_text: nullableRpcArgument(kind === "image" ? altText : null),
    p_byte_size: file.size,
    p_duration_ms: nullableRpcArgument<number>(null),
    p_height: nullableRpcArgument(dimensions?.height ?? null),
    p_idempotency_key: idempotencyKey,
    p_kind: kind,
    p_mime_type: mime,
    p_sha256: digest,
    p_width: nullableRpcArgument(dimensions?.width ?? null),
  });
  if (registration.error || !registration.data)
    return contentDatabaseError(registration.error ?? {}, "The media could not be registered.");
  let asset = registration.data;
  if (asset.status !== "ready") {
    if (asset.status !== "pending")
      return apiError(409, {
        code: "CONFLICT",
        message: "This media reservation is no longer available. Upload the file again.",
        retryable: false,
      });
    const privileged = createPrivilegedDatabaseClient();
    const upload = await privileged.storage
      .from(asset.storage_bucket)
      .upload(asset.storage_path, buffer, { contentType: mime, upsert: true });
    if (upload.error) {
      await privileged.rpc("admin_abandon_media_asset_upload", {
        p_actor_account_id: context.accountId,
        p_idempotency_key: idempotencyKey,
        p_media_asset_id: asset.id,
      });
      return apiError(500, {
        code: "INTERNAL",
        message: "The private upload could not be completed. Retry safely.",
        retryable: true,
      });
    }
    const finalized = await privileged.rpc("admin_finalize_media_asset", {
      p_actor_account_id: context.accountId,
      p_detected_mime_type: mime,
      p_detected_sha256: digest,
      p_idempotency_key: crypto.randomUUID(),
      p_magic_verified: true,
      p_media_asset_id: asset.id,
    });
    if (finalized.error || !finalized.data || finalized.data.status !== "ready")
      return apiError(422, {
        code: "INVALID_INPUT",
        message: "The uploaded bytes failed server verification.",
        retryable: false,
      });
    asset = finalized.data;
  }
  const signed = await context.database.client.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 900);
  return context.database.applyCookies(
    apiSuccess(
      {
        data: {
          altText: asset.alt_text ?? altText,
          id: asset.id,
          kind: asset.kind,
          mimeType: asset.mime_type,
          signedUrl: signed.data?.signedUrl ?? null,
          transcript,
        },
        status: "created" as const,
      },
      201,
    ),
  );
}
