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

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const publicRoutes = [
    { path: "/", priority: 1.0, changeFrequency: "daily" as const },
    { path: "/announcements", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/hall-of-fame", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/podcast", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/showcase", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/documents", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/support", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
