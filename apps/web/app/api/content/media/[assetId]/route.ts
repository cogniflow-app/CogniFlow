import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/server/api";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { readonly params: Promise<{ assetId: string }> },
) {
  const database = createNextRouteDatabaseContext(request);
  const { data: auth, error: authError } = await database.client.auth.getUser();
  if (authError || !auth.user)
    return apiError(401, {
      code: "UNAUTHENTICATED",
      message: "Sign in again to view private media.",
      retryable: false,
    });
  const { assetId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(assetId))
    return apiError(404, {
      code: "NOT_FOUND",
      message: "The media attachment is unavailable.",
      retryable: false,
    });
  const result = await database.client
    .rpc("current_get_media_asset", { p_media_asset_id: assetId })
    .maybeSingle();
  if (result.error || !result.data)
    return apiError(404, {
      code: "NOT_FOUND",
      message: "The media attachment is unavailable.",
      retryable: false,
    });
  const signed = await database.client.storage
    .from(result.data.storage_bucket)
    .createSignedUrl(result.data.storage_path, 900);
  if (signed.error || !signed.data.signedUrl)
    return apiError(404, {
      code: "NOT_FOUND",
      message: "The media attachment is unavailable.",
      retryable: true,
    });
  const response = apiSuccess({
    data: {
      altText: result.data.alt_text ?? "",
      id: result.data.media_asset_id,
      kind: result.data.kind,
      mimeType: result.data.mime_type,
      signedUrl: signed.data.signedUrl,
    },
    status: "updated" as const,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return database.applyCookies(response);
}
