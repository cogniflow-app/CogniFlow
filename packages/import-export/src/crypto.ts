import { z } from "zod";

import { PortabilityError } from "./errors";
import { canonicalJson, parseSafeJson } from "./safety";

const MAGIC = new TextEncoder().encode("LUMENENC1");
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 600_000;

const envelopeHeaderSchema = z
  .object({
    archiveVersion: z.literal(1),
    cipher: z.literal("AES-256-GCM"),
    kdf: z.literal("PBKDF2-HMAC-SHA-256"),
    iterations: z.literal(PBKDF2_ITERATIONS),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16}$/u),
    salt: z.string().regex(/^[A-Za-z0-9_-]{22}$/u),
  })
  .strict();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12 || passphrase.length > 1024) {
    throw new PortabilityError(
      "encrypted_archive_invalid",
      "Use an archive passphrase between 12 and 1,024 characters.",
    );
  }
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      name: "PBKDF2",
      salt: new Uint8Array(salt).buffer,
    },
    material,
    { length: KEY_LENGTH, name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function concat(...parts: readonly Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function encodeLength(length: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, length, false);
  return bytes;
}

export async function encryptArchive(archive: Uint8Array, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const header = envelopeHeaderSchema.parse({
    archiveVersion: 1,
    cipher: "AES-256-GCM",
    iterations: PBKDF2_ITERATIONS,
    kdf: "PBKDF2-HMAC-SHA-256",
    nonce: base64Url(nonce),
    salt: base64Url(salt),
  });
  const headerBytes = new TextEncoder().encode(canonicalJson(header));
  const prefix = concat(MAGIC, encodeLength(headerBytes.byteLength), headerBytes);
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    {
      additionalData: new Uint8Array(prefix).buffer,
      iv: new Uint8Array(nonce).buffer,
      name: "AES-GCM",
      tagLength: 128,
    },
    key,
    new Uint8Array(archive).buffer,
  );
  return concat(prefix, new Uint8Array(encrypted));
}

export async function decryptArchive(envelope: Uint8Array, passphrase: string) {
  const neutral = () =>
    new PortabilityError(
      "encrypted_archive_invalid",
      "The encrypted archive or passphrase is invalid.",
    );
  if (
    envelope.byteLength < MAGIC.byteLength + 4 + 16 ||
    !MAGIC.every((value, index) => envelope[index] === value)
  ) {
    throw neutral();
  }
  const lengthOffset = MAGIC.byteLength;
  const headerLength = new DataView(
    envelope.buffer,
    envelope.byteOffset + lengthOffset,
    4,
  ).getUint32(0, false);
  if (headerLength < 32 || headerLength > 4096) throw neutral();
  const prefixLength = MAGIC.byteLength + 4 + headerLength;
  if (prefixLength + 16 > envelope.byteLength) throw neutral();
  const headerBytes = envelope.subarray(MAGIC.byteLength + 4, prefixLength);
  let header: z.infer<typeof envelopeHeaderSchema>;
  try {
    header = envelopeHeaderSchema.parse(
      parseSafeJson(new TextDecoder("utf-8", { fatal: true }).decode(headerBytes), 4096),
    );
  } catch {
    throw neutral();
  }
  try {
    const key = await deriveKey(passphrase, fromBase64Url(header.salt));
    const decrypted = await crypto.subtle.decrypt(
      {
        additionalData: new Uint8Array(envelope.subarray(0, prefixLength)).buffer,
        iv: new Uint8Array(fromBase64Url(header.nonce)).buffer,
        name: "AES-GCM",
        tagLength: 128,
      },
      key,
      new Uint8Array(envelope.subarray(prefixLength)).buffer,
    );
    return new Uint8Array(decrypted);
  } catch {
    throw neutral();
  }
}

export function isEncryptedArchive(envelope: Uint8Array) {
  return (
    envelope.byteLength >= MAGIC.byteLength &&
    MAGIC.every((value, index) => envelope[index] === value)
  );
}

export const encryptedArchiveParameters = Object.freeze({
  cipher: "AES-256-GCM",
  iterations: PBKDF2_ITERATIONS,
  kdf: "PBKDF2-HMAC-SHA-256",
});
