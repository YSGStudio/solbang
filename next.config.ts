import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Post images are uploaded through Server Actions; the 1MB default would
    // reject 4 photos. Matches the 5MB-per-image cap in src/lib/storage.ts.
    serverActions: { bodySizeLimit: "24mb" },
  },
};

export default nextConfig;
