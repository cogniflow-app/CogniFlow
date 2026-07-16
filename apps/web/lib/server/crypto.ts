import "server-only";

const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/** PostgREST's canonical text representation for a Postgres `bytea` value. */
export function bytesToPostgresBytea(bytes: Uint8Array): string {
  return `\\x${bytesToHex(bytes)}`;
}

export async function sha256PostgresBytea(value: string): Promise<string> {
  return bytesToPostgresBytea(await sha256Bytes(value));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }

  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export function createOpaqueToken(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 128) {
    throw new Error("Opaque token length must be an integer from 16 through 128 bytes");
  }
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(await sha256Bytes(value));
}

export async function hmacSha256(value: string, key: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

export async function hmacSha256Hex(value: string, key: string): Promise<string> {
  return bytesToHex(await hmacSha256(value, key));
}

export async function signCompactPayload(payload: string, key: string): Promise<string> {
  const encodedPayload = bytesToBase64Url(encoder.encode(payload));
  const signature = bytesToBase64Url(await hmacSha256(encodedPayload, key));
  return `${encodedPayload}.${signature}`;
}

export async function verifyCompactPayload(token: string, key: string): Promise<string | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra !== undefined) {
    return null;
  }
  const payload = base64UrlToBytes(encodedPayload);
  const signature = base64UrlToBytes(encodedSignature);
  if (!payload || !signature) {
    return null;
  }
  const expected = await hmacSha256(encodedPayload, key);
  if (!constantTimeEqual(signature, expected)) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    return null;
  }
}
