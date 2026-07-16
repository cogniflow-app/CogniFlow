import "server-only";

import { getServerEnvironment } from "@lumen/config/server-env";
import type { Json } from "@lumen/database";

import { hmacSha256Hex } from "./crypto";

export interface VerifiedParentalConsentEvidence {
  readonly evidenceReference: string;
  readonly method: "local_test" | "verified_external";
  readonly policyVersion: string;
  readonly scope: Json;
}

export interface ParentalConsentVerifier {
  verify(input: {
    readonly accountId: string;
    readonly learnerAgeBand: "teen" | "under_13";
  }): Promise<VerifiedParentalConsentEvidence>;
}

const policyVersion = "privacy-2026-07-phase-01";
const maximumVerifierResponseBytes = 8_192;

async function readBoundedResponseText(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let receivedBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    receivedBytes += result.value.byteLength;
    if (receivedBytes > maximumVerifierResponseBytes) {
      await reader.cancel();
      throw new Error("EXTERNAL_CONSENT_NOT_VERIFIED");
    }
    chunks.push(decoder.decode(result.value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

const localTestVerifier: ParentalConsentVerifier = {
  async verify({ accountId, learnerAgeBand }) {
    const evidenceHash = await hmacSha256Hex(
      `local-test-consent\u0000${policyVersion}\u0000${accountId}\u0000${learnerAgeBand}`,
      getServerEnvironment().appEncryptionKey,
    );
    return Object.freeze({
      evidenceReference: `local-test:${evidenceHash.slice(0, 40)}`,
      method: "local_test",
      policyVersion,
      scope: Object.freeze({
        age_band: learnerAgeBand,
        analytics: "minimized",
        child_profile: true,
        public_content: false,
      }),
    });
  },
};

const externalVerifier: ParentalConsentVerifier = {
  async verify({ accountId, learnerAgeBand }) {
    const environment = getServerEnvironment();
    if (!environment.parentalConsentVerifierUrl || !environment.parentalConsentVerifierApiKey) {
      throw new Error("EXTERNAL_CONSENT_VERIFIER_UNAVAILABLE");
    }
    const subjectHash = await hmacSha256Hex(
      `parental-consent\u0000${accountId}`,
      environment.appEncryptionKey,
    );
    let response: Response;
    try {
      response = await fetch(environment.parentalConsentVerifierUrl, {
        body: JSON.stringify({
          learnerAgeBand,
          policyVersion,
          requestedScopes: ["learner_profile"],
          subjectHash,
        }),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${environment.parentalConsentVerifierApiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new Error("EXTERNAL_CONSENT_VERIFIER_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new Error("EXTERNAL_CONSENT_NOT_VERIFIED");
    }
    const serialized = await readBoundedResponseText(response);
    let payload: unknown;
    try {
      payload = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("EXTERNAL_CONSENT_NOT_VERIFIED");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("EXTERNAL_CONSENT_NOT_VERIFIED");
    }
    const record = payload as Readonly<Record<string, unknown>>;
    if (
      record.verified !== true ||
      typeof record.evidenceReference !== "string" ||
      record.evidenceReference.trim().length < 8 ||
      record.evidenceReference.trim().length > 256
    ) {
      throw new Error("EXTERNAL_CONSENT_NOT_VERIFIED");
    }
    return Object.freeze({
      evidenceReference: record.evidenceReference.trim(),
      method: "verified_external",
      policyVersion,
      scope: Object.freeze({
        age_band: learnerAgeBand,
        analytics: "minimized",
        child_profile: true,
        public_content: false,
      }),
    });
  },
};

/**
 * Local/test evidence is deliberately labelled non-production. The external
 * adapter can be exercised in a nonproduction Cloudflare-shaped environment,
 * but the universal production managed-identity gate remains authoritative;
 * an owner checkbox is never treated as verifiable consent.
 */
export function getParentalConsentVerifier(): ParentalConsentVerifier {
  const environment = getServerEnvironment();
  if (!environment.enableChildProfiles || environment.parentalConsentMode === "disabled") {
    throw new Error("CHILD_PROFILES_DISABLED");
  }
  return environment.parentalConsentMode === "test_only" ? localTestVerifier : externalVerifier;
}
