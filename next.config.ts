import type { NextConfig } from "next";

type NextConfigWithAllowedOrigins = NextConfig & {
  experimental?: NextConfig["experimental"] & {
    allowedDevOrigins?: string[];
  };
};

const nextConfig: NextConfigWithAllowedOrigins = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "cdn.akamai.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "shared.fastly.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "shared.akamai.steamstatic.com",
      },
    ],
  },
  experimental: {
    allowedDevOrigins: [
      "http://10.0.0.65:3000",
      "http://10.0.0.65",
      "http://localhost:3000",
    ],
  },
};

export default nextConfig;
