import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isPreview = process.env.VERCEL_ENV === "preview";

  if (isPreview) {
    return { rules: { disallow: "/", userAgent: "*" } };
  }

  return {
    rules: [{ allow: "/", disallow: ["/app", "/auth", "/dev", "/api"], userAgent: "*" }],
  };
}
