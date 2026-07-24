import "server-only";

import type { NextRequest } from "next/server";

import { apiError } from "@/lib/server/api";
import { readBoundedJson } from "@/lib/server/api";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import {
  createNextRouteDatabaseContext,
  type NextRouteDatabaseContext,
} from "@/lib/supabase/server";
import { portabilityInspectInputSchema } from "@/lib/portability/inputs";
import type { PortabilitySource } from "@lumen/import-export";
import { MAX_PORTABILITY_UPLOAD_BYTES } from "@/lib/server/portability-service";

export interface PortabilityMutationContext {
  readonly accountId: string;
  readonly database: NextRouteDatabaseContext;
}

export async function createPortabilityMutationContext(
  request: NextRequest,
): Promise<PortabilityMutationContext | Response> {
  try {
    assertTrustedMutationRequest(request);
    const database = createNextRouteDatabaseContext(request);
    const { data, error } = await database.client.auth.getUser();
    if (error || !data.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to import or export.",
        retryable: false,
      });
    }
    await assertSelfLearnerMutation(request, data.user.id);
    return { accountId: data.user.id, database };
  } catch (error) {
    const forbidden =
      error instanceof Error &&
      ["LEARNER_CONTEXT_UNAVAILABLE", "MANAGED_LEARNER_ACTIVE"].includes(error.message);
    return apiError(forbidden ? 403 : 400, {
      code: forbidden ? "FORBIDDEN" : "INVALID_INPUT",
      message: forbidden
        ? "Import and export are available only from your personal profile."
        : "The request could not be verified.",
      retryable: false,
    });
  }
}

export function isPortabilityContext(
  value: PortabilityMutationContext | Response,
): value is PortabilityMutationContext {
  return !(value instanceof Response);
}

export async function readPortabilitySource(request: NextRequest): Promise<{
  readonly adapterCode?: string;
  readonly source: PortabilitySource;
}> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PORTABILITY_UPLOAD_BYTES + 1_000_000
  ) {
    throw new Error("PORTABILITY_SOURCE_TOO_LARGE");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const text = form.get("text");
    const adapterCode = form.get("adapterCode");
    const archivePassphrase = form.get("archivePassphrase");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PORTABILITY_UPLOAD_BYTES) {
        throw new Error("PORTABILITY_SOURCE_TOO_LARGE");
      }
      return {
        ...(typeof adapterCode === "string" && adapterCode ? { adapterCode } : {}),
        source: {
          ...(typeof archivePassphrase === "string" && archivePassphrase
            ? { archivePassphrase }
            : {}),
          bytes: new Uint8Array(await file.arrayBuffer()),
          declaredMimeType: file.type || undefined,
          fileName: file.name,
        },
      };
    }
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("PORTABILITY_SOURCE_MISSING");
    }
    return {
      ...(typeof adapterCode === "string" && adapterCode ? { adapterCode } : {}),
      source: { fileName: "pasted-cards.txt", text },
    };
  }
  const parsed = portabilityInspectInputSchema.parse(await readBoundedJson(request, 20_500_000));
  return {
    ...(parsed.adapterCode ? { adapterCode: parsed.adapterCode } : {}),
    source: {
      ...(parsed.archivePassphrase ? { archivePassphrase: parsed.archivePassphrase } : {}),
      ...(parsed.declaredMimeType ? { declaredMimeType: parsed.declaredMimeType } : {}),
      ...(parsed.fileName ? { fileName: parsed.fileName } : {}),
      text: parsed.text,
    },
  };
}
