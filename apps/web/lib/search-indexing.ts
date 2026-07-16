type SearchIndexingEnvironment = Readonly<Record<string, string | undefined>>;

/** Beta and ephemeral previews remain private until an explicit launch profile is approved. */
export function shouldPreventSearchIndexing(source: SearchIndexingEnvironment): boolean {
  return (
    source.DEPLOYMENT_PROFILE?.trim() === "vercel_beta" || source.VERCEL_ENV?.trim() === "preview"
  );
}
