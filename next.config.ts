import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Post images are uploaded through Server Actions; the 1MB default would
    // reject 4 photos. Matches the 5MB-per-image cap in src/lib/storage.ts.
    serverActions: { bodySizeLimit: "24mb" },
  },
  // pdfkit 과 그 의존성(fontkit 등)은 내부적으로 eval 을 쓴다. Next 번들에
  // 들어가면 "Code generation from strings disallowed" 로 죽으므로, 번들에서
  // 빼고 런타임에 node_modules 에서 그대로 require 하게 한다.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/share/[id]/tips-pdf": [
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff",
    ],
  },
};

export default nextConfig;
