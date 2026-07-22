import "server-only";

import { getServerEnvironment } from "@lumen/config/server-env";

import { hmacSha256Hex } from "./crypto";

export class RequestSecurityError extends Error {
  readonly code: "INVALID_ORIGIN" | "INVALID_REQUEST";

  constructor(code: RequestSecurityError["code"]) {
    super(
      code === "INVALID_ORIGIN" ? "Request origin was not accepted" : "Request was not accepted",
    );
    this.name = "RequestSecurityError";
    this.code = code;
  }
}

function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Enforces same-origin cookie mutations in addition to SameSite cookies. */
export function assertTrustedMutationRequest(request: Request): void {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method.toUpperCase())) {
    throw new RequestSecurityError("INVALID_REQUEST");
  }

  const expected = new URL(getServerEnvironment().public.appUrl).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new RequestSecurityError("INVALID_ORIGIN");
  }
  if (!origin || normalizedOrigin(origin) !== expected) {
    throw new RequestSecurityError("INVALID_ORIGIN");
  }
}

function firstForwardedAddress(value: string | null): string | null {
  const address = value?.split(",")[0]?.trim();
  return address && address.length <= 128 ? address : null;
}

/**
 * Returns a rotating, pseudonymous rate-limit subject. Raw network addresses
 * are neither returned nor persisted.
 */
export async function createRateLimitSubject(
  request: Request,
  scope: string,
  accountId?: string,
): Promise<string> {
  const environment = getServerEnvironment();
  const address =
    environment.vercelRuntime || environment.deploymentProfile === "test"
      ? (firstForwardedAddress(request.headers.get("x-forwarded-for")) ?? "unavailable")
      : environment.deploymentProfile === "cloudflare" && request.headers.has("cf-ray")
        ? (firstForwardedAddress(request.headers.get("cf-connecting-ip")) ?? "unavailable")
        : "unavailable";
  const subject = accountId ? `account:${accountId}` : `network:${address}`;
  return hmacSha256Hex(`${scope}\u0000${subject}`, environment.appEncryptionKey);
}
