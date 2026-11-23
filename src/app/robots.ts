import type { MetadataRoute } from "next";

function getBaseUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/students",
          "/classes",
          "/schedule",
          "/attendance",
          "/grades",
          "/teaching-journal",
          "/class-analytics",
          "/cms",
          "/storage",
          "/settings",
          "/student",
          "/login",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
