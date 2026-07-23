import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/server/api";
import {
  createPortabilityMutationContext,
  isPortabilityContext,
  readPortabilitySource,
} from "@/lib/server/portability-route";
import { inspectPortabilitySource } from "@/lib/server/portability-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = await createPortabilityMutationContext(request);
  if (!isPortabilityContext(context)) return context;
  try {
    const { adapterCode, source } = await readPortabilitySource(request);
    const inspection = await inspectPortabilitySource(source, adapterCode);
    return context.database.applyCookies(apiSuccess({ inspection }));
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "PORTABILITY_SOURCE_TOO_LARGE";
    const magic = error instanceof Error && error.message === "PORTABILITY_MAGIC_MISMATCH";
    return apiError(tooLarge ? 413 : 422, {
      code: tooLarge ? "SOURCE_TOO_LARGE" : magic ? "FILE_TYPE_MISMATCH" : "INVALID_SOURCE",
      message: tooLarge
        ? "Choose a file smaller than 64 MB."
        : magic
          ? "The file contents do not match its extension."
          : "This source could not be inspected. Check the format and try again.",
      retryable: false,
    });
  }
}
