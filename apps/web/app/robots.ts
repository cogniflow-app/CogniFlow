import type { MetadataRoute } from "next";

import { shouldPreventSearchIndexing } from "@/lib/search-indexing";

export default function robots(): MetadataRoute.Robots {
  if (shouldPreventSearchIndexing(process.env)) {
    return { rules: { disallow: "/", userAgent: "*" } };
  }

  return {
    rules: [{ allow: "/", disallow: ["/app", "/auth", "/dev", "/api"], userAgent: "*" }],
  };
}
