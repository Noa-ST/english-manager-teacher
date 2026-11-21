import type { NextConfig } from "next";

/**
 * Remote image hosts allowed by next/image.
 * Media never lives on the app host (SRS §4): images are served from the
 * S3-compatible public bucket (R2 custom domain / S3 / CDN).
 */
function storageRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.STORAGE_PUBLIC_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port,
        pathname: `${url.pathname.replace(/\/$/, "")}/**`,
      },
    ];
  } catch {
    throw new Error(`STORAGE_PUBLIC_URL is not a valid URL: "${raw}"`);
  }
}

function originFromEnvUrl(raw?: string): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

const allowedMediaOrigins = Array.from(
  new Set(
    [
      "https://res.cloudinary.com",
      "https://api.cloudinary.com",
      originFromEnvUrl(process.env.SUPABASE_URL),
      originFromEnvUrl(process.env.STORAGE_PUBLIC_URL),
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

const mediaAndConnectOrigins = allowedMediaOrigins.join(" ");

const contentSecurityPolicy = `
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: ${mediaAndConnectOrigins};
  media-src 'self' blob: ${mediaAndConnectOrigins};
  font-src 'self' data:;
  connect-src 'self' ${mediaAndConnectOrigins};
  frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Rendering model: Cache Components + Partial Prefetching (Next 16 default).
  // Viewer portal -> static shell + `use cache`/cacheLife/cacheTag (the ISR equivalent).
  // Admin dashboard -> request-time (session read behind <Suspense>).
  cacheComponents: true,
  partialPrefetching: true,

  // Compile-time checked <Link href> and router.push targets.
  typedRoutes: true,

  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  images: {
    remotePatterns: storageRemotePatterns(),
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
