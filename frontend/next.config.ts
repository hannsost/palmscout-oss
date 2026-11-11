import type { NextConfig } from "next";
import { publicFlags, publicOrigins } from "./lib/deployment-config.mjs";

const origins = publicOrigins();

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  env: { ...origins, ...publicFlags() },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${origins.NEXT_PUBLIC_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
